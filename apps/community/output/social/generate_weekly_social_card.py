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
ARIAL = "/System/Library/Fonts/Supplemental/Arial.ttf"
ARIAL_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"

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


@dataclass(frozen=True)
class CardCopy:
    category: str
    pill_label: str
    headline: str
    display_label: str
    summary: str
    document_title: str
    document_label: str
    url: str
    footer: str


def load_fonts(scale: float) -> dict[str, ImageFont.FreeTypeFont]:
    scaled = lambda size: max(10, round(size * scale))
    return {
        "brand": font(ARIAL_BOLD, scaled(24)),
        "pill": font(ARIAL_BOLD, scaled(28)),
        "title": font(ARIAL_BOLD, scaled(76)),
        "subtitle": font(ARIAL, scaled(31)),
        "date": font(ARIAL_BOLD, scaled(32)),
        "url": font(ARIAL, scaled(26)),
        "footer": font(ARIAL, scaled(25)),
        "doc_brand": font(ARIAL_BOLD, scaled(24)),
        "doc_title": font(ARIAL_BOLD, scaled(29)),
        "doc_label": font(ARIAL_BOLD, scaled(23)),
    }


def text_width(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont) -> int:
    bbox = draw.textbbox((0, 0), text, font=font)
    return bbox[2] - bbox[0]


def ellipsize_text(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, max_width: int) -> str:
    if text_width(draw, text, font) <= max_width:
        return text

    suffix = "..."
    trimmed = text.rstrip()
    while trimmed and text_width(draw, f"{trimmed}{suffix}", font) > max_width:
        trimmed = trimmed[:-1].rstrip()
    return f"{trimmed}{suffix}" if trimmed else suffix


