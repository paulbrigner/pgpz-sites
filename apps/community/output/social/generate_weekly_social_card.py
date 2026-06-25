#!/usr/bin/env python3
from __future__ import annotations

import argparse
import textwrap
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[2]
SOCIAL_DIR = ROOT / "output" / "social"
REFERENCE_CARD = SOCIAL_DIR / "pgpz-x-article-weekly-policy-memo-2026-06-08.png"
LOGO_FALLBACK = ROOT / "public" / "pgp_profile_image.png"

BASE_WIDTH = 1600
BASE_HEIGHT = 640

PLATFORMS = {
    "x": {
        "width": 1600,
        "height": 640,
        "safe_scale": 1.0,
        "description": "X Article header, 5:2",
    },
    "linkedin": {
        "width": 1200,
        "height": 627,
        "safe_scale": 0.88,
        "description": "LinkedIn custom post/link image, 1.91:1",
    },
}

COAL = (28, 24, 15)
GOLD = (245, 168, 0)
GOLD_SOFT = (255, 231, 166)
GOLD_DEEP = (122, 80, 7)
TEAL = (31, 120, 112)
CREAM = (255, 251, 239)
WHITE = (250, 250, 248)
BLACK = (34, 34, 34)
LINE = (224, 229, 236)


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size=size)


@dataclass(frozen=True)
class LayoutFrame:
    width: int
    height: int
    scale: float
    offset_x: float
    offset_y: float

    @classmethod
    def for_canvas(cls, width: int, height: int, safe_scale: float = 1.0) -> "LayoutFrame":
        scale = min(width / BASE_WIDTH, height / BASE_HEIGHT) * safe_scale
        return cls(
            width=width,
            height=height,
            scale=scale,
            offset_x=(width - BASE_WIDTH * scale) / 2,
            offset_y=(height - BASE_HEIGHT * scale) / 2,
        )

    def n(self, value: float) -> int:
        return max(1, round(value * self.scale))

    def p(self, x: float, y: float) -> tuple[int, int]:
        return (round(self.offset_x + x * self.scale), round(self.offset_y + y * self.scale))

    def b(self, x1: float, y1: float, x2: float, y2: float) -> tuple[int, int, int, int]:
        p1 = self.p(x1, y1)
        p2 = self.p(x2, y2)
        return (p1[0], p1[1], p2[0], p2[1])


def load_fonts(scale: float) -> dict[str, ImageFont.FreeTypeFont]:
    arial = "/System/Library/Fonts/Supplemental/Arial.ttf"
    arial_bold = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
    scaled = lambda size: max(10, round(size * scale))
    return {
        "brand": font(arial_bold, scaled(24)),
        "pill": font(arial_bold, scaled(28)),
        "title": font(arial_bold, scaled(76)),
        "subtitle": font(arial, scaled(31)),
        "date": font(arial_bold, scaled(32)),
        "url": font(arial, scaled(26)),
        "footer": font(arial, scaled(25)),
        "doc_brand": font(arial_bold, scaled(24)),
        "doc_title": font(arial_bold, scaled(29)),
        "doc_label": font(arial_bold, scaled(23)),
    }


def draw_background(draw: ImageDraw.ImageDraw, frame: LayoutFrame) -> None:
    for x in range(frame.width):
        t = x / (frame.width - 1)
        draw.line(
            [(x, 0), (x, frame.height)],
            fill=(
                int(COAL[0] * (1 - t) + 58 * t),
                int(COAL[1] * (1 - t) + 42 * t),
                int(COAL[2] * (1 - t) + 10 * t),
            ),
        )

    for offset in range(-frame.height, frame.width, max(30, frame.n(92))):
        draw.line([(offset, frame.height), (offset + frame.height, 0)], fill=(92, 74, 35), width=1)

    for bbox in [
        (-110, -210, 560, 350),
        (960, -190, 1570, 430),
        (950, 80, 1760, 900),
        (330, -250, 1130, 690),
    ]:
        draw.ellipse(frame.b(*bbox), outline=(106, 76, 5), width=1)

    draw.rounded_rectangle(
        frame.b(28, 28, BASE_WIDTH - 28, BASE_HEIGHT - 28),
        radius=frame.n(32),
        outline=GOLD,
        width=max(1, frame.n(2)),
    )
    draw.rounded_rectangle(frame.b(48, 52, 64, BASE_HEIGHT - 52), radius=frame.n(8), fill=GOLD)


