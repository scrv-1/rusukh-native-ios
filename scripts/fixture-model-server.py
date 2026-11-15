#!/usr/bin/env python3
"""Tiny local model stand-in. The first response waits so the UI can cancel it."""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import time

class Handler(BaseHTTPRequestHandler):
    root = Path(".")
    delay = 0
    served = 0

    def do_GET(self):
        name = self.path.split("?", 1)[0].lstrip("/")
        target = (self.root / name).resolve()
        if self.root.resolve() not in target.parents and target != self.root.resolve():
            self.send_error(404)
            return
        if not target.is_file():
            self.send_error(404)
            return
        data = target.read_bytes()
        if Handler.served == 0 and Handler.delay:
            time.sleep(Handler.delay)
        Handler.served += 1
        start = 0
        status = 200
        body = data
        range_header = self.headers.get("Range")
        if range_header and range_header.startswith("bytes="):
            start = int(range_header.split("=", 1)[1].split("-", 1)[0] or "0")
            if start > len(data):
                self.send_error(416)
                return
            body = data[start:]
            status = 206
        self.send_response(status)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Content-Type", "application/octet-stream")
        if status == 206:
            self.send_header("Content-Range", f"bytes {start}-{len(data) - 1}/{len(data)}")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        print(fmt % args, flush=True)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--directory", required=True)
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--delay", type=float, default=12)
    args = parser.parse_args()
    Handler.root = Path(args.directory)
    Handler.delay = args.delay
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"fixture server on 127.0.0.1:{args.port}", flush=True)
    server.serve_forever()

if __name__ == "__main__":
    main()
