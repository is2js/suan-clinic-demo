"""App-free authored intro data assembly and real JSON Schema validation.

The game authoring tool supplies authoritative sprite/skill projections. Static
builds validate copied data with this module and jsonschema; Jinja2 renders it.
Importing this file never imports FastAPI, SQLAlchemy, the game runtime, or a database.
"""
from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
from urllib.parse import unquote, urlsplit

from jsonschema import Draft202012Validator

SECTION_IDS = ("visual", "universe", "character", "features", "gamefeatures", "sect", "skill", "clinic", "guide", "media", "access")
NAVIGATION_IDS = SECTION_IDS[1:-1]
SCHEMA_VERSION = 5
CATALOG_BYTE_BUDGET = 250_000


def _unique_object(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError(f"Duplicate JSON property: {key}")
        value[key] = item
    return value


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=_unique_object)


def _schema(project_root: Path, content_dir: Path | None = None) -> dict:
    schema = read_json((content_dir or project_root / "data/rpg-intro") / "schema.json")
    Draft202012Validator.check_schema(schema)
    return schema


def _validate_schema(value: dict, schema: dict, definition: str, label: str) -> None:
    selected = {**schema, "$ref": f"#/$defs/{definition}"}
    selected.pop("oneOf", None)
    errors = sorted(Draft202012Validator(selected).iter_errors(value), key=lambda error: str(list(error.path)))
    if errors:
        error = errors[0]
        location = ".".join(str(part) for part in error.path)
        raise ValueError(f"{label}{'.' + location if location else ''}: {error.message}")


def _asset_urls(value):
    if isinstance(value, dict):
        for key, child in value.items():
            if key != "assetBase":
                yield from _asset_urls(child)
    elif isinstance(value, list):
        for child in value:
            yield from _asset_urls(child)
    elif isinstance(value, str) and value.startswith("/assets/"):
        yield value


def validate_asset_references(value: object, project_root: Path) -> None:
    root = project_root.resolve()
    for url in sorted(set(_asset_urls(value))):
        parsed = urlsplit(url)
        path = (root / unquote(parsed.path).lstrip("/")).resolve()
        if parsed.scheme or parsed.netloc or not path.is_relative_to(root / "assets"):
            raise ValueError(f"Asset escapes the selected project: {url}")
        if not path.is_file():
            raise ValueError(f"Missing intro asset: {url}")


