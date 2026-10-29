"""Meaningful build, integrity and project-path checks without game dependencies."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from unittest import TestCase

PROJECT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT / "tools"))
from build import base_path, build, checked_file, validate
from verify import verify


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


class IndependentBuildTests(TestCase):
    def setUp(self):
        parent = (PROJECT / ".cache/test-fixtures").resolve()
        parent.mkdir(parents=True, exist_ok=True)
        self.temporary = TemporaryDirectory(prefix="clinic-", dir=parent)
        self.root = Path(self.temporary.name).resolve()
        self.assertEqual(self.root.parent, parent)
        for relative in ("assets/css", "assets/img", "src", "data", "schema", "templates"):
            (self.root / relative).mkdir(parents=True, exist_ok=True)
        image = self.root / "assets/img/day.webp"
        image.write_bytes(b"example image bytes")
        (self.root / "assets/css/site.css").write_text("body { color: #112; }\n", encoding="utf-8")
        (self.root / "src/site.mjs").write_text("export const ready = true;\n", encoding="utf-8")
        (self.root / "templates/index.html").write_text(
            '<!doctype html><html><body><main id="reviews">{{ content.site.brand }}'
            '<img src="{{ asset(content.hero.dayImage) }}"><a href="#reviews">후기</a>'
            '<button type="button" data-service-action="booking">예약</button></main>'
            '<link rel="stylesheet" href="{{ asset(\'assets/css/site.css\') }}">'
            '<script type="module" src="{{ asset(\'src/site.mjs\') }}"></script>'
            '</body></html>', encoding="utf-8")
        write_json(self.root / "schema/content.schema.json", {
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "type": "object", "required": ["site", "hero", "appointments"],
            "properties": {"site": {"type": "object"}, "hero": {"type": "object"},
                           "appointments": {"type": "array"}},
        })
        write_json(self.root / "data/content.json", {
            "site": {"brand": "시안 한의원"}, "hero": {"dayImage": "assets/img/day.webp"},
            "appointments": [{"id": "sample", "alias": "김**", "time": "09:00", "status": "대기"}],
        })
        write_json(self.root / "assets/provenance.json", {
            "schemaVersion": 1,
            "assets": [{"path": "assets/img/day.webp", "bytes": image.stat().st_size,
                        "sha256": hashlib.sha256(image.read_bytes()).hexdigest()}],
        })

    def tearDown(self):
        self.assertTrue(self.root.is_relative_to((PROJECT / ".cache/test-fixtures").resolve()))
        self.temporary.cleanup()

    def test_root_and_project_path_render_and_validate(self):
        for prefix, directory in (("/", "dist-root"), ("/suan-clinic-demo/", "dist-project")):
            with self.subTest(prefix=prefix):
                output = self.root / directory
                self.assertEqual(build(self.root, output, prefix)["basePath"], prefix)
                page = (output / "index.html").read_text(encoding="utf-8")
                self.assertIn(f'src="{prefix}assets/img/day.webp"', page)
                self.assertIn(f'src="{prefix}src/site.mjs"', page)
                self.assertTrue((output / ".nojekyll").is_file())
                self.assertTrue(verify(self.root, output, prefix)["valid"])

    def test_modified_image_fails_provenance_integrity(self):
        (self.root / "assets/img/day.webp").write_bytes(b"unreviewed change")
        with self.assertRaisesRegex(ValueError, "integrity mismatch"):
            validate(self.root)

    def test_missing_asset_and_case_mismatch_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "incorrectly cased"):
            checked_file(self.root, "assets/img/DAY.webp")
        data = json.loads((self.root / "data/content.json").read_text(encoding="utf-8"))
        data["hero"]["dayImage"] = "assets/img/missing.webp"
        write_json(self.root / "data/content.json", data)
        with self.assertRaisesRegex(ValueError, "Missing or incorrectly cased"):
            validate(self.root)

    def test_duplicate_properties_and_ids_are_rejected(self):
        path = self.root / "data/content.json"
        path.write_text('{"site": {}, "site": {}, "hero": {}, "appointments": []}', encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "Duplicate JSON property"):
            validate(self.root)
        write_json(path, {"site": {}, "hero": {}, "appointments": [{"id": "same"}, {"id": "same"}]})
        with self.assertRaisesRegex(ValueError, "Duplicate ID"):
            validate(self.root)

    def test_unsafe_paths_and_unowned_output_are_preserved(self):
        for prefix in ("//example/", "/../", "https://example.com/"):
            with self.subTest(prefix=prefix), self.assertRaises(ValueError):
                base_path(prefix)
        with self.assertRaises(ValueError):
            checked_file(self.root, "assets/../../outside")
        output = self.root / "unowned"
        output.mkdir()
        (output / "keep.txt").write_text("preserve", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "unowned"):
            build(self.root, output)
        self.assertEqual((output / "keep.txt").read_text(encoding="utf-8"), "preserve")

    def test_service_links_and_forms_cannot_appear_in_demo(self):
        output = self.root / "dist"
        build(self.root, output)
        page = output / "index.html"
        original = page.read_text(encoding="utf-8")
        for fragment in ('<form action="/booking">', '<a href="tel:012345">전화</a>',
                         '<a href="/play">게임</a>'):
            with self.subTest(fragment=fragment):
                page.write_text(original.replace("</body>", fragment + "</body>"), encoding="utf-8")
                with self.assertRaises(ValueError):
                    verify(self.root, output, "/")


class CurrentContentTests(TestCase):
    def test_actual_content_and_selected_assets_validate(self):
        data, provenance = validate(PROJECT)
        self.assertTrue(data["clinicians"])
        self.assertTrue(data["reviews"])
        self.assertTrue(data["appointments"])
        self.assertTrue(provenance["assets"])
