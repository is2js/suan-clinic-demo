"""Regression checks for the independently built clinic intro."""
from copy import deepcopy
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from unittest import TestCase

from jsonschema import Draft202012Validator

PROJECT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT / "tools"))
from build import base_path, build, checked_file, project_reviews, project_tour, validate
from rpg_intro_content import read_json
from verify import Markup, verify


class ClinicIntroChecks(TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data, cls.manifest = validate(PROJECT)
        cls.schema = read_json(PROJECT / "schema/schema.json")
        cls.catalog_schema = {**cls.schema, "$ref": "#/$defs/catalog"}
        cls.catalog_schema.pop("oneOf", None)
        cls.validator = Draft202012Validator(cls.catalog_schema)

    def test_data_has_two_medical_staff_and_examples(self):
        self.assertEqual({item["id"] for item in self.data["actors"]}, {"medical-male", "medical-female"})
        self.assertTrue(self.data["clinicDemo"]["reviews"])
        self.assertTrue(self.data["clinicDemo"]["appointments"])
        self.assertIn("예시", self.data["clinicDemo"]["appointmentNotice"])
        self.assertIn("예시", self.data["clinicDemo"]["reviewNotice"])
        community = self.data["clinicDemo"]["community"]
        products = self.data["clinicDemo"]["products"]
        self.assertIn("예시", community["notice"])
        self.assertIn("시안", products["notice"])
        self.assertGreaterEqual(len(community["boards"]), 2)
        self.assertIn("공진단", [item["name"] for item in products["items"]])
        self.assertTrue(self.manifest["files"])

    def test_invalid_examples_and_actor_counts_are_rejected(self):
        for mutation in ("alias", "time", "status", "notice", "actor"):
            value = deepcopy(self.data)
            if mutation == "alias": value["clinicDemo"]["appointments"][0]["alias"] = "실명"
            elif mutation == "time": value["clinicDemo"]["appointments"][0]["time"] = "25:99"
            elif mutation == "status": value["clinicDemo"]["appointments"][0]["status"] = "접수"
            elif mutation == "notice": value["clinicDemo"]["reviewNotice"] = "환자 후기"
            else: value["actors"].pop()
            with self.subTest(mutation=mutation):
                self.assertFalse(self.validator.is_valid(value))

    def test_review_projection_updates_cards_and_navigation(self):
        value = deepcopy(self.data)
        review = value["clinicDemo"]["reviews"][0]
        review.update(alias="윤**", content="변경된 가상 후기", daysAgo=7)
        original_image = value["features"][0]["image"]
        original_id = value["features"][0]["id"]
        project_reviews(value)
        card, copy = value["features"][0], value["sections"]["features"]["items"][0]
        entry = next(group for group in value["site"]["navigation"] if group["id"] == "features")["entries"][0]
        for item in (card, copy):
            self.assertEqual(item["name"], "윤** · 예시 후기")
            self.assertEqual(item["description"], "변경된 가상 후기")
            self.assertEqual(item["tag"], "7일 전 · 가상 예시")
        self.assertEqual(entry["name"], card["name"])
        self.assertEqual(card["image"], original_image)
        self.assertEqual(card["id"], original_id)
        value["clinicDemo"]["reviews"][0]["daysAgo"] = 0
        project_reviews(value)
        self.assertEqual(value["features"][0]["tag"], "오늘 · 가상 예시")

    def test_review_projection_rejects_mismatched_or_duplicate_inputs(self):
        for mutation in ("count", "duplicate", "section_id", "navigation_id"):
            value = deepcopy(self.data)
            if mutation == "count": value["clinicDemo"]["reviews"].pop()
            elif mutation == "duplicate": value["clinicDemo"]["reviews"][1]["id"] = value["clinicDemo"]["reviews"][0]["id"]
            elif mutation == "section_id": value["sections"]["features"]["items"][0]["id"] = "wrong"
            else: next(group for group in value["site"]["navigation"] if group["id"] == "features")["entries"][0]["id"] = "wrong"
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                project_reviews(value)

    def test_tour_projection_updates_gallery_and_navigation(self):
        value = deepcopy(self.data)
        item = value["clinicDemo"]["tour"]["items"][0]
        item.update(title="새로운 공간", description="새 시안 설명", image="/assets/art/herb-garden.webp", alt="새 시안 원화")
        value["gallery"][0]["originalImage"] = "/assets/art/hero-day.webp"
        project_tour(value)
        slide = value["gallery"][0]
        entry = next(group for group in value["site"]["navigation"] if group["id"] == "media")["entries"][0]
        self.assertEqual(slide["name"], item["title"])
        self.assertEqual(slide["description"], item["description"])
        self.assertEqual(slide["image"], item["image"])
        self.assertEqual(slide["originalImage"], item["image"])
        self.assertEqual(slide["alt"], item["alt"])
        self.assertEqual(entry["name"], item["title"])
        self.assertEqual(value["sections"]["media"]["heading"]["description"], value["clinicDemo"]["tour"]["notice"])

    def test_tour_projection_rejects_mismatched_or_duplicate_inputs(self):
        for mutation in ("count", "duplicate", "gallery_id", "navigation_id", "visitor_id"):
            value = deepcopy(self.data)
            if mutation == "count": value["clinicDemo"]["tour"]["items"].pop()
            elif mutation == "duplicate": value["clinicDemo"]["tour"]["items"][1]["id"] = value["clinicDemo"]["tour"]["items"][0]["id"]
            elif mutation == "gallery_id": value["gallery"][0]["id"] = "wrong"
            elif mutation == "navigation_id": next(group for group in value["site"]["navigation"] if group["id"] == "media")["entries"][0]["id"] = "wrong"
            else: value["clinicDemo"]["visitorGuides"][1]["id"] = value["clinicDemo"]["visitorGuides"][0]["id"]
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                project_tour(value)

    def test_invalid_paths_and_missing_asset_rejected(self):
        for prefix in ("//example/", "/../", "https://example.com/"):
            with self.subTest(prefix=prefix), self.assertRaises(ValueError): base_path(prefix)
        with self.assertRaises(ValueError): checked_file(PROJECT, "assets/../../outside")
        with self.assertRaisesRegex(ValueError, "incorrectly cased"):
            checked_file(PROJECT, "assets/CLINICIANS/jo-jaeseong.png")

    def test_build_subpath_and_reject_unowned_and_service_links(self):
        parent = PROJECT / ".cache" / "test-fixtures"
        parent.mkdir(parents=True, exist_ok=True)
        with TemporaryDirectory(prefix="clinic-intro-", dir=parent) as temp:
            folder = Path(temp).resolve()
            self.assertEqual(folder.parent, parent.resolve())
            unowned = folder / "unowned"
            unowned.mkdir()
            (unowned / "keep.txt").write_text("preserve", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "unowned"):
                build(PROJECT, unowned, "/suan-clinic-demo/")
            self.assertEqual((unowned / "keep.txt").read_text(encoding="utf-8"), "preserve")
            output = folder / "dist"
            build(PROJECT, output, "/suan-clinic-demo/")
            self.assertTrue(verify(PROJECT, output, "/suan-clinic-demo/")["valid"])
            page = output / "index.html"
            original = page.read_text(encoding="utf-8")
            self.assertIn("/suan-clinic-demo/assets/", original)
            markup = Markup(original)
            # Informational cards and footer links must navigate within the page;
            # reserving remains an inert demo action rather than an external link.
            self.assertEqual([link.get("href") for link in markup.guide_links],
                             ["#visit-first", "#gamefeatures"])
            self.assertTrue(all("data-service-action" not in link for link in markup.guide_links))
            footer_targets = {link.get("href") for link in markup.footer_links}
            self.assertTrue({"#clinic", "#gamefeatures"} <= footer_targets)
            self.assertTrue(any(tag == "button" and attrs.get("type") == "button"
                                and attrs.get("data-service-action") == "play"
                                for tag, attrs in markup.footer_services))
            self.assertEqual(markup.sections, self.data["site"]["sectionOrder"])
            self.assertEqual(markup.sections[:4], ["visual", "clinic", "notice", "universe"])
            self.assertLess(markup.sections.index("community"), markup.sections.index("products"))
            self.assertIn("faq", markup.ids)
            for board in self.data["clinicDemo"]["community"]["boards"]:
                with self.subTest(board=board["id"]):
                    self.assertIn(board["id"], markup.ids)
                    self.assertIn(board["title"], original)
                    for post in board["posts"]:
                        self.assertIn(post["title"], original)
            for item in self.data["clinicDemo"]["products"]["items"]:
                with self.subTest(product=item["id"]):
                    self.assertIn(f"product-{item['id']}", markup.ids)
                    self.assertIn(item["name"], original)
                    self.assertIn(item["alt"], original)
            self.assertEqual(len(markup.product_carousels), 1)
            self.assertEqual(len(markup.product_slides), len(self.data["clinicDemo"]["products"]["items"]))
            self.assertEqual(len(markup.product_tabs), len(markup.product_slides))
            self.assertIn(self.data["clinicDemo"]["community"]["notice"], original)
            self.assertIn(self.data["clinicDemo"]["products"]["notice"], original)
            for guide in self.data["clinicDemo"]["visitorGuides"]:
                with self.subTest(guide=guide["id"]):
                    self.assertIn(guide["id"], markup.ids)
                    self.assertIn(guide["title"], original)
            self.assertIn(self.data["clinicDemo"]["tour"]["title"], original)
            self.assertIn(self.data["clinicDemo"]["tour"]["notice"], original)
            self.assertIn("금일 예약 현황", original)
            self.assertIn("가상의 예약 현황", original)
            self.assertTrue(markup.services)
            self.assertTrue(all(tag == "button" and attrs.get("type") == "button"
                                for tag, attrs in markup.services))
            # Section navigation must continue to match the declared page order.
            page.write_text(original.replace('id="notice" data-section', 'id="notice-missing" data-section', 1), encoding="utf-8")
            with self.assertRaises(ValueError): verify(PROJECT, output, "/suan-clinic-demo/")
            # A malformed product control must not silently publish an inaccessible slider.
            for before, after in (('data-step="-1" aria-label="이전 한방 상품"', 'data-step="0" aria-label="이전 한방 상품"'),
                                  ('aria-controls="product-gongjindan"', 'aria-controls="missing-product"')):
                with self.subTest(control=before):
                    self.assertIn(before, original)
                    page.write_text(original.replace(before, after, 1), encoding="utf-8")
                    with self.assertRaises(ValueError): verify(PROJECT, output, "/suan-clinic-demo/")
            for fragment in ('<form action="/booking"></form>', '<a href="tel:012345">전화</a>', '<a href="/play">게임</a>'):
                with self.subTest(fragment=fragment):
                    page.write_text(original.replace("</body>", fragment + "</body>"), encoding="utf-8")
                    with self.assertRaises(ValueError): verify(PROJECT, output, "/suan-clinic-demo/")
