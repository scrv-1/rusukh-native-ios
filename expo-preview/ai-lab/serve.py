"""Private Codespaces diagnostic server. Serves only one generated test document."""
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
HTML = (Path(__file__).parent / 'dist/index.html').read_bytes()
class DiagnosticHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path not in ('/', '/index.html'):
            self.send_error(404); return
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(HTML)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers(); self.wfile.write(HTML)
HTTPServer(('0.0.0.0',8082), DiagnosticHandler).serve_forever()
