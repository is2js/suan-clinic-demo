"""Serve the static demo on loopback, including an optional project URL prefix."""
from __future__ import annotations

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import mimetypes
from pathlib import Path
from urllib.parse import urlsplit

from build import base_path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, default=Path(__file__).resolve().parents[1] / "dist")
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--base-path", default="/")
    args = parser.parse_args()
    prefix = base_path(args.base_path)
    if not (args.directory / "index.html").is_file():
        raise SystemExit("Run tools/build.py before previewing")
    mimetypes.add_type("text/javascript", ".mjs")

    class Handler(SimpleHTTPRequestHandler):
        def _strip_prefix(self):
            if not urlsplit(self.path).path.startswith(prefix):
                self.send_error(404)
                return False
            self.path = self.path[len(prefix) - 1:]
            return True

        def do_GET(self):
            if self._strip_prefix():
                return super().do_GET()

        def do_HEAD(self):
            if self._strip_prefix():
                return super().do_HEAD()

        def end_headers(self):
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            super().end_headers()

    handler = partial(Handler, directory=str(args.directory.resolve()))
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    print(f"Clinic demo: http://127.0.0.1:{server.server_port}{prefix}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