def paste_reference_badge(image: Image.Image, frame: LayoutFrame) -> None:
    if REFERENCE_CARD.exists():
        reference = Image.open(REFERENCE_CARD).convert("RGBA")
        badge = reference.crop((104, 82, 225, 203))
        badge = badge.resize((frame.n(badge.width), frame.n(badge.height)), Image.Resampling.LANCZOS)
        mask = Image.new("L", badge.size, 0)
        mask_draw = ImageDraw.Draw(mask)
        mask_draw.ellipse((0, 0, badge.width - 1, badge.height - 1), fill=255)
        image.paste(badge, frame.p(104, 82), mask)
        return

    logo_size = frame.n(96)
    logo = Image.open(LOGO_FALLBACK).convert("RGBA").resize((logo_size, logo_size), Image.Resampling.LANCZOS)
    mask = Image.new("L", (logo_size, logo_size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.ellipse((0, 0, logo_size, logo_size), fill=255)
    draw = ImageDraw.Draw(image)
    center = frame.p(164, 142)
    draw.ellipse(
        (center[0] - frame.n(60), center[1] - frame.n(60), center[0] + frame.n(60), center[1] + frame.n(60)),
        fill=GOLD,
    )
    draw.ellipse(
        (center[0] - frame.n(50), center[1] - frame.n(50), center[0] + frame.n(50), center[1] + frame.n(50)),
        fill=(255, 247, 220),
    )
    image.paste(logo, (center[0] - frame.n(48), center[1] - frame.n(48)), mask)


def draw_header(draw: ImageDraw.ImageDraw, fonts: dict[str, ImageFont.FreeTypeFont], frame: LayoutFrame) -> None:
    draw.text(frame.p(252, 90), "P G P Z   C O M M U N I T Y", font=fonts["brand"], fill=GOLD_SOFT)
    draw.rounded_rectangle(frame.b(252, 138, 490, 184), radius=frame.n(23), fill=GOLD)
    draw.text(frame.p(272, 151), "Weekly Update", font=fonts["pill"], fill=(16, 20, 24))


def draw_main_copy(
    draw: ImageDraw.ImageDraw,
    fonts: dict[str, ImageFont.FreeTypeFont],
    *,
    summary: str,
    week_label: str,
    frame: LayoutFrame,
) -> None:
    draw.text(frame.p(104, 244), "Weekly Policy", font=fonts["title"], fill=WHITE)
    draw.text(frame.p(104, 324), "Memo", font=fonts["title"], fill=WHITE)

    y = 410
    for line in textwrap.wrap(summary, width=58)[:2]:
        draw.text(frame.p(108, y), line, font=fonts["subtitle"], fill=(244, 244, 242))
        y += 42

    draw.rounded_rectangle(frame.b(104, 508, 1040, 578), radius=frame.n(22), fill=CREAM)
    draw.ellipse(frame.b(128, 527, 162, 561), fill=TEAL)
    draw.text(frame.p(184, 529), week_label, font=fonts["date"], fill=BLACK)
    draw.line((*frame.p(548, 522), *frame.p(548, 564)), fill=(223, 196, 125), width=max(1, frame.n(2)))
    draw.text(frame.p(576, 531), "community.pgpz.org/updates", font=fonts["url"], fill=GOLD_DEEP)
    draw.text(frame.p(104, 584), "Policy updates and implications for the Zcash ecosystem", font=fonts["footer"], fill=CREAM)


def draw_document(
    image: Image.Image,
    draw: ImageDraw.ImageDraw,
    fonts: dict[str, ImageFont.FreeTypeFont],
    *,
    week_label: str,
    frame: LayoutFrame,
) -> None:
    shadow = Image.new("RGBA", (frame.n(430), frame.n(500)), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.rounded_rectangle(
        (frame.n(35), frame.n(35), frame.n(385), frame.n(490)),
        radius=frame.n(18),
        fill=(0, 0, 0, 95),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(frame.n(16)))
    image.paste(shadow, frame.p(1086, 54), shadow)

    x, y, w, h = 1118, 88, 350, 453
    draw.rounded_rectangle(frame.b(x, y, x + w, y + h), radius=frame.n(18), fill=(250, 250, 250), outline=GOLD, width=1)
    draw.rounded_rectangle(frame.b(x, y, x + w, y + 88), radius=frame.n(18), fill=(31, 31, 31))
    draw.rectangle(frame.b(x, y + 70, x + w, y + 88), fill=(31, 31, 31))
    draw.text(frame.p(x + 30, y + 29), "PGPZ COMMUNITY", font=fonts["doc_brand"], fill=GOLD_SOFT)
    draw.rectangle(frame.b(x, y + 78, x + w, y + 88), fill=TEAL)

    draw.text(frame.p(x + 30, y + 126), "Weekly Policy Memo", font=fonts["doc_title"], fill=BLACK)
    draw.text(frame.p(x + 30, y + 162), week_label, font=fonts["doc_title"], fill=BLACK)

    for i, line_width in enumerate([258, 232, 268, 214]):
        yy = y + 210 + i * 24
        draw.rounded_rectangle(frame.b(x + 30, yy, x + 30 + line_width, yy + 11), radius=frame.n(5), fill=LINE)

    for i in range(3):
        x0 = x + 30 + i * 96
        draw.rectangle(frame.b(x0, y + 318, x0 + 92, y + 352), fill=(34, 34, 34))
        draw.rectangle(frame.b(x0, y + 362, x0 + 92, y + 386), fill=(242, 245, 249), outline=(221, 226, 234))
        draw.rectangle(frame.b(x0, y + 398, x0 + 92, y + 422), fill=(242, 245, 249), outline=(221, 226, 234))

    draw.text(frame.p(x + 30, y + 408), "WEEKLY MEMO", font=fonts["doc_label"], fill=GOLD_DEEP)


def render_card(args: argparse.Namespace) -> Path:
    platform = PLATFORMS[args.platform]
    frame = LayoutFrame.for_canvas(
        platform["width"],
        platform["height"],
        safe_scale=float(platform.get("safe_scale", 1.0)),
    )
    image = Image.new("RGB", (platform["width"], platform["height"]), COAL)
    draw = ImageDraw.Draw(image)
    fonts = load_fonts(frame.scale)

    draw_background(draw, frame)
    paste_reference_badge(image, frame)
    draw_header(draw, fonts, frame)
    draw_main_copy(draw, fonts, summary=args.summary, week_label=args.week_label, frame=frame)
    draw_document(image, draw, fonts, week_label=args.week_label, frame=frame)

    output = Path(args.output)
    if not output.is_absolute():
        output = ROOT / output
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output, quality=95)
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a PGPZ weekly policy social card.")
    parser.add_argument(
        "--platform",
        choices=sorted(PLATFORMS),
        default="x",
        help="Output platform/size. x = 1600x640. linkedin = 1200x627.",
    )
    parser.add_argument("--week-label", required=True, help='Date label, for example "Week of June 19, 2026".')
    parser.add_argument("--summary", required=True, help="One-sentence summary for the card subtitle.")
    parser.add_argument("--output", required=True, help="Output PNG path.")
    output = render_card(parser.parse_args())
    print(output)


if __name__ == "__main__":
    main()
