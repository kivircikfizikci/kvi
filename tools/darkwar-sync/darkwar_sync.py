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


def reassembled_server_streams(pcap: Path) -> list[bytes]:
    output = run([str(locate_tshark()), "-r", str(pcap), "-Y", f"tcp.srcport=={GAME_PORT} && tcp.len>0", "-T", "fields", "-E", "separator=|", "-e", "tcp.stream", "-e", "tcp.seq", "-e", "tcp.payload"]).stdout
    grouped: dict[str, list[tuple[int, bytes]]] = {}
    for line in output.splitlines():
        parts = line.split("|", 2)
        if len(parts) != 3 or not all(parts):
            continue
        try:
            grouped.setdefault(parts[0], []).append((int(parts[1]), bytes.fromhex(parts[2].replace(":", ""))))
        except ValueError:
            continue
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
                        players.append({"name": name, "power": power, "rank": rank})
                if players:
                    return sorted(players, key=lambda player: player["rank"])
    raise SyncError("No Alliance CP ranking was found. Start capture, reopen Ranking → CP in the game, then finish the import.")


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
        writer = csv.DictWriter(handle, fieldnames=["rank", "name", "power"])
        writer.writeheader()
        writer.writerows(players)
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
            run(["pktmon", "start", "--capture", "--comp", "nics", "--pkt-size", "0", "--file-name", str(self.etl), "--file-size", "64", "--log-mode", "circular"])
            self.capturing = True
            print("\n[CAPTURING] Open Alliance Ranking -> CP in Dark War.", flush=True)
            print("Return to the planner and click Finish & import when the ranking is visible.\n", flush=True)

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
            players = extract_roster(self.pcap)
            json_path, _csv_path = save_roster_snapshot(players)
            print(f"[COMPLETE] Read {len(players)} ranked players. Closing the helper...", flush=True)
            print(f"[SAVED] {json_path}", flush=True)
            return players


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
                    players = service.finish()
                    self.send_json(200, {"players": players, "capturedAt": datetime.now(timezone.utc).isoformat(), "source": "alliance-cp-ranking"})
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
    parser = argparse.ArgumentParser(description="Read the visible Dark War Alliance CP ranking for KVI Planner.")
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
    locate_tshark()
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
