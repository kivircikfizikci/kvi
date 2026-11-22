from __future__ import annotations

import argparse
import base64
import csv
import ctypes
import hashlib
import json
import os
from pathlib import Path
import secrets
import sqlite3
import struct
import subprocess
import tempfile
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import webbrowser
import urllib.request

from Crypto.Cipher import AES
import zstandard as zstd


GAME_PORT = 8816
KEY_MASK = b"apszstdmask2026!"
MASKED_KEY_DATA_INDEX = 39776
ZSTD_MAGIC = bytes.fromhex("28b52ffd")
ALLOWED_ORIGINS = {"https://kivircikfizikci.github.io", "http://localhost:5173", "http://127.0.0.1:5173"}
STATE_DIRECTORY = Path(os.environ.get("LOCALAPPDATA", tempfile.gettempdir())) / "KVIPlannerSync"
CONNECTION_FILE = STATE_DIRECTORY / "connection.json"
MUTEX_NAME = "Local\\KVI-DarkWar-Sync-Helper"


class SyncError(RuntimeError):
    pass


class SyncServer(ThreadingHTTPServer):
    daemon_threads = True


class SfsReader:
    def __init__(self, data: bytes):
        self.data, self.offset = data, 0

    def take(self, size: int) -> bytes:
        value = self.data[self.offset:self.offset + size]
        if len(value) != size:
            raise SyncError("The game response ended unexpectedly.")
        self.offset += size
        return value

    def unpack(self, fmt: str):
        return struct.unpack(fmt, self.take(struct.calcsize(fmt)))[0]

    def text(self) -> str:
        return self.take(self.unpack(">H")).decode("utf-8", "replace")

    def value(self, kind: int):
        scalar = {1: ">B", 2: ">b", 3: ">h", 4: ">i", 5: ">q", 6: ">f", 7: ">d"}
        if kind == 0:
            return None
        if kind in scalar:
            value = self.unpack(scalar[kind])
            return bool(value) if kind == 1 else value
        if kind == 8:
            return self.text()
        if 9 <= kind <= 16:
            return [self.value(kind - 8) for _ in range(self.unpack(">H"))]
        if kind == 17:
            return [self.value(self.unpack(">B")) for _ in range(self.unpack(">H"))]
        if kind == 18:
            result = {}
            for _ in range(self.unpack(">H")):
                key = self.text()
                result[key] = self.value(self.unpack(">B"))
            return result
        raise SyncError(f"Unsupported game data type: {kind}.")


def locate_game_files() -> tuple[Path, Path]:
    game = Path(os.environ.get("LOCALAPPDATA", "")) / "DarkWar" / "Game"
    assembly = game / "GameAssembly.dll"
    metadata = game / "DarkWar_Data" / "il2cpp_data" / "Metadata" / "global-metadata.dat"
    if not assembly.exists() or not metadata.exists():
        raise SyncError("Dark War Windows installation was not found in LocalAppData.")
    return assembly, metadata


def codec_key() -> bytes:
    _assembly, metadata_path = locate_game_files()
    metadata = metadata_path.read_bytes()
    if len(metadata) < 80:
        raise SyncError("Dark War metadata is incomplete.")
    default_data_offset = struct.unpack_from("<I", metadata, 72)[0]
    start = default_data_offset + MASKED_KEY_DATA_INDEX
    masked = metadata[start:start + 32]
    if len(masked) != 32:
        raise SyncError("This Dark War version is not supported by the sync helper yet.")
    material = bytes(value ^ KEY_MASK[index % len(KEY_MASK)] for index, value in enumerate(masked))
    return hashlib.sha256(base64.b64encode(material)).digest()


def locate_tshark() -> Path:
    candidates = [
        Path(os.environ.get("PROGRAMFILES", "")) / "Wireshark" / "tshark.exe",
        Path(os.environ.get("USERPROFILE", "")) / "Desktop" / "WiresharkPortable64" / "App" / "Wireshark" / "tshark.exe",
        Path(os.environ.get("USERPROFILE", "")) / "OneDrive" / "Desktop" / "WiresharkPortable64" / "App" / "Wireshark" / "tshark.exe",
    ]
    if os.environ.get("KVI_TSHARK"):
        candidates.insert(0, Path(os.environ["KVI_TSHARK"]))
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    raise SyncError("Wireshark/TShark was not found. Install Wireshark or set KVI_TSHARK.")


