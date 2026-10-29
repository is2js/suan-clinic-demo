"""Validate generated static HTML and asset closure, without a game server."""
from __future__ import annotations

import argparse
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import subprocess
from urllib.parse import unquote, urlsplit

from build import base_path, validate


class Markup(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.urls, self.ids, self.services, self.forms, self.sections = [], [], [], [], []
        self.guide_links, self.footer_links, self.footer_services = [], [], []
        self.product_carousels, self.product_tracks = [], []
        self.product_slides, self.product_tabs, self.product_steps = [], [], []
        self.product_section_depth = 0
        self.in_footer = False
        self.feed(text)

    def handle_starttag(self, tag, pairs):
        attrs = dict(pairs)
        if tag == "section":
            if attrs.get("id") == "products":
                self.product_section_depth = 1
            elif self.product_section_depth:
                self.product_section_depth += 1
        if self.product_section_depth:
            if attrs.get("data-carousel") == "products":
                self.product_carousels.append((tag, attrs))
            if "data-track" in attrs:
                self.product_tracks.append((tag, attrs))
            if "data-slide" in attrs:
                self.product_slides.append((tag, attrs))
            if attrs.get("role") == "tab" and "data-index" in attrs:
                self.product_tabs.append((tag, attrs))
            if "data-step" in attrs:
                self.product_steps.append((tag, attrs))
        if tag == "footer":
            self.in_footer = True
        if tag == "a" and "intro-guide-story" in attrs.get("class", "").split():
            self.guide_links.append(attrs)
        if self.in_footer and tag == "a":
            self.footer_links.append(attrs)
        if self.in_footer and "data-service-action" in attrs:
            self.footer_services.append((tag, attrs))
        if "id" in attrs:
            self.ids.append(attrs["id"])
        if tag == "section" and "data-section" in attrs and "id" in attrs:
            self.sections.append(attrs["id"])
        if "data-service-action" in attrs:
            self.services.append((tag, attrs))
        if tag == "form":
            self.forms.append(attrs)
        for key in ("src", "href", "poster", "data-scene-src", "data-src", "data-clinic-capture"):
            if attrs.get(key):
                self.urls.append(attrs[key])
        self.urls.extend(re.findall(r"url\(['\"]?([^)'\"]+)", attrs.get("style", "")))

    def handle_endtag(self, tag):
        if tag == "section" and self.product_section_depth:
            self.product_section_depth -= 1
        if tag == "footer":
            self.in_footer = False


def existing_exact(root, relative):
    path = root
    for part in Path(relative).parts:
        if part in ("..", ".") or not path.is_dir() or part not in {child.name for child in path.iterdir()}:
            raise ValueError(f"Missing or incorrectly cased static path: {relative}")
        path = path / part
    if not path.is_file():
        raise ValueError(f"Static URL does not name a file: {relative}")


def verify(root, output, prefix):
    prefix = base_path(prefix)
    data, manifest = validate(root)
    page = (output / "index.html").read_text(encoding="utf-8")
    markup = Markup(page)
    if len(set(markup.ids)) != len(markup.ids):
        raise ValueError("Static HTML has duplicate IDs")
    if markup.sections != data["site"]["sectionOrder"]:
        raise ValueError("Static HTML section order or anchors differ from site.sectionOrder")
    expected = {"visual", "clinic", "notice", "community", "products", "faq", "guide", "media"}
    if not expected <= set(markup.ids):
        raise ValueError("Static HTML lost a required section or FAQ anchor")
    if len(markup.services) < 10 or any(tag != "button" or attrs.get("type") != "button" for tag, attrs in markup.services):
        raise ValueError("Demo service actions must all be inert buttons")
    if markup.forms:
        raise ValueError("Demo HTML must not contain a submitting form")
    products = data["clinicDemo"]["products"]["items"]
    if len(markup.product_carousels) != 1 or len(markup.product_tracks) != 1:
        raise ValueError("Product slider must have exactly one carousel and track")
    if len(markup.product_slides) != len(products) or len(markup.product_tabs) != len(products):
        raise ValueError("Product slider slides and navigation must match the catalog")
    if len(markup.product_steps) != 2 or {(tag, attrs.get("type"), attrs.get("data-step")) for tag, attrs in markup.product_steps} != {
        ("button", "button", "-1"), ("button", "button", "1")
    }:
        raise ValueError("Product slider needs previous and next buttons")
    for index, (item, (slide_tag, slide), (tab_tag, tab)) in enumerate(
        zip(products, markup.product_slides, markup.product_tabs)
    ):
        if (slide_tag != "article" or slide.get("role") != "tabpanel"
                or slide.get("id") != f"product-{item['id']}"
                or slide.get("aria-labelledby") != f"product-tab-{index}"
                or tab_tag != "button" or tab.get("type") != "button"
                or tab.get("id") != f"product-tab-{index}"
                or tab.get("data-index") != str(index)
                or tab.get("aria-controls") != slide.get("id")
                or tab.get("aria-selected") != ("true" if index == 0 else "false")):
            raise ValueError(f"Invalid product slider navigation at index {index}")
    for url in set(markup.urls):
        if url.startswith("#"):
            if url[1:] not in markup.ids:
                raise ValueError(f"Missing anchor target: {url}")
            continue
        parsed = urlsplit(url)
        if parsed.scheme or parsed.netloc:
            raise ValueError(f"Unexpected external runtime URL: {url}")
        if not parsed.path.startswith(prefix):
            raise ValueError(f"Asset escaped the configured base path: {url}")
        existing_exact(output, unquote(parsed.path[len(prefix):]))
    for relative in ("src/rpg/intro.mjs", "src/rpg/intro-motion.mjs"):
        subprocess.run(["node", "--check", str(output / relative)], check=True, capture_output=True)
    css = (output / "assets/rpg/css/rpg-intro.css").read_text(encoding="utf-8")
    for url in re.findall(r"url\(['\"]?([^)'\"]+)", css):
        if url.startswith(("data:", "#")):
            continue
        parsed = urlsplit(url)
        if not parsed.path.startswith(prefix):
            raise ValueError(f"CSS URL escaped configured base: {url}")
        existing_exact(output, unquote(parsed.path[len(prefix):]))
    return {"valid": True, "basePath": prefix, "services": len(markup.services), "urls": len(set(markup.urls)),
            "assetFiles": len(manifest["files"]), "assetBytes": manifest["assetBytes"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--output", type=Path)
    parser.add_argument("--base-path", default="/")
    args = parser.parse_args()
    print(json.dumps(verify(args.root.resolve(), (args.output or args.root / "dist").resolve(), args.base_path), ensure_ascii=False))


if __name__ == "__main__":
    main()