def wrap_text(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    lines: list[str] = []
    for raw_line in text.splitlines():
        words = raw_line.split()
        if not words:
            lines.append("")
            continue

        current = words[0]
        for word in words[1:]:
            trial = f"{current} {word}"
            if text_width(draw, trial, font) <= max_width:
                current = trial
            else:
                lines.append(current)
                current = word
        lines.append(current)
    return lines


def fit_single_line_font(
    draw: ImageDraw.ImageDraw,
    text: str,
    font_path: str,
    *,
    max_size: int,
    min_size: int,
    max_width: int,
) -> ImageFont.FreeTypeFont:
    for size in range(max_size, min_size - 1, -2):
        candidate = font(font_path, size)
        if text_width(draw, text, candidate) <= max_width:
            return candidate
    return font(font_path, min_size)


def fit_wrapped_font(
    draw: ImageDraw.ImageDraw,
    text: str,
    font_path: str,
    *,
    max_size: int,
    min_size: int,
    max_width: int,
    max_lines: int,
) -> tuple[ImageFont.FreeTypeFont, list[str]]:
    for size in range(max_size, min_size - 1, -2):
        candidate = font(font_path, size)
        lines = wrap_text(draw, text, candidate, max_width)
        if len(lines) <= max_lines:
            return candidate, lines

    fitted = font(font_path, min_size)
    lines = wrap_text(draw, text, fitted, max_width)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        lines[-1] = ellipsize_text(draw, lines[-1], fitted, max_width)
    return fitted, lines


def draw_lines(
    draw: ImageDraw.ImageDraw,
    frame: LayoutFrame,
    lines: list[str],
    *,
    x: float,
    y: float,
    line_height: float,
    font: ImageFont.FreeTypeFont,
    fill: tuple[int, int, int],
) -> float:
    for line in lines:
        draw.text(frame.p(x, y), line, font=font, fill=fill)
        y += line_height
    return y


def font_base_size(font_obj: ImageFont.FreeTypeFont, frame: LayoutFrame) -> float:
    return float(getattr(font_obj, "size", 10)) / frame.scale


def resolve_copy(args: argparse.Namespace) -> CardCopy:
    display_label = args.display_label or args.week_label
    if args.category == "weekly":
        if not display_label:
            raise ValueError("--week-label is required for weekly cards unless --display-label is provided.")
        pill_label = args.pill_label or "Weekly Update"
        headline = args.headline or "Weekly Policy Memo"
        document_title = args.document_title or f"Weekly Policy Memo\n{display_label}"
        document_label = args.document_label or "WEEKLY MEMO"
    else:
        display_label = display_label or "Special Report"
        pill_label = args.pill_label or "Special Update"
        headline = args.headline or "Special Report"
        document_title = args.document_title or headline
        document_label = args.document_label or "SPECIAL REPORT"

    return CardCopy(
        category=args.category,
        pill_label=pill_label,
        headline=headline,
        display_label=display_label,
        summary=args.summary,
        document_title=document_title,
        document_label=document_label,
        url=args.url,
        footer=args.footer,
    )


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


def draw_header(
    draw: ImageDraw.ImageDraw,
    fonts: dict[str, ImageFont.FreeTypeFont],
    frame: LayoutFrame,
    *,
    pill_label: str,
) -> None:
    draw.text(frame.p(252, 90), "P G P Z   C O M M U N I T Y", font=fonts["brand"], fill=GOLD_SOFT)
    pill_origin = frame.p(252, 138)
    pill_width = max(frame.n(238), text_width(draw, pill_label, fonts["pill"]) + frame.n(40))
    draw.rounded_rectangle(
        (pill_origin[0], pill_origin[1], pill_origin[0] + pill_width, pill_origin[1] + frame.n(46)),
        radius=frame.n(23),
        fill=GOLD,
    )
    draw.text((pill_origin[0] + frame.n(20), pill_origin[1] + frame.n(13)), pill_label, font=fonts["pill"], fill=(16, 20, 24))


def draw_main_copy(
    draw: ImageDraw.ImageDraw,
    fonts: dict[str, ImageFont.FreeTypeFont],
    *,
    copy: CardCopy,
    frame: LayoutFrame,
) -> None:
    if copy.category == "special":
        title_font, headline_lines = fit_wrapped_font(
            draw,
            copy.headline,
            ARIAL_BOLD,
            max_size=frame.n(58),
            min_size=frame.n(42),
            max_width=frame.n(900),
            max_lines=3,
        )
        title_line_height = max(54, round(font_base_size(title_font, frame) * 1.08))
    else:
        title_font = fonts["title"]
        headline_lines = wrap_text(draw, copy.headline, title_font, frame.n(880))[:3]
        title_line_height = 80

    draw_lines(draw, frame, headline_lines, x=104, y=244, line_height=title_line_height, font=title_font, fill=WHITE)

    y = 410 if copy.category == "weekly" and len(headline_lines) <= 2 else 244 + len(headline_lines) * title_line_height + 12
    for line in textwrap.wrap(copy.summary, width=58)[:2]:
        draw.text(frame.p(108, y), line, font=fonts["subtitle"], fill=(244, 244, 242))
        y += 42

    draw.rounded_rectangle(frame.b(104, 508, 1040, 578), radius=frame.n(22), fill=CREAM)
    draw.ellipse(frame.b(128, 527, 162, 561), fill=TEAL)

    label_x = frame.p(184, 0)[0]
    label_y = frame.p(0, 531)[1]
    strip_right = frame.p(1040, 0)[0]
    full_label_width = strip_right - label_x - frame.n(24)
    url_width = text_width(draw, copy.url, fonts["url"])
    label_with_url_width = full_label_width - url_width - frame.n(72)
    label_font = fit_single_line_font(
        draw,
        copy.display_label,
        ARIAL_BOLD,
        max_size=frame.n(32),
        min_size=frame.n(22),
        max_width=max(frame.n(240), label_with_url_width),
    )
    label_text = copy.display_label
    show_url = text_width(draw, label_text, label_font) <= label_with_url_width

    if not show_url:
        label_font = fit_single_line_font(
            draw,
            label_text,
            ARIAL_BOLD,
            max_size=frame.n(32),
            min_size=frame.n(20),
            max_width=full_label_width,
        )
        label_text = ellipsize_text(draw, label_text, label_font, full_label_width)

    draw.text((label_x, label_y), label_text, font=label_font, fill=BLACK)
    if show_url:
        label_width = text_width(draw, label_text, label_font)
        separator_x = min(max(frame.p(548, 0)[0], label_x + label_width + frame.n(28)), strip_right - url_width - frame.n(48))
        draw.line((separator_x, frame.p(0, 522)[1], separator_x, frame.p(0, 564)[1]), fill=(223, 196, 125), width=max(1, frame.n(2)))
        draw.text((separator_x + frame.n(28), frame.p(0, 531)[1]), copy.url, font=fonts["url"], fill=GOLD_DEEP)

    draw.text(frame.p(104, 584), copy.footer, font=fonts["footer"], fill=CREAM)


def draw_document(
    image: Image.Image,
    draw: ImageDraw.ImageDraw,
    fonts: dict[str, ImageFont.FreeTypeFont],
    *,
    copy: CardCopy,
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

    x, y, w, h = (1118, 88, 380, 453) if copy.category == "special" else (1118, 88, 350, 453)
    draw.rounded_rectangle(frame.b(x, y, x + w, y + h), radius=frame.n(18), fill=(250, 250, 250), outline=GOLD, width=1)
    draw.rounded_rectangle(frame.b(x, y, x + w, y + 88), radius=frame.n(18), fill=(31, 31, 31))
    draw.rectangle(frame.b(x, y + 70, x + w, y + 88), fill=(31, 31, 31))
    draw.text(frame.p(x + 30, y + 29), "PGPZ COMMUNITY", font=fonts["doc_brand"], fill=GOLD_SOFT)
    draw.rectangle(frame.b(x, y + 78, x + w, y + 88), fill=TEAL)

    if copy.category == "special":
        doc_title_font, title_lines = fit_wrapped_font(
            draw,
            copy.document_title,
            ARIAL_BOLD,
            max_size=frame.n(29),
            min_size=frame.n(22),
            max_width=frame.n(w - 60),
            max_lines=3,
        )
        doc_line_height = max(28, round(font_base_size(doc_title_font, frame) * 1.12))
    else:
        doc_title_font, title_lines = fit_wrapped_font(
            draw,
            copy.document_title,
            ARIAL_BOLD,
            max_size=frame.n(29),
            min_size=frame.n(23),
            max_width=frame.n(292),
            max_lines=2,
        )
        doc_line_height = 36

    draw_lines(draw, frame, title_lines, x=x + 30, y=y + 126, line_height=doc_line_height, font=doc_title_font, fill=BLACK)

    body_top = max(y + 210, y + 126 + len(title_lines) * doc_line_height + 18) if copy.category == "special" else y + 210
    for i, line_width in enumerate([258, 232, 268, 214]):
        yy = body_top + i * 24
        if copy.category == "special" and yy > y + h - 140:
            break
        draw.rounded_rectangle(frame.b(x + 30, yy, x + 30 + line_width, yy + 11), radius=frame.n(5), fill=LINE)

    table_top = y + h - 118 if copy.category == "special" else y + 318
    col_width = 96 if copy.category == "weekly" else (w - 64) / 3
    for i in range(3):
        x0 = x + 30 + i * col_width
        x1 = x0 + col_width - 4
        draw.rectangle(frame.b(x0, table_top, x1, table_top + 34), fill=(34, 34, 34))
        draw.rectangle(frame.b(x0, table_top + 44, x1, table_top + 68), fill=(242, 245, 249), outline=(221, 226, 234))
        if copy.category == "weekly":
            draw.rectangle(frame.b(x0, table_top + 80, x1, table_top + 104), fill=(242, 245, 249), outline=(221, 226, 234))

    label_y = y + h - 43 if copy.category == "special" else y + 408
    draw.text(frame.p(x + 30, label_y), copy.document_label, font=fonts["doc_label"], fill=GOLD_DEEP)


def render_card(args: argparse.Namespace) -> Path:
    platform = PLATFORMS[args.platform]
    copy = resolve_copy(args)
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
    draw_header(draw, fonts, frame, pill_label=copy.pill_label)
    draw_main_copy(draw, fonts, copy=copy, frame=frame)
    draw_document(image, draw, fonts, copy=copy, frame=frame)

    output = Path(args.output)
    if not output.is_absolute():
        output = ROOT / output
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output, quality=95)
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a PGPZ policy update social card.")
    parser.add_argument(
        "--category",
        choices=("weekly", "special"),
        default="weekly",
        help="Policy update category. Defaults to weekly.",
    )
    parser.add_argument(
        "--platform",
        choices=sorted(PLATFORMS),
        default="x",
        help="Output platform/size. x = 1600x640. linkedin = 1200x627.",
    )
    parser.add_argument("--week-label", help='Weekly date label, for example "Week of June 19, 2026".')
    parser.add_argument("--display-label", help="Label shown in the cream date/report strip.")
    parser.add_argument("--pill-label", help='Gold pill label. Defaults to "Weekly Update" or "Special Update".')
    parser.add_argument("--headline", help="Main card headline. Supports explicit line breaks.")
    parser.add_argument("--document-title", help="Mini document title. Supports explicit line breaks.")
    parser.add_argument("--document-label", help='Mini document footer label. Defaults to "WEEKLY MEMO" or "SPECIAL REPORT".')
    parser.add_argument("--summary", required=True, help="One-sentence summary for the card subtitle.")
    parser.add_argument("--url", default="community.pgpz.org/updates", help="URL shown in the cream strip.")
    parser.add_argument(
        "--footer",
        default="Policy updates and implications for the Zcash ecosystem",
        help="Small footer line shown at the bottom of the card.",
    )
    parser.add_argument("--output", required=True, help="Output PNG path.")
    args = parser.parse_args()
    try:
        output = render_card(args)
    except ValueError as exc:
        parser.error(str(exc))
    print(output)


if __name__ == "__main__":
    main()