def _walk_objects(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from _walk_objects(child)
    elif isinstance(value, list):
        for child in value:
            yield from _walk_objects(child)


def _unique_ids(items: list, label: str) -> None:
    ids = [item["id"] for item in items if "id" in item]
    if len(ids) != len(set(ids)):
        raise ValueError(f"Duplicate IDs in {label}")


def validate_authored_content(authored: dict, project_root: Path, *, content_dir: Path | None = None,
                              validate_assets: bool = True) -> None:
    schema = _schema(project_root, content_dir)
    site, sections = authored["site"], authored["sections"]
    _validate_schema(site, schema, "site", "site")
    if set(sections) != set(SECTION_IDS):
        raise ValueError("The authored section registry must contain exactly the eleven existing section IDs")
    if len(site["sectionOrder"]) != len(SECTION_IDS) or set(site["sectionOrder"]) != set(SECTION_IDS):
        raise ValueError("site.sectionOrder must include each existing section exactly once")
    navigation = site["navigation"]
    _unique_ids(navigation, "site.navigation")
    if {row["id"] for row in navigation} != set(NAVIGATION_IDS):
        raise ValueError("site.navigation must contain the nine existing menu sections")
    for section_id, section in sections.items():
        _validate_schema(section, schema, "section", f"sections.{section_id}")
        if section["id"] != section_id:
            raise ValueError(f"Section filename/ID mismatch: {section_id}")
        for field in ("items", "stories", "sequence"):
            _unique_ids(section.get(field, []), f"{section_id}.{field}")
    for item in _walk_objects(authored):
        if "actionId" in item and item["actionId"] not in site["actions"]:
            raise ValueError(f"Unknown actionId: {item['actionId']}")
        if "target" in item and item["target"] not in sections:
            raise ValueError(f"Unknown section target: {item['target']}")
    for action_id in site["footer"]["actionIds"]:
        if action_id not in site["actions"]:
            raise ValueError(f"Unknown footer actionId: {action_id}")
    if site["actions"]["logout"]["method"] != "POST":
        raise ValueError("The existing logout action must remain POST")
    if validate_assets:
        validate_asset_references(authored, project_root)


def load_authored_content(project_root: Path, content_dir: Path | None = None, *,
                          validate_assets: bool = True) -> dict:
    root = Path(project_root)
    directory = Path(content_dir) if content_dir is not None else root / "data/rpg-intro"
    paths = sorted((directory / "sections").glob("*.json"))
    sections = {}
    for path in paths:
        if path.stem in sections:
            raise ValueError(f"Duplicate section file: {path.stem}")
        sections[path.stem] = read_json(path)
    authored = {"site": read_json(directory / "site.json"), "sections": sections}
    validate_authored_content(authored, root, content_dir=directory, validate_assets=validate_assets)
    return authored


def _action(row: dict, site: dict) -> dict:
    result = deepcopy(row)
    if "actionId" in result:
        definition = site["actions"].get(result["actionId"])
        if definition is None:
            raise ValueError(f"Unknown actionId: {result['actionId']}")
        result["href"] = definition["href"]
        result.setdefault("label", definition["label"])
    elif "target" in result:
        result["href"] = "#" + result["target"]
    return result


def _marketing(row: dict, site: dict, references: dict) -> dict:
    result = deepcopy(row)
    reference = result.pop("contentRef", None)
    if reference:
        if reference not in references:
            raise ValueError(f"Unknown contentRef: {reference}")
        result = {**deepcopy(references[reference]), **result}
    if "name" in result:
        result.setdefault("title", result["name"])
    if "tag" in result:
        result.setdefault("eyebrow", result["tag"])
    return _action(result, site)


def _sprite_reference(reference: str, catalog: dict) -> dict:
    parts = reference.split(":")
    if len(parts) == 2 and parts[0] in {"actor", "hero"}:
        collection = catalog["actors" if parts[0] == "actor" else "heroMonsters"]
        item = next((item for item in collection if item["id"] == parts[1]), None)
        if item and item.get("sprite"):
            return deepcopy(item["sprite"])
    elif len(parts) == 3 and parts[0] == "medical":
        item = next((item for item in catalog["medical"]["skills"] if item["growthNodeId"] == parts[1]), None)
        if item and parts[2] in {"0", "1"}:
            return deepcopy(item["performers"][int(parts[2])])
    raise ValueError(f"Unknown spriteRef: {reference}")


def validate_intro_catalog(catalog: dict, project_root: Path, *, content_dir: Path | None = None,
                           validate_assets: bool = True) -> None:
    _validate_schema(catalog, _schema(Path(project_root), content_dir), "catalog", "catalog")
    if set(catalog["sections"]) != set(SECTION_IDS):
        raise ValueError("Runtime catalog lost an existing section anchor")
    for key in ("universe", "actors", "monsters", "heroMonsters", "features", "guild", "elements", "gallery", "sequence"):
        _unique_ids(catalog[key], key)
    for index, skill in enumerate(catalog["medical"]["skills"]):
        selected = skill.get("performerIndex", index % 2)
        if not 0 <= selected < len(skill["performers"]) or skill["performers"][selected] is None:
            raise ValueError(f"Medical skill lost its selected performer: {skill['id']}")
        tools = skill.get("performerTools", [])
        if tools and tools[selected] is None:
            raise ValueError(f"Medical skill lost its selected tool: {skill['id']}")
    for item in _walk_objects(catalog):
        if {"src", "frames", "rows", "row", "frameWidth", "frameHeight", "frameMs"} <= item.keys():
            if item["row"] >= item["rows"] or item.get("staticFrame", 0) >= item["frames"]:
                raise ValueError(f"Sprite frame/row is outside the selected sheet: {item['src']}")
    if validate_assets:
        validate_asset_references(catalog, Path(project_root))
    size = len((json.dumps(catalog, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    if size > CATALOG_BYTE_BUDGET:
        raise ValueError(f"Intro catalog exceeds its {CATALOG_BYTE_BUDGET}-byte budget: {size}")


def assemble_intro_content(projection: dict, project_root: Path, authored: dict | None = None,
                           content_dir: Path | None = None, *, validate_assets: bool = True) -> dict:
    """Add authored presentation data while leaving actual game skill data intact."""
    root = Path(project_root)
    source = authored if authored is not None else load_authored_content(root, content_dir, validate_assets=validate_assets)
    validate_authored_content(source, root, content_dir=content_dir, validate_assets=validate_assets)
    site, sections = deepcopy(source["site"]), deepcopy(source["sections"])
    result = deepcopy(projection)
    result.update(schemaVersion=SCHEMA_VERSION, revision=site["revision"], site=site, sections=sections,
                  brand=deepcopy(site["brand"]), startHref=site["actions"]["play"]["href"],
                  ambientSrc=site["audio"]["ambientSrc"])
    references = {}
    for section_id, key in (("universe", "universe"), ("features", "features"), ("sect", "guild")):
        result[key] = [_marketing(row, site, references) for row in sections[section_id]["items"]]
        if section_id == "sect":
            actors = {actor["id"]: actor for actor in result["actors"]}
            for row in result[key]:
                if row.get("motionActorIds"):
                    row["motionActors"] = []
                    for actor_id in row["motionActorIds"]:
                        actor = actors.get(actor_id)
                        if actor is None:
                            raise ValueError(f"Unknown motionActorId: {actor_id}")
                        idle = actor.get("encounter", {}).get("idle", {}).get("sprite")
                        if not idle:
                            raise ValueError(f"Motion actor has no selected idle sprite: {actor_id}")
                        row["motionActors"].append({"id": actor_id, "name": actor["name"], "sprite": deepcopy(idle)})
        references.update({f"{key}:{row['id']}": row for row in result[key]})
    guide = sections["guide"]
    result["guide"] = {"protagonist": {"image": guide["assets"]["protagonist"], "alt": guide["copy"]["protagonistAlt"]},
                       "stories": [_marketing(row, site, references) for row in guide["stories"]]}
    result["sequence"] = []
    for row in sections["visual"]["sequence"]:
        item = _marketing(row, site, references)
        item["sprite"] = _sprite_reference(item.pop("spriteRef"), result)
        result["sequence"].append(item)
    result["gallery"] = [_marketing(row, site, references) for row in sections["media"]["items"]]
    result["characterScene"]["background"] = sections["character"]["background"]
    for section in sections.values():
        section["actions"] = [_action(row, site) for row in section.get("actions", [])]
    for group in site["navigation"]:
        if group.get("source"):
            values = result
            for key in group["source"].split("."):
                if not isinstance(values, dict) or key not in values:
                    raise ValueError(f"Unknown navigation source: {group['source']}")
                values = values[key]
            if not isinstance(values, list):
                raise ValueError(f"Navigation source must be a list: {group['source']}")
            group["entries"] = [{"name": item["name"], **({"id": item["id"]} if "id" in item else {})} for item in values]
        else:
            group["entries"] = [_action(row, site) for row in group["entries"]]
    result["sources"].update(authoredSite="/data/rpg-intro/site.json", authoredSections="/data/rpg-intro/sections/",
                             contentSchema="/data/rpg-intro/schema.json")
    # Preserve the established generated-file order so authored-data changes stay reviewable.
    order = ("schemaVersion", "revision", "startHref", "brand", "universe", "actors", "monsters",
             "heroMonsters", "features", "guild", "medical", "elements", "gallery", "guide", "sequence",
             "heroSprites", "ambientSrc", "sources", "characterScene", "site", "sections")
    result = {**{key: result[key] for key in order if key in result},
              **{key: value for key, value in result.items() if key not in order}}
    validate_intro_catalog(result, root, content_dir=content_dir, validate_assets=validate_assets)
    return result
