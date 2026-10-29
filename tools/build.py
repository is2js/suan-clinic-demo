"""Build the server-free clinic demo from validated JSON and selected assets."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import shutil

from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape
from jsonschema import Draft202012Validator


def base_path(value: str) -> str:
    if not re.fullmatch(r"/[A-Za-z0-9_/-]*", value) or ".." in value or "//" in value:
        raise ValueError("base-path must be an absolute URL path, e.g. /suan-clinic-demo/")
    return value.rstrip("/") + "/"


def _object_pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"Duplicate JSON property: {key}")
        result[key] = value
    return result


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=_object_pairs)


def checked_file(root: Path, relative: str) -> Path:
    if not isinstance(relative, str):
        raise ValueError("Asset path must be a string")
    path = PurePosixPath(relative)
    if (not relative or path.is_absolute()
            or any(part in {".", ".."} for part in path.parts)
            or "\\" in relative or ":" in relative or "?" in relative or "#" in relative):
        raise ValueError(f"Unsafe relative path: {relative}")
    current = root.resolve()
    for part in path.parts:
        if not current.is_dir() or part not in {item.name for item in current.iterdir()}:
            raise ValueError(f"Missing or incorrectly cased path: {relative}")
        current = current / part
    if not current.resolve().is_relative_to(root.resolve()) or not current.is_file():
        raise ValueError(f"Missing or unsafe file: {relative}")
    return current


def _asset_values(value):
    if isinstance(value, dict):
        for child in value.values():
            yield from _asset_values(child)
    elif isinstance(value, list):
        for child in value:
            yield from _asset_values(child)
    elif isinstance(value, str) and value.startswith("assets/"):
        yield value


def validate(root: Path) -> tuple[dict, dict]:
    root = root.resolve()
    data = read_json(root / "data/content.json")
    schema = read_json(root / "schema/content.schema.json")
    Draft202012Validator.check_schema(schema)
    Draft202012Validator(schema).validate(data)
    provenance = read_json(root / "assets/provenance.json")
    if provenance.get("schemaVersion") != 1 or not isinstance(provenance.get("assets"), list):
        raise ValueError("Invalid asset provenance manifest")
    records = {}
    for item in provenance["assets"]:
        relative = item.get("path", "")
        if not relative.startswith("assets/") or relative.casefold() in records:
            raise ValueError(f"Invalid or duplicate asset provenance: {relative}")
        path = checked_file(root, relative)
        content = path.read_bytes()
        if len(content) != item.get("bytes") or hashlib.sha256(content).hexdigest() != item.get("sha256"):
            raise ValueError(f"Asset integrity mismatch: {relative}")
        records[relative.casefold()] = relative
    for relative in set(_asset_values(data)):
        checked_file(root, relative)
        if records.get(relative.casefold()) != relative:
            raise ValueError(f"Content asset is missing from provenance: {relative}")
    for collection in ("clinicians", "reviews", "appointments", "departments", "spaces"):
        ids = [item["id"] for item in data.get(collection, []) if "id" in item]
        if len(ids) != len(set(ids)):
            raise ValueError(f"Duplicate ID in {collection}")
    return data, provenance


def build(root: Path, output: Path, prefix: str = "/") -> dict:
    root, output = root.resolve(), output.resolve()
    prefix = base_path(prefix)
    data, provenance = validate(root)
    if output == root or not output.is_relative_to(root):
        raise ValueError("Build output must be a directory inside the project")

    def asset(relative: str) -> str:
        if not relative.startswith(("assets/", "src/")):
            raise ValueError(f"Asset must be in assets/ or src/: {relative}")
        checked_file(root, relative)
        return prefix + relative

    environment = Environment(loader=FileSystemLoader(root / "templates"),
                              autoescape=select_autoescape(), undefined=StrictUndefined)
    html = environment.get_template("index.html").render(content=data, asset=asset, base_path=prefix)

    # Remove only a previous build owned by this project, after resolving and checking its path.
    if output.exists() and any(output.iterdir()):
        if not (output / ".suan-demo-dist").is_file():
            raise ValueError(f"Refusing to replace an unowned build directory: {output}")
        shutil.rmtree(output)
    output.mkdir(parents=True, exist_ok=True)
    for directory in ("assets", "src"):
        source_root = root / directory
        for source in source_root.rglob("*"):
            if not source.is_file():
                continue
            if not source.resolve().is_relative_to(source_root.resolve()):
                raise ValueError(f"File escapes source directory: {source}")
            relative = source.relative_to(root)
            checked_file(root, relative.as_posix())
            destination = output / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, destination)
    (output / "data").mkdir(parents=True, exist_ok=True)
    shutil.copyfile(root / "data/content.json", output / "data/content.json")
    (output / "index.html").write_text(html, encoding="utf-8", newline="\n")
    (output / ".nojekyll").write_bytes(b"")
    (output / ".suan-demo-dist").write_text("Generated by tools/build.py\n", encoding="utf-8")
    return {"output": str(output), "basePath": prefix, "imageAssets": len(provenance["assets"]), "mode": "demo"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--output", type=Path)
    parser.add_argument("--base-path", default="/")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    root = args.root.resolve()
    if args.check:
        _, provenance = validate(root)
        result = {"valid": True, "imageAssets": len(provenance["assets"]), "mode": "demo"}
    else:
        result = build(root, args.output or root / "dist", args.base_path)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