def run(command: list[str]) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(command, text=True, capture_output=True, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    if result.returncode:
        raise SyncError((result.stderr or result.stdout).strip() or f"Command failed: {command[0]}")
    return result


def pcapng_packets(path: Path):
    data, offset, endian = path.read_bytes(), 0, "<"
    while offset + 12 <= len(data):
        block_type = int.from_bytes(data[offset:offset + 4], "little")
        if block_type == 0x0A0D0D0A and offset + 12 <= len(data):
            magic = data[offset + 8:offset + 12]
            endian = "<" if magic == bytes.fromhex("4d3c2b1a") else ">"
        block_type = struct.unpack_from(f"{endian}I", data, offset)[0]
        block_length = struct.unpack_from(f"{endian}I", data, offset + 4)[0]
        if block_length < 12 or offset + block_length > len(data):
            break
        if block_type == 6 and block_length >= 32:
            captured_length = struct.unpack_from(f"{endian}I", data, offset + 20)[0]
            packet_start = offset + 28
            yield data[packet_start:packet_start + captured_length]
        elif block_type == 3 and block_length >= 16:
            packet_length = struct.unpack_from(f"{endian}I", data, offset + 8)[0]
            yield data[offset + 12:offset + 12 + min(packet_length, block_length - 16)]
        offset += block_length


def tcp_segment(packet: bytes):
    for ip_start in range(min(96, max(0, len(packet) - 20))):
        version_ihl = packet[ip_start]
        if version_ihl >> 4 != 4:
            continue
        ip_header_length = (version_ihl & 0x0F) * 4
        if ip_header_length < 20 or ip_start + ip_header_length + 20 > len(packet) or packet[ip_start + 9] != 6:
            continue
        total_length = int.from_bytes(packet[ip_start + 2:ip_start + 4], "big")
        if total_length < ip_header_length + 20 or ip_start + total_length > len(packet):
            continue
        tcp_start = ip_start + ip_header_length
        source_port = int.from_bytes(packet[tcp_start:tcp_start + 2], "big")
        destination_port = int.from_bytes(packet[tcp_start + 2:tcp_start + 4], "big")
        if GAME_PORT not in (source_port, destination_port):
            continue
        tcp_header_length = (packet[tcp_start + 12] >> 4) * 4
        if tcp_header_length < 20 or tcp_start + tcp_header_length > ip_start + total_length:
            continue
        sequence = int.from_bytes(packet[tcp_start + 4:tcp_start + 8], "big")
        payload = packet[tcp_start + tcp_header_length:ip_start + total_length]
        source_ip, destination_ip = packet[ip_start + 12:ip_start + 16], packet[ip_start + 16:ip_start + 20]
        return source_ip, destination_ip, source_port, destination_port, sequence, payload
    return None


def reassembled_server_streams(pcap: Path) -> list[bytes]:
    grouped: dict[tuple[bytes, bytes, int, int], list[tuple[int, bytes]]] = {}
    for packet in pcapng_packets(pcap):
        segment = tcp_segment(packet)
        if not segment:
            continue
        source_ip, destination_ip, source_port, destination_port, sequence, payload = segment
        if source_port != GAME_PORT or not payload:
            continue
        grouped.setdefault((source_ip, destination_ip, source_port, destination_port), []).append((sequence, payload))
    streams = []
    for segments in grouped.values():
        base = min(sequence for sequence, _ in segments)
        end = max(sequence - base + len(payload) for sequence, payload in segments)
        data, covered = bytearray(end), bytearray(end)
        for sequence, payload in sorted(segments):
            start = sequence - base
            for index, value in enumerate(payload):
                if not covered[start + index]:
                    data[start + index], covered[start + index] = value, 1
        streams.append(bytes(data))
    return streams


def reassembled_directional_streams(pcap: Path):
    grouped = {}
    for packet in pcapng_packets(pcap):
        segment = tcp_segment(packet)
        if not segment:
            continue
        source_ip, destination_ip, source_port, destination_port, sequence, payload = segment
        if GAME_PORT not in (source_port, destination_port) or not payload:
            continue
        grouped.setdefault((source_ip, destination_ip, source_port, destination_port), []).append((sequence, payload))
    streams = []
    for key, segments in grouped.items():
        base = min(sequence for sequence, _ in segments)
        end = max(sequence - base + len(payload) for sequence, payload in segments)
        data, covered = bytearray(end), bytearray(end)
        for sequence, payload in sorted(segments):
            start = sequence - base
            for index, value in enumerate(payload):
                if not covered[start + index]:
                    data[start + index], covered[start + index] = value, 1
        streams.append((key, bytes(data)))
    return streams


def decode_frame(payload: bytes, key: bytes) -> bytes:
    transformed, nonce = bytearray(payload), payload[:8]
    aes, prefix_size = AES.new(key, AES.MODE_ECB), min(128, len(payload) - 8)
    for offset in range(0, prefix_size, 16):
        keystream = aes.encrypt(nonce + bytes(7) + bytes([offset // 16]))
        for index in range(min(16, prefix_size - offset)):
            transformed[8 + offset + index] ^= keystream[index]
    transformed[4:8] = ZSTD_MAGIC
    return zstd.ZstdDecompressor().decompress(bytes(transformed[4:]))


def find_rank_list(value):
    if isinstance(value, dict):
        candidate = value.get("rankList")
        if isinstance(candidate, list) and candidate and all(isinstance(row, dict) and {"name", "score", "rank"} <= row.keys() for row in candidate):
            return candidate
        for child in value.values():
            found = find_rank_list(child)
            if found is not None:
                return found
    elif isinstance(value, list):
        for child in value:
            found = find_rank_list(child)
            if found is not None:
                return found
    return None


def extract_roster(pcap: Path) -> list[dict]:
    key = codec_key()
    for stream in reassembled_server_streams(pcap):
        for index, marker in enumerate(stream):
            if marker != 0xA0 or index + 3 > len(stream):
                continue
            length = int.from_bytes(stream[index + 1:index + 3], "big")
            payload = stream[index + 3:index + 3 + length]
            if length < 12 or len(payload) != length:
                continue
            try:
                decoded = decode_frame(payload, key)
                reader = SfsReader(decoded)
                rows = find_rank_list(reader.value(reader.unpack(">B")))
            except Exception:
                continue
            if rows:
                players = []
                for row in rows:
                    name, power, rank = str(row["name"]).strip(), int(row["score"]), int(row["rank"])
                    if name and power >= 0 and 1 <= rank <= 100:
                        players.append({"name": name, "power": power, "rank": rank, "allianceTag": str(row.get("abbr") or ""), "allianceName": str(row.get("allianceName") or ""), "country": row.get("country")})
                if players:
                    return sorted(players, key=lambda player: player["rank"])
    raise SyncError("The game did not send an Alliance CP ranking request during capture. Close the CP ranking screen first, click Start capture, wait for Listening, then reopen Ranking → CP before finishing.")


def parse_sfs(body: bytes):
    reader = SfsReader(body)
    value = reader.value(reader.unpack(">B"))
    if reader.offset != len(body):
        raise SyncError("Unexpected trailing game data.")
    return value


def local_country_by_uid() -> dict[str, str]:
    database = Path(os.environ.get("USERPROFILE", "")) / "AppData" / "LocalLow" / "READYGO" / "DarkWar" / "config.db"
    if not database.is_file():
        return {}
    try:
        with sqlite3.connect(database) as connection:
            return {str(uid): str(nation or "") for uid, nation in connection.execute("select uid,nation from UserInfoData")}
    except sqlite3.Error:
        return {}


def extract_game_data(pcap: Path) -> dict:
    requests = {}
    responses = {}
    key = codec_key()
    for stream_key, stream in reassembled_directional_streams(pcap):
        if stream_key[2] != GAME_PORT:
            for index, marker in enumerate(stream):
                if marker != 0x80 or index + 3 > len(stream):
                    continue
                length = int.from_bytes(stream[index + 1:index + 3], "big")
                body = stream[index + 3:index + 3 + length]
                if not length or len(body) != length:
                    continue
                try:
                    root = parse_sfs(body)
                    envelope = root.get("p", {})
                    command, params = envelope.get("c"), envelope.get("p", {})
                    request_id = params.get("_id") if isinstance(params, dict) else None
                    if command and request_id is not None:
                        requests[request_id] = command
                except Exception:
                    continue
        else:
            for index, marker in enumerate(stream):
                if marker != 0xA0 or index + 3 > len(stream):
                    continue
                length = int.from_bytes(stream[index + 1:index + 3], "big")
                encrypted = stream[index + 3:index + 3 + length]
                if length < 12 or len(encrypted) != length:
                    continue
                try:
                    root = parse_sfs(decode_frame(encrypted, key))
                    payload = root.get("p", {}).get("p", {})
                    request_id = payload.get("_id") if isinstance(payload, dict) else None
                    command = requests.get(request_id)
                    if command in {"al.rank", "server.rank", "alliance.rank"}:
                        responses[command] = payload
                except Exception:
                    continue
    alliance_payload = responses.get("al.rank")
    if not alliance_payload or not isinstance(alliance_payload.get("list"), list):
        raise SyncError("Alliance member data was not captured. Start capture, then reopen the Alliance member/rank list before finishing.")
    country_by_uid = local_country_by_uid()
    alliance_id = str(alliance_payload.get("allianceId") or "")
    alliance_rank_payload = responses.get("alliance.rank", {})
    alliance_rows = alliance_rank_payload.get("allianceRanking", []) if isinstance(alliance_rank_payload, dict) else []
    own_alliance = next((row for row in alliance_rows if str(row.get("uid")) == alliance_id), {})
    alliance_tag, alliance_name = str(own_alliance.get("abbr") or ""), str(own_alliance.get("alliancename") or "")
    players = []
    for row in alliance_payload["list"]:
        player_uid = str(row.get("uid") or "")
        player_rank = int(row.get("rank") or 1)
        if not player_uid or not row.get("name"):
            continue
        players.append({"uid": player_uid, "name": str(row["name"]), "power": int(row.get("power") or 0), "rank": player_rank, "allianceRank": f"R{player_rank}", "mainBuildingLevel": int(row.get("mainCityLv") or 0), "sex": int(row.get("sex") or 0), "country": country_by_uid.get(player_uid, ""), "allianceTag": alliance_tag, "allianceName": alliance_name})
    captured_at = datetime.now(timezone.utc).isoformat()
    result = {"source": "dark-war-game-data", "capturedAt": captured_at, "players": players}
    server_payload = responses.get("server.rank", {})
    server_rows = server_payload.get("serverRanking", []) if isinstance(server_payload, dict) else []
    if server_rows or alliance_rows:
        result["stateSnapshot"] = {"id": captured_at, "capturedAt": captured_at, "playerRanking": [{"uid": str(row.get("uid") or ""), "name": str(row.get("name") or ""), "rank": int(row.get("rank") or 0), "power": int(row.get("power") or 0), "totalKills": int(row.get("armyKill") or row.get("totalKills") or 0) or None, "sex": int(row.get("sex") or 0) or None, "level": int(row.get("lv") or 0) or None, "allianceName": str(row.get("allianceName") or ""), "allianceTag": str(row.get("abbr") or ""), "country": str(row.get("country") or "")} for row in server_rows], "allianceRanking": [{"uid": str(row.get("uid") or ""), "name": str(row.get("alliancename") or ""), "tag": str(row.get("abbr") or ""), "rank": int(row.get("rank") or 0), "power": int(row.get("fightpower") or 0), "leader": str(row.get("leader") or ""), "currentMembers": int(row.get("curMember") or 0), "maxMembers": int(row.get("maxMember") or 0), "country": str(row.get("country") or "")} for row in alliance_rows]}
    return result


def desktop_directory() -> Path:
    candidates = []
    if os.environ.get("OneDrive"):
        candidates.append(Path(os.environ["OneDrive"]) / "Desktop")
    candidates.append(Path.home() / "Desktop")
    return next((path for path in candidates if path.is_dir()), candidates[-1])


def save_roster_snapshot(players: list[dict]) -> tuple[Path, Path]:
    output = desktop_directory() / "KVI Dark War Sync"
    output.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    json_path = output / f"KVI-Roster-{stamp}.json"
    csv_path = output / f"KVI-Roster-{stamp}.csv"
    json_path.write_text(json.dumps({"source": "alliance-cp-ranking", "capturedAt": datetime.now(timezone.utc).isoformat(), "players": players}, ensure_ascii=False, indent=2), encoding="utf-8")
    with csv_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["rank", "name", "power", "allianceTag", "allianceName", "country"])
        writer.writeheader()
        writer.writerows(players)
    return json_path, csv_path


def save_game_snapshot(result: dict) -> tuple[Path, Path]:
    output = desktop_directory() / "KVI Dark War Sync"
    output.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    json_path = output / f"KVI-Game-Data-{stamp}.json"
    csv_path = output / f"KVI-Alliance-Members-{stamp}.csv"
    json_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    fields = ["uid", "name", "allianceRank", "mainBuildingLevel", "power", "sex", "country", "allianceTag", "allianceName"]
    with csv_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(result["players"])
    return json_path, csv_path


class CaptureService:
    def __init__(self):
        self.directory = tempfile.TemporaryDirectory(prefix="kvi-darkwar-sync-")
        self.etl, self.pcap = Path(self.directory.name) / "capture.etl", Path(self.directory.name) / "capture.pcapng"
        self.capturing, self.lock = False, threading.Lock()

    def start(self):
        with self.lock:
            if self.capturing:
                return
            for path in (self.etl, self.pcap):
                if path.exists():
                    path.unlink()
            run(["pktmon", "start", "--capture", "--comp", "nics", "--pkt-size", "0", "--file-name", str(self.etl), "--file-size", "128", "--log-mode", "circular"])
            self.capturing = True
            print("\n[CAPTURING] Open Alliance members, State player power and State alliance power screens.", flush=True)
            print("Return to the planner and click Finish & import after all three screens have loaded.\n", flush=True)

    def stop(self):
        with self.lock:
            if self.capturing:
                try:
                    run(["pktmon", "stop"])
                finally:
                    self.capturing = False

    def finish(self):
        with self.lock:
            if not self.capturing:
                raise SyncError("Capture is not running. Click Start capture first.")
            try:
                run(["pktmon", "stop"])
            finally:
                self.capturing = False
            run(["pktmon", "etl2pcap", str(self.etl), "--out", str(self.pcap)])
            result = extract_game_data(self.pcap)
            json_path, _csv_path = save_game_snapshot(result)
            state = result.get("stateSnapshot", {})
            print(f"[COMPLETE] Read {len(result['players'])} alliance members, {len(state.get('playerRanking', []))} state players and {len(state.get('allianceRanking', []))} alliances. Closing the helper...", flush=True)
            print(f"[SAVED] {json_path}", flush=True)
            return result


def make_handler(service: CaptureService, token: str):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, _format, *_args):
            return

        def end_headers(self):
            origin = self.headers.get("Origin")
            if origin in ALLOWED_ORIGINS:
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Vary", "Origin")
                self.send_header("Access-Control-Allow-Headers", "X-KVI-Sync-Token, Content-Type")
                self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
                self.send_header("Access-Control-Allow-Private-Network", "true")
            self.send_header("Cache-Control", "no-store")
            super().end_headers()

        def send_json(self, status: int, value: dict):
            body = json.dumps(value, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def authorized(self):
            return secrets.compare_digest(self.headers.get("X-KVI-Sync-Token", ""), token)

        def do_OPTIONS(self):
            self.send_response(204)
            self.end_headers()

        def do_GET(self):
            if not self.authorized():
                self.send_json(401, {"error": "Invalid local sync token."})
            elif self.path == "/health":
                self.send_json(200, {"ok": True, "capturing": service.capturing})
            else:
                self.send_json(404, {"error": "Not found."})

        def do_POST(self):
            if not self.authorized():
                self.send_json(401, {"error": "Invalid local sync token."})
                return
            try:
                if self.path == "/capture/start":
                    service.start()
                    self.send_json(200, {"capturing": True})
                elif self.path == "/capture/finish":
                    result = service.finish()
                    self.send_json(200, result)
                    self.wfile.flush()
                    def close_after_response():
                        time.sleep(10)
                        self.server.shutdown()
                    threading.Thread(target=close_after_response, daemon=True).start()
                elif self.path == "/shutdown":
                    service.stop()
                    self.send_json(200, {"stopping": True})
                    self.wfile.flush()
                    threading.Thread(target=self.server.shutdown, daemon=True).start()
                else:
                    self.send_json(404, {"error": "Not found."})
            except SyncError as error:
                print(f"[ACTION NEEDED] {error}", flush=True)
                self.send_json(400, {"error": str(error)})
            except Exception:
                print("[ERROR] The helper encountered an unexpected error.", flush=True)
                self.send_json(500, {"error": "The local sync helper encountered an unexpected error."})

    return Handler


def connection_fragment(url: str, token: str) -> str:
    raw = json.dumps({"url": url, "token": token}, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def open_planner(site_url: str, url: str, token: str):
    webbrowser.open(f"{site_url}#dark-war-sync={connection_fragment(url, token)}")


def reconnect_existing(site_url: str) -> bool:
    try:
        connection = json.loads(CONNECTION_FILE.read_text(encoding="utf-8"))
        request = urllib.request.Request(f"{connection['url']}/health", headers={"X-KVI-Sync-Token": connection["token"]})
        with urllib.request.urlopen(request, timeout=1) as response:
            if response.status != 200:
                return False
        open_planner(site_url, connection["url"], connection["token"])
        return True
    except Exception:
        return False


def main():
    parser = argparse.ArgumentParser(description="Read visible Dark War alliance and state ranking data for KVI Planner.")
    parser.add_argument("--site-url", default="https://kivircikfizikci.github.io/kvi/")
    parser.add_argument("--port", type=int, default=17616)
    args = parser.parse_args()
    ctypes.windll.kernel32.SetConsoleTitleW("KVI Dark War Sync")
    mutex = ctypes.windll.kernel32.CreateMutexW(None, False, MUTEX_NAME)
    if not mutex:
        raise SyncError("Unable to create the local sync lock.")
    if ctypes.windll.kernel32.GetLastError() == 183:
        if reconnect_existing(args.site_url):
            return
        raise SyncError("Dark War Sync is already running. End the existing helper from Task Manager and start it again.")
    locate_game_files()
    token, service = secrets.token_urlsafe(32), CaptureService()
    server = SyncServer(("127.0.0.1", args.port), make_handler(service, token))
    local_url = f"http://127.0.0.1:{args.port}"
    STATE_DIRECTORY.mkdir(parents=True, exist_ok=True)
    CONNECTION_FILE.write_text(json.dumps({"url": local_url, "token": token}), encoding="utf-8")
    print("=" * 52, flush=True)
    print(" KVI DARK WAR SYNC", flush=True)
    print("=" * 52, flush=True)
    print("[READY] Local helper is connected to KVI Planner.", flush=True)
    print("Keep this window open while syncing.", flush=True)
    print("It will close automatically after a successful import.", flush=True)
    print("You can close this window to stop the helper at any time.\n", flush=True)
    open_planner(args.site_url, local_url, token)
    try:
        server.serve_forever()
    finally:
        if service.capturing:
            try:
                run(["pktmon", "stop"])
            except Exception:
                pass
        server.server_close()
        service.directory.cleanup()
        try:
            saved = json.loads(CONNECTION_FILE.read_text(encoding="utf-8"))
            if saved.get("token") == token:
                CONNECTION_FILE.unlink(missing_ok=True)
        except Exception:
            pass
        ctypes.windll.kernel32.CloseHandle(mutex)


if __name__ == "__main__":
    try:
        main()
    except SyncError as error:
        print(f"[ERROR] {error}", flush=True)
        raise SystemExit(1)
