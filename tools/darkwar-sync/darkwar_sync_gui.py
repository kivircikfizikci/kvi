from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import queue
import subprocess
import sys
import threading
import tkinter as tk
from tkinter import ttk
import urllib.request
import urllib.error

import darkwar_sync


DEFAULT_SITE = "https://kivircikfizikci.github.io/kvi/"


def worker_mode():
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--worker", action="store_true")
    parser.add_argument("--site-url", default=DEFAULT_SITE)
    args, remaining = parser.parse_known_args()
    if not args.worker:
        return False
    sys.argv = [sys.argv[0], "--site-url", args.site_url, *remaining]
    try:
        darkwar_sync.main()
    except darkwar_sync.SyncError as error:
        print(f"[ERROR] {error}", flush=True)
        raise SystemExit(1)
    return True


class SyncWindow:
    def __init__(self, site_url: str):
        self.site_url = site_url
        self.messages: queue.Queue[str] = queue.Queue()
        self.process: subprocess.Popen[str] | None = None
        self.closing = False
        self.root = tk.Tk()
        self.root.title("KVI Dark War Sync")
        self.root.geometry("760x720")
        self.root.minsize(680, 650)
        self.root.configure(bg="#090c12")
        self.root.protocol("WM_DELETE_WINDOW", self.stop)
        self.build_ui()
        self.start_worker()
        self.root.after(100, self.poll_messages)

    def build_ui(self):
        style = ttk.Style(self.root)
        style.theme_use("clam")
        style.configure("Primary.TButton", background="#f27932", foreground="#17100b", borderwidth=0, padding=(18, 11), font=("Segoe UI", 10, "bold"))
        style.map("Primary.TButton", background=[("active", "#ff9555")])
        style.configure("Secondary.TButton", background="#18202c", foreground="#e8edf5", borderwidth=1, padding=(16, 10), font=("Segoe UI", 10))
        style.map("Secondary.TButton", background=[("active", "#253143")])

        header = tk.Frame(self.root, bg="#10151e", height=82)
        header.pack(fill="x")
        header.pack_propagate(False)
        tk.Label(header, text="KVI", bg="#2a170f", fg="#ff9a5a", font=("Segoe UI", 14, "bold"), width=5, height=2).pack(side="left", padx=(22, 14), pady=16)
        titles = tk.Frame(header, bg="#10151e")
        titles.pack(side="left", pady=16)
        tk.Label(titles, text="DARK WAR SYNC", bg="#10151e", fg="#ff9a5a", font=("Segoe UI", 9, "bold")).pack(anchor="w")
        tk.Label(titles, text="Alliance & State Data Companion", bg="#10151e", fg="#e8edf5", font=("Segoe UI", 16, "bold")).pack(anchor="w")

        body = tk.Frame(self.root, bg="#090c12")
        body.pack(fill="both", expand=True, padx=24, pady=20)
        status_card = tk.Frame(body, bg="#10151e", highlightbackground="#2a3545", highlightthickness=1)
        status_card.pack(fill="x")
        self.dot = tk.Label(status_card, text="●", bg="#10151e", fg="#f6bd60", font=("Segoe UI", 18))
        self.dot.pack(side="left", padx=(18, 12), pady=16)
        status_text = tk.Frame(status_card, bg="#10151e")
        status_text.pack(side="left", fill="x", expand=True, pady=14)
        self.status = tk.Label(status_text, text="Starting helper...", bg="#10151e", fg="#e8edf5", font=("Segoe UI", 12, "bold"))
        self.status.pack(anchor="w")
        self.detail = tk.Label(status_text, text="Checking Dark War and local connection", bg="#10151e", fg="#8b96a8", font=("Segoe UI", 9))
        self.detail.configure(wraplength=540, justify="left")
        self.detail.pack(anchor="w", pady=(3, 0))

        capture_actions = tk.Frame(body, bg="#090c12")
        capture_actions.pack(fill="x", pady=(16, 4))
        self.start_capture_button = ttk.Button(capture_actions, text="Start capture", style="Primary.TButton", command=self.start_capture)
        self.start_capture_button.pack(side="left", fill="x", expand=True)
        self.finish_capture_button = ttk.Button(capture_actions, text="Finish & save JSON", style="Secondary.TButton", command=self.finish_capture, state="disabled")
        self.finish_capture_button.pack(side="left", fill="x", expand=True, padx=(10, 0))

        results = tk.Frame(body, bg="#10151e", highlightbackground="#2a3545", highlightthickness=1)
        results.pack(fill="x", pady=(16, 0))
        tk.Label(results, text="CAPTURE RESULTS", bg="#10151e", fg="#ff9a5a", font=("Segoe UI", 9, "bold")).pack(anchor="w", padx=14, pady=(11, 5))
        self.result_labels = {}
        for key, title in [
            ("allianceMembers", "Alliance members, power & ranks"),
            ("statePlayers", "State player power ranking"),
            ("statePlayerKills", "State player kill ranking"),
            ("stateAlliances", "Alliance power ranking"),
            ("stateAllianceKills", "Alliance kill ranking"),
            ("archive", "Raw & decoded analysis archive"),
        ]:
            row = tk.Frame(results, bg="#10151e")
            row.pack(fill="x", padx=14, pady=3)
            dot = tk.Label(row, text="●", bg="#10151e", fg="#596579", font=("Segoe UI", 10))
            dot.pack(side="left", padx=(0, 8))
            tk.Label(row, text=title, bg="#10151e", fg="#c3ccd9", font=("Segoe UI", 9), width=31, anchor="w").pack(side="left")
            detail = tk.Label(row, text="Waiting for capture", bg="#10151e", fg="#8b96a8", font=("Segoe UI", 9), anchor="w")
            detail.pack(side="left", fill="x", expand=True)
            self.result_labels[key] = (dot, detail)
        tk.Frame(results, bg="#10151e", height=7).pack()

        steps = tk.Frame(body, bg="#090c12")
        steps.pack(fill="x", pady=(20, 8))
        tk.Label(steps, text="HOW TO SYNC", bg="#090c12", fg="#ff9a5a", font=("Segoe UI", 9, "bold")).pack(anchor="w", pady=(0, 9))
        for number, text in [("1", "Click Start capture here or in the Alliance tab; wait for Listening."), ("2", "Open Alliance > Members (not ranking), then State player power and alliance power."), ("3", "Click Finish & save JSON. Captured categories are imported even if another is missing.")]:
            row = tk.Frame(steps, bg="#090c12")
            row.pack(fill="x", pady=4)
            tk.Label(row, text=number, bg="#202936", fg="#ff9a5a", font=("Segoe UI", 9, "bold"), width=3).pack(side="left")
            tk.Label(row, text=text, bg="#090c12", fg="#c3ccd9", font=("Segoe UI", 9), anchor="w").pack(side="left", padx=10)

        self.log = tk.Label(body, text="", bg="#0d131c", fg="#8b96a8", font=("Consolas", 9), anchor="w", justify="left", padx=12, pady=8)
        self.log.configure(wraplength=620)
        self.log.pack(fill="x", pady=(10, 14))
        actions = tk.Frame(body, bg="#090c12")
        actions.pack(fill="x", side="bottom")
        ttk.Button(actions, text="Stop helper", style="Secondary.TButton", command=self.stop).pack(side="right")
        ttk.Button(actions, text="Open KVI Planner", style="Primary.TButton", command=self.open_planner).pack(side="right", padx=(0, 10))
        ttk.Button(actions, text="Open saved files", style="Secondary.TButton", command=self.open_saved_folder).pack(side="left")

    def worker_command(self):
        if getattr(sys, "frozen", False):
            return [sys.executable, "--worker", "--site-url", self.site_url]
        return [sys.executable, str(Path(__file__).with_name("darkwar_sync.py")), "--site-url", self.site_url]

    def start_worker(self):
        self.process = subprocess.Popen(self.worker_command(), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace", creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        threading.Thread(target=self.read_output, daemon=True).start()

    def read_output(self):
        assert self.process and self.process.stdout
        for line in self.process.stdout:
            if line.strip():
                self.messages.put(line.strip())
        code = self.process.wait()
        self.messages.put(f"__EXIT__:{code}")

    def set_status(self, title: str, detail: str, color: str):
        self.status.configure(text=title)
        self.detail.configure(text=detail)
        self.dot.configure(fg=color)

    def reset_capture_results(self):
        for dot, detail in self.result_labels.values():
            dot.configure(fg="#596579")
            detail.configure(text="Waiting for capture", fg="#8b96a8")

    def show_capture_results(self, result: dict):
        summary = result.get("captureSummary", {})
        players = result.get("players", [])
        alliance_tag = next((str(player.get("allianceTag") or "") for player in players if player.get("allianceTag")), "")
        prefix = f"[{alliance_tag}] " if alliance_tag else ""
        values = {
            "allianceMembers": (int(summary.get("allianceMembers") or 0), f"{prefix}{int(summary.get('allianceMembers') or 0)} members read"),
            "statePlayers": (int(summary.get("statePlayers") or 0), f"{int(summary.get('statePlayers') or 0)} ranked players read"),
            "statePlayerKills": (int(summary.get("statePlayerKills") or 0), f"{int(summary.get('statePlayerKills') or 0)} player kill rows read"),
            "stateAlliances": (int(summary.get("stateAlliances") or 0), f"{int(summary.get('stateAlliances') or 0)} ranked alliances read"),
            "stateAllianceKills": (int(summary.get("stateAllianceKills") or 0), f"{int(summary.get('stateAllianceKills') or 0)} alliance kill rows read"),
        }
        requested = set(summary.get("requestedCommands", []))
        expected_commands = {
            "allianceMembers": {"al.rank"},
            "statePlayers": {"server.rank", "building.rank"},
            "statePlayerKills": {"kill.rank"},
            "stateAlliances": {"alliance.rank"},
            "stateAllianceKills": {"kill.al.rank"},
        }
        for key, (count, text) in values.items():
            dot, detail = self.result_labels[key]
            dot.configure(fg="#61d095" if count else "#ff6b73")
            request_seen = bool(requested & expected_commands[key])
            missing_text = "Request seen · response incomplete" if request_seen else "Not read · reopen this screen during capture"
            detail.configure(text=text if count else missing_text, fg="#8ee2b5" if count else "#ff9ba2")
        dot, detail = self.result_labels["archive"]
        decoded = int(summary.get("decodedResponses") or 0)
        packets = int(summary.get("capturedPackets") or 0)
        dot.configure(fg="#61d095" if packets else "#ff6b73")
        detail.configure(text=f"{packets} packets · {decoded} decoded responses saved", fg="#8ee2b5" if packets else "#ff9ba2")
        core_total = sum(int(summary.get(key) or 0) for key in ("allianceMembers", "statePlayers", "stateAlliances"))
        missing = summary.get("missing", [])
        if not core_total:
            self.set_status("Capture incomplete", "Ranking requests were seen, but their complete responses were not captured. Reopen each list, wait for it to load, then finish.", "#ff6b73")
        elif missing:
            self.set_status("Capture partially complete", "Saved everything read. Red rows must be reopened in a new capture.", "#f6bd60")
        else:
            self.set_status("Capture complete", "All core ranking categories were read and saved", "#61d095")

    def poll_messages(self):
        try:
            while True:
                message = self.messages.get_nowait()
                if message.startswith("[READY]"):
                    self.set_status("Connected", "KVI Planner is open and the helper is ready", "#61d095")
                    self.start_capture_button.configure(state="normal")
                elif message.startswith("[CAPTURING]"):
                    self.set_status("Listening for game data", "Open alliance members and both State power rankings", "#62a5ff")
                    self.reset_capture_results()
                    self.start_capture_button.configure(state="disabled")
                    self.finish_capture_button.configure(state="normal")
                elif message.startswith("[COMPLETE]"):
                    self.set_status("Capture complete", "JSON is ready for browser import or manual upload", "#61d095")
                    self.start_capture_button.configure(state="normal")
                    self.finish_capture_button.configure(state="disabled")
                elif message.startswith("[SAVED]"):
                    path = message.split("]", 1)[-1].strip()
                    self.log.configure(text=f"Saved JSON: {path}")
                elif message.startswith("__CAPTURE_RESULT__:"):
                    self.show_capture_results(json.loads(message.split(":", 1)[1]))
                elif message.startswith("[ACTION NEEDED]") or message.startswith("[ERROR]"):
                    self.set_status("Action needed", message.split("]", 1)[-1].strip(), "#ff6b73")
                    self.start_capture_button.configure(state="normal")
                    self.finish_capture_button.configure(state="disabled")
                elif message.startswith("__REQUEST_ERROR__:"):
                    self.set_status("Action needed", message.split(":", 1)[1], "#ff6b73")
                    self.start_capture_button.configure(state="normal")
                    self.finish_capture_button.configure(state="disabled")
                elif message.startswith("__EXIT__:"):
                    code = int(message.split(":", 1)[1])
                    if code and not self.closing:
                        self.set_status("Helper stopped", "Review the message above, then start the app again", "#ff6b73")
                else:
                    self.log.configure(text=message[:100])
        except queue.Empty:
            pass
        if self.root.winfo_exists():
            self.root.after(100, self.poll_messages)

    def open_planner(self):
        if not darkwar_sync.reconnect_existing(self.site_url):
            self.set_status("Not connected", "Wait a moment and try Open KVI Planner again", "#f6bd60")

    def capture_request(self, path: str):
        def request_worker():
            try:
                connection = json.loads(darkwar_sync.CONNECTION_FILE.read_text(encoding="utf-8"))
                request = urllib.request.Request(
                    f"{connection['url']}{path}",
                    method="POST",
                    headers={"X-KVI-Sync-Token": connection["token"]},
                )
                response_body = urllib.request.urlopen(request, timeout=90).read()
                if path == "/capture/finish":
                    self.messages.put(f"__CAPTURE_RESULT__:{response_body.decode('utf-8')}")
            except urllib.error.HTTPError as error:
                try:
                    detail = json.loads(error.read().decode("utf-8")).get("error", str(error))
                except Exception:
                    detail = str(error)
                self.messages.put(f"__REQUEST_ERROR__:{detail}")
            except Exception as error:
                self.messages.put(f"__REQUEST_ERROR__:{error}")
        threading.Thread(target=request_worker, daemon=True).start()

    def start_capture(self):
        self.set_status("Starting capture...", "Preparing Windows packet capture", "#f6bd60")
        self.start_capture_button.configure(state="disabled")
        self.capture_request("/capture/start")

    def finish_capture(self):
        self.set_status("Reading captured data...", "The JSON will be saved to your Desktop", "#f6bd60")
        self.finish_capture_button.configure(state="disabled")
        self.capture_request("/capture/finish")

    def open_saved_folder(self):
        folder = darkwar_sync.desktop_directory() / "KVI Dark War Sync"
        folder.mkdir(parents=True, exist_ok=True)
        os.startfile(folder)

    def request_shutdown(self):
        try:
            connection = json.loads(darkwar_sync.CONNECTION_FILE.read_text(encoding="utf-8"))
            request = urllib.request.Request(f"{connection['url']}/shutdown", method="POST", headers={"X-KVI-Sync-Token": connection["token"]})
            urllib.request.urlopen(request, timeout=3).read()
        except Exception:
            if self.process and self.process.poll() is None:
                self.process.terminate()

    def stop(self):
        if self.closing:
            return
        self.closing = True
        self.set_status("Stopping...", "Ending local capture safely", "#f6bd60")
        threading.Thread(target=self.request_shutdown, daemon=True).start()
        self.root.after(1200, self.close_window)

    def close_window(self):
        if self.root.winfo_exists():
            self.root.destroy()

    def run(self):
        self.root.mainloop()


def main():
    parser = argparse.ArgumentParser(description="KVI Dark War Sync desktop companion")
    parser.add_argument("--site-url", default=DEFAULT_SITE)
    args = parser.parse_args()
    SyncWindow(args.site_url).run()


if __name__ == "__main__":
    if not worker_mode():
        main()
