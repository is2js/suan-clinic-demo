"""Loopback-only static preview, including a GitHub project-site URL prefix."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse
import mimetypes
import re
from urllib.parse import urlsplit


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, default=Path(__file__).resolve().parents[1] / "dist")
    parser.add_argument("--port", type=int, default=0)
    parser.add_argument("--base-path", default="/")
    args = parser.parse_args()
    prefix = "/" + args.base_path.strip("/") + "/" if args.base_path.strip("/") else "/"
    mimetypes.add_type("text/javascript", ".mjs")
    mimetypes.add_type("video/webm", ".webm")

    class Handler(SimpleHTTPRequestHandler):
        def send_head(self):
            self.range_remaining = None
            header = self.headers.get("Range")
            file_path = Path(self.translate_path(self.path))
            if not header or not file_path.is_file():
                return super().send_head()
            size = file_path.stat().st_size
            match = re.fullmatch(r"bytes=(\d*)-(\d*)", header.strip())
            if not match or not any(match.groups()) or size == 0:
                self.send_error(416, "Unsupported byte range")
                return None
            first, last = match.groups()
            start = int(first) if first else max(0, size - int(last))
            end = min(size - 1, int(last)) if first and last else size - 1
            if start >= size or start > end:
                self.send_response(416)
                self.send_header("Content-Range", f"bytes */{size}")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return None
            stream = file_path.open("rb")
            stream.seek(start)
            self.range_remaining = end - start + 1
            self.send_response(206)
            self.send_header("Content-Type", self.guess_type(str(file_path)))
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            self.send_header("Content-Length", str(self.range_remaining))
            self.end_headers()
            return stream

        def copyfile(self, source, destination):
            if self.range_remaining is None:
                return super().copyfile(source, destination)
            remaining = self.range_remaining
            while remaining:
                chunk = source.read(min(64 * 1024, remaining))
                if not chunk:
                    break
                destination.write(chunk)
                remaining -= len(chunk)

        def do_GET(self):
            route = urlsplit(self.path).path
            if not route.startswith(prefix):
                self.send_error(404)
                return
            self.path = self.path[len(prefix) - 1:]
            return super().do_GET()

        def do_HEAD(self):
            route = urlsplit(self.path).path
            if not route.startswith(prefix):
                self.send_error(404)
                return
            self.path = self.path[len(prefix) - 1:]
            return super().do_HEAD()

        def end_headers(self):
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Accept-Ranges", "bytes")
            super().end_headers()

        def log_message(self, *args):
            pass

    handler = partial(Handler, directory=str(args.directory.resolve()))
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    print(f"Demo preview: http://127.0.0.1:{server.server_port}{prefix}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
