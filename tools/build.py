"""Build the standalone intro. No game imports, network, account or database required."""
from __future__ import annotations

import argparse
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import re
import shutil
import sys
from urllib.parse import urlsplit

from jinja2 import Environment, FileSystemLoader, select_autoescape
from jsonschema import Draft202012Validator

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from rpg_intro_content import read_json, validate_intro_catalog


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def base_path(value: str) -> str:
    if not re.fullmatch(r"/[A-Za-z0-9_/-]*", value) or ".." in value or "//" in value:
        raise ValueError("base-path must be an absolute URL path, for example /uimaek-intro-demo/")
    return value.rstrip("/") + "/"


def scope_urls(value, prefix: str):
    if isinstance(value, dict):
        return {key: scope_urls(item, prefix) for key, item in value.items()}
    if isinstance(value, list):
        return [scope_urls(item, prefix) for item in value]
    if isinstance(value, str) and value.startswith(("/assets/", "/src/")):
        return prefix + value.lstrip("/")
    return value


def checked_file(root: Path, relative: str) -> Path:
    """Check each component's spelling, including on case-insensitive hosts."""
    candidate = Path(relative)
    if candidate.is_absolute() or any(part in (".", "..") for part in candidate.parts):
        raise ValueError(f"Unsafe asset path: {relative}")
    current = root.resolve()
    for part in candidate.parts:
        if not current.is_dir() or part not in {child.name for child in current.iterdir()}:
            raise ValueError(f"Missing or incorrectly cased asset: {relative}")
        current = current / part
    if not current.resolve().is_relative_to(root.resolve()) or not current.is_file():
        raise ValueError(f"Missing or unsafe demo asset: {relative}")
    return current


def project_reviews(data: dict) -> None:
    """Use the sample review list as the source for the existing intro carousel."""
    reviews = data["clinicDemo"]["reviews"]
    cards = data["features"]
    section_cards = data["sections"]["features"]["items"]
    if len(reviews) != len(cards) or len(cards) != len(section_cards):
        raise ValueError("Sample review count must match the feature cards")
    if len({row["id"] for row in reviews}) != len(reviews):
        raise ValueError("Duplicate IDs in clinicDemo.reviews")
    if [row["id"] for row in cards] != [row["id"] for row in section_cards]:
        raise ValueError("Feature card IDs must match their section counterparts")
    groups = [group for group in data["site"]["navigation"] if group["id"] == "features"]
    if len(groups) != 1:
        raise ValueError("Expected one feature navigation group")
    entries = groups[0]["entries"]
    if [row["id"] for row in entries] != [row["id"] for row in cards]:
        raise ValueError("Feature navigation IDs must match their cards")
    for review, card, section_card, entry in zip(reviews, cards, section_cards, entries):
        name = f"{review['alias']} · 예시 후기"
        date = "오늘" if review["daysAgo"] == 0 else f"{review['daysAgo']}일 전"
        for item in (card, section_card):
            item.update(name=name, title=name, description=review["content"], tag=f"{date} · 가상 예시")
        entry["name"] = name


def project_tour(data: dict) -> None:
    """Project the clinic tour data into the original media carousel and its menu."""
    tour = data["clinicDemo"]["tour"]
    items = tour["items"]
    slides = data["gallery"]
    groups = [group for group in data["site"]["navigation"] if group["id"] == "media"]
    if len(groups) != 1:
        raise ValueError("Expected one media navigation group")
    entries = groups[0]["entries"]
    if len(items) != len(slides) or len(slides) != len(entries):
        raise ValueError("Tour item count must match the gallery and its navigation")
    item_ids = [item["id"] for item in items]
    if len(set(item_ids)) != len(item_ids):
        raise ValueError("Duplicate IDs in clinicDemo.tour.items")
    if item_ids != [slide["id"] for slide in slides] or item_ids != [entry["id"] for entry in entries]:
        raise ValueError("Tour item IDs must match the gallery and navigation order")
    for item, slide, entry in zip(items, slides, entries):
        slide.update(name=item["title"], title=item["title"], description=item["description"],
                     image=item["image"], alt=item["alt"], caption=tour["notice"])
        if "originalImage" in slide:
            slide["originalImage"] = item["image"]
        entry["name"] = item["title"]
    data["sections"]["media"]["heading"].update(title=tour["title"], description=tour["notice"])
    guides = data["clinicDemo"]["visitorGuides"]
    if len({guide["id"] for guide in guides}) != len(guides):
        raise ValueError("Duplicate IDs in clinicDemo.visitorGuides")


