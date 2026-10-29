"""Check built HTML, local asset paths and demo-only controls."""
from __future__ import annotations

import argparse
from html.parser import HTMLParser
import json
from pathlib import Path
import posixpath
import re
import subprocess
from urllib.parse import unquote, urlsplit

from build import base_path, checked_file, validate


class Markup(HTMLParser):
    def __init__(self, html: str):
        self.ids, self.urls, self.services = [], [], []
        super().__init__()
        self.feed(html)

    def handle_starttag(self, tag, pairs):
        attrs = dict(pairs)
        if attrs.get("id"):
            self.ids.append(attrs["id"])
        if "data-service-action" in attrs:
            self.services.append((tag, attrs))
        if tag == "form" and attrs.get("action"):
            raise ValueError("Demo must not submit a booking or patient form")
        for key in ("src", "href", "poster", "data-src"):
            if attrs.get(key):
                self.urls.append((tag, attrs[key]))
        for url in re.findall(r"url\(\s*[\"']?([^)'\"]+)", attrs.get("style", "")):
            self.urls.append((tag, url.strip()))


def check_url(output: Path, prefix: str, url: str, *, allow_external: bool = False):
    parsed = urlsplit(url)
    if parsed.scheme or parsed.netloc:
        if allow_external and parsed.scheme in {"http", "https"}:
            return
        raise ValueError(f"Unexpected external or service URL: {url}")
    if not parsed.path:
        return
    path = unquote(parsed.path)
    if path.startswith("/"):
        if not path.startswith(prefix):
            raise ValueError(f"URL escaped configured base path: {url}")
        path = path[len(prefix):]
    if not path:
        path = "index.html"
    checked_file(output, path)


def verify(root: Path, output: Path, prefix: str) -> dict:
    root, output, prefix = root.resolve(), output.resolve(), base_path(prefix)
    _, provenance = validate(root)
    html = (output / "index.html").read_text(encoding="utf-8")
    markup = Markup(html)
    if len(set(markup.ids)) != len(markup.ids):
        raise ValueError("Duplicate HTML id")
    if not markup.services or any(tag != "button" or attrs.get("type") != "button"
                                  for tag, attrs in markup.services):
        raise ValueError("All demo service actions must be non-submitting buttons")
    for tag, url in markup.urls:
        if url.startswith("#"):
            if url[1:] not in markup.ids:
                raise ValueError(f"Missing anchor: {url}")
            continue
        check_url(output, prefix, url, allow_external=tag == "a")
    css = (output / "assets/css/site.css").read_text(encoding="utf-8")
    for url in re.findall(r"url\(\s*[\"']?([^)'\"]+)", css):
        url = url.strip()
        if url.startswith(("data:", "#")):
            continue
        if not url.startswith("/"):
            url = posixpath.normpath(posixpath.join("assets/css", url))
            if not url.startswith("assets/"):
                raise ValueError(f"CSS asset escapes assets/: {url}")
        check_url(output, prefix, url)
    subprocess.run(["node", "--check", str(output / "src/site.mjs")], check=True, capture_output=True)
    return {"valid": True, "basePath": prefix, "services": len(markup.services),
            "urls": len(set(markup.urls)), "imageAssets": len(provenance["assets"])}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--output", type=Path)
    parser.add_argument("--base-path", default="/")
    args = parser.parse_args()
    print(json.dumps(verify(args.root, args.output or args.root / "dist", args.base_path), ensure_ascii=False))


if __name__ == "__main__":
    main()
