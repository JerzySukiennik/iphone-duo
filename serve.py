#!/usr/bin/env python3
"""No-cache static server for iPhone Duo (usage: serve.py [port])."""
import http.server, socketserver, sys, os

class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()
    def log_message(self, *a): pass
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".js": "text/javascript", ".mjs": "text/javascript", ".m4a": "audio/mp4", ".mp4": "video/mp4"}

class S(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8555
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    S(("0.0.0.0", port), H).serve_forever()