def validate(root: Path) -> tuple[dict, dict]:
    data = read_json(root / "data/content.json")
    schema = read_json(root / "schema/schema.json")
    Draft202012Validator.check_schema(schema)
    validate_intro_catalog(data, root, content_dir=root / "schema")
    manifest = json.loads((root / "export-manifest.json").read_text(encoding="utf-8"))
    known = set()
    for item in manifest["files"]:
        relative = item["path"]
        path = checked_file(root, relative)
        if relative.casefold() in known:
            raise ValueError(f"Duplicate or case-colliding demo asset: {relative}")
        known.add(relative.casefold())
        if digest(path) != item["sha256"]:
            raise ValueError(f"Asset changed without re-export: {relative}")
    def references(value):
        if isinstance(value, dict):
            for item in value.values():
                yield from references(item)
        elif isinstance(value, list):
            for item in value:
                yield from references(item)
        elif isinstance(value, str) and value.startswith('/assets/') and value != '/assets/':
            yield urlsplit(value).path.lstrip('/')
    for relative in set(references(data)):
        if relative.casefold() not in known:
            raise ValueError(f"Content asset is not in the exported closure: {relative}")
        checked_file(root, relative)
    for kind in ("appointments", "reviews"):
        rows = data["clinicDemo"][kind]
        if len({row["id"] for row in rows}) != len(rows):
            raise ValueError(f"Duplicate IDs in clinicDemo.{kind}")
    project_reviews(deepcopy(data))
    project_tour(deepcopy(data))
    return data, manifest


def build(root: Path, output: Path, prefix: str = "/") -> dict:
    prefix = base_path(prefix)
    data, manifest = validate(root)
    # A fixed demo deployment prevents a JSON edit from turning a CTA into a real login.
    data = deepcopy(data)
    project_reviews(data)
    project_tour(data)
    data = scope_urls(data, prefix)
    data["deployment"] = {"mode": "demo", "basePath": prefix}
    data["assetBase"] = prefix + "assets/"
    environment = Environment(loader=FileSystemLoader(root / "templates"), autoescape=select_autoescape())
    page = environment.get_template("rpg-intro.html").render(
        intro_data=data, landing_is_logged_in=False, landing_is_operator=False,
    )
    # These URLs are fixed presentation dependencies in the shared template/CSS.
    page = re.sub(r"(?<=[\"'])/(assets|src)/", lambda match: prefix + match[1] + "/", page)
    # Block service navigation in the complete generated markup, including noscript.
    if re.search(r'(?:href|action)=[\"\']/(?:play|rpg)(?:[/?#\"\'])', page):
        raise ValueError("Demo HTML still contains a real service link")
    output = output.resolve()
    if output == root.resolve() or root.resolve().is_relative_to(output):
        raise ValueError("Build output must be a child or separate output directory")
    if output.exists() and any(output.iterdir()):
        if not (output / ".suan-demo-dist").is_file():
            raise ValueError(f"Refusing to replace an unowned build directory: {output}")
        shutil.rmtree(output)
    output.mkdir(parents=True, exist_ok=True)
    for item in manifest["files"]:
        relative = item["path"]
        if not relative.startswith(("assets/", "src/")):
            continue
        source, destination = root / relative, output / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        if source.suffix == ".css":
            text = source.read_text(encoding="utf-8")
            text = re.sub(r"(?<=[\"'(])/(assets|src)/", lambda match: prefix + match[1] + "/", text)
            destination.write_text(text, encoding="utf-8", newline="\n")
        else:
            shutil.copyfile(source, destination)
    (output / "index.html").write_text(page, encoding="utf-8", newline="\n")
    (output / ".nojekyll").write_bytes(b"")
    (output / ".suan-demo-dist").write_text("Generated by tools/build.py\n", encoding="utf-8")
    (output / "content.json").write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    return {"output": str(output), "basePath": prefix, "files": len(manifest["files"]),
            "assetBytes": manifest["assetBytes"], "mode": "demo"}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--output", type=Path)
    parser.add_argument("--base-path", default="/")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    root = args.root.resolve()
    if args.check:
        data, manifest = validate(root)
        print(json.dumps({"valid": True, "schemaVersion": data["schemaVersion"], "files": len(manifest["files"])}, ensure_ascii=False))
    else:
        print(json.dumps(build(root, args.output or root / "dist", args.base_path), ensure_ascii=False))


if __name__ == "__main__":
    main()
