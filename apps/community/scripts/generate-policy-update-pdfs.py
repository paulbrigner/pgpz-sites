#!/usr/bin/env python3
"""Generate branded PGPZ Community policy update PDFs from app content."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    Image,
    KeepTogether,
    ListFlowable,
    ListItem,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

ROOT = Path(__file__).resolve().parents[1]

BRAND = {
    "gold": colors.HexColor("#F5A800"),
    "gold_soft": colors.HexColor("#FFE6A3"),
    "gold_deep": colors.HexColor("#8A5A00"),
    "ink": colors.HexColor("#1E1E1E"),
    "coal": colors.HexColor("#17130A"),
    "teal": colors.HexColor("#1F6F68"),
    "cloud": colors.HexColor("#FFF3CA"),
    "ice": colors.HexColor("#FFF9EA"),
    "slate": colors.HexColor("#475569"),
    "line": colors.HexColor("#E2D3A7"),
    "white": colors.white,
}

PDF_PATH_BY_SLUG = {
    "2026-06-08-weekly-policy-memo": ROOT / "public/resources/2026-06-08-weekly-policy-memo.pdf",
    "1H2026-us-digital-asset-policy": ROOT / "public/resources/1H2026-us-digital-asset-policy.pdf",
}


def load_policy_updates() -> list[dict[str, Any]]:
    command = [
        "npx",
        "--yes",
        "tsx",
        "-e",
        "import { policyUpdates } from './lib/policy-updates.ts'; console.log(JSON.stringify(policyUpdates));",
    ]
    result = subprocess.run(command, cwd=ROOT, check=True, text=True, capture_output=True)
    return json.loads(result.stdout)


def clean(value: str) -> str:
    replacements = {
        "\u2018": "'",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\u2013": "-",
        "\u2014": "-",
        "\u00a0": " ",
    }
    for old, new in replacements.items():
        value = value.replace(old, new)
    return value


def esc(value: str) -> str:
    return (
        clean(value)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def make_styles() -> dict[str, ParagraphStyle]:
    sample = getSampleStyleSheet()
    return {
        "kicker": ParagraphStyle(
            "Kicker",
            parent=sample["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=10,
            textColor=BRAND["gold_deep"],
            uppercase=True,
            spaceAfter=8,
        ),
        "title": ParagraphStyle(
            "Title",
            parent=sample["Title"],
            fontName="Helvetica-Bold",
            fontSize=26,
            leading=31,
            textColor=BRAND["ink"],
            alignment=TA_LEFT,
            spaceAfter=12,
        ),
        "cover_meta": ParagraphStyle(
            "CoverMeta",
            parent=sample["Normal"],
            fontName="Helvetica-Bold",
            fontSize=10,
            leading=13,
            textColor=BRAND["gold_deep"],
            spaceAfter=16,
        ),
        "summary": ParagraphStyle(
            "Summary",
            parent=sample["BodyText"],
            fontName="Helvetica",
            fontSize=11,
            leading=17,
            textColor=BRAND["slate"],
            spaceAfter=10,
        ),
        "h1": ParagraphStyle(
            "Heading1",
            parent=sample["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=16,
            leading=21,
            textColor=BRAND["ink"],
            spaceBefore=4,
            spaceAfter=8,
        ),
        "body": ParagraphStyle(
            "Body",
            parent=sample["BodyText"],
            fontName="Helvetica",
            fontSize=9.6,
            leading=14.4,
            textColor=BRAND["slate"],
            spaceAfter=8,
        ),
        "bullet": ParagraphStyle(
            "Bullet",
            parent=sample["BodyText"],
            fontName="Helvetica",
            fontSize=9.3,
            leading=13.2,
            textColor=BRAND["slate"],
            leftIndent=10,
        ),
        "box_heading": ParagraphStyle(
            "BoxHeading",
            parent=sample["Normal"],
            fontName="Helvetica-Bold",
            fontSize=9,
            leading=11,
            textColor=BRAND["ink"],
            spaceAfter=8,
        ),
        "small": ParagraphStyle(
            "Small",
            parent=sample["Normal"],
            fontName="Helvetica",
            fontSize=7.5,
            leading=10,
            textColor=BRAND["slate"],
        ),
        "table_head": ParagraphStyle(
            "TableHead",
            parent=sample["Normal"],
            fontName="Helvetica-Bold",
            fontSize=7.1,
            leading=8.4,
            textColor=BRAND["white"],
            alignment=TA_LEFT,
        ),
        "table_cell": ParagraphStyle(
            "TableCell",
            parent=sample["Normal"],
            fontName="Helvetica",
            fontSize=7.4,
            leading=9.2,
            textColor=BRAND["slate"],
        ),
        "table_first": ParagraphStyle(
            "TableFirst",
            parent=sample["Normal"],
            fontName="Helvetica-Bold",
            fontSize=7.4,
            leading=9.2,
            textColor=BRAND["ink"],
        ),
        "footer": ParagraphStyle(
            "Footer",
            parent=sample["Normal"],
            fontName="Helvetica",
            fontSize=7.2,
            leading=9,
            textColor=colors.HexColor("#786A45"),
            alignment=TA_CENTER,
        ),
    }


def header_footer(canvas, doc):
    canvas.saveState()
    width, height = LETTER
    canvas.setFillColor(BRAND["coal"])
    canvas.rect(0, height - 0.42 * inch, width, 0.42 * inch, fill=1, stroke=0)
    canvas.setFillColor(BRAND["gold"])
    canvas.rect(0, height - 0.45 * inch, width, 0.03 * inch, fill=1, stroke=0)
    canvas.setFont("Helvetica-Bold", 8)
    canvas.setFillColor(BRAND["gold_soft"])
    canvas.drawString(doc.leftMargin, height - 0.27 * inch, "PGPZ Community")
    canvas.setFont("Helvetica", 7.4)
    canvas.setFillColor(colors.HexColor("#E8D7A4"))
    canvas.drawRightString(width - doc.rightMargin, height - 0.27 * inch, "Member policy resource")

    footer_text = f"community.pgpz.org  |  PGPZ Community  |  Page {doc.page}"
    canvas.setFillColor(colors.HexColor("#786A45"))
    canvas.setFont("Helvetica", 7.2)
    canvas.drawCentredString(width / 2, 0.34 * inch, footer_text)
    canvas.restoreState()


def branded_rule(width: float) -> Table:
    rule = Table([[""]], colWidths=[width], rowHeights=[4])
    rule.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), BRAND["gold"]),
                ("LINEBELOW", (0, 0), (-1, -1), 0, BRAND["gold"]),
            ]
        )
    )
    return rule


def bullet_list(items: list[str], styles: dict[str, ParagraphStyle]) -> ListFlowable:
    return ListFlowable(
        [ListItem(Paragraph(esc(item), styles["bullet"]), leftIndent=8) for item in items],
        bulletType="bullet",
        start="circle",
        leftIndent=14,
        bulletFontSize=6,
        bulletColor=BRAND["gold_deep"],
    )


def callout(title: str, items: list[str], styles: dict[str, ParagraphStyle], width: float, fill) -> Table:
    body = [Paragraph(esc(title), styles["box_heading"]), bullet_list(items, styles)]
    table = Table([[body]], colWidths=[width])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), fill),
                ("BOX", (0, 0), (-1, -1), 0.7, BRAND["line"]),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                ("TOPPADDING", (0, 0), (-1, -1), 11),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 11),
            ]
        )
    )
    return table


def policy_table(data: dict[str, Any], styles: dict[str, ParagraphStyle], width: float) -> Table:
    col_widths = [width * 0.31, width * 0.34, width * 0.35]
    rows = [
        [Paragraph(esc(column), styles["table_head"]) for column in data["columns"]]
    ]
    for row in data["rows"]:
        rows.append(
            [
                Paragraph(esc(row[0]), styles["table_first"]),
                Paragraph(esc(row[1]), styles["table_cell"]),
                Paragraph(esc(row[2]), styles["table_cell"]),
            ]
        )
    table = Table(rows, colWidths=col_widths, repeatRows=1, splitByRow=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), BRAND["coal"]),
                ("BOX", (0, 0), (-1, -1), 0.6, BRAND["line"]),
                ("GRID", (0, 0), (-1, -1), 0.35, BRAND["line"]),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                ("BACKGROUND", (0, 1), (-1, -1), colors.white),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, BRAND["ice"]]),
            ]
        )
    )
    return table


def cover_image(update: dict[str, Any], max_width: float, max_height: float) -> Image | None:
    image_path = ROOT / update["coverImage"].lstrip("/")
    if not image_path.exists():
        return None
    image = Image(str(image_path))
    image._restrictSize(max_width, max_height)
    return image


def build_pdf(update: dict[str, Any]) -> None:
    output_path = PDF_PATH_BY_SLUG[update["slug"]]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    styles = make_styles()

    doc = BaseDocTemplate(
        str(output_path),
        pagesize=LETTER,
        leftMargin=0.72 * inch,
        rightMargin=0.72 * inch,
        topMargin=0.72 * inch,
        bottomMargin=0.58 * inch,
        title=clean(update["title"]),
        author="PGPZ Community",
        subject=clean(update["summary"]),
    )
    frame = Frame(
        doc.leftMargin,
        doc.bottomMargin,
        doc.width,
        doc.height - 0.1 * inch,
        id="normal",
        showBoundary=0,
    )
    doc.addPageTemplates([PageTemplate(id="resource", frames=[frame], onPage=header_footer)])

    story: list[Any] = []
    width = doc.width

    story.append(Spacer(1, 0.18 * inch))
    story.append(Paragraph("PGPZ Community member resource", styles["kicker"]))
    story.append(Paragraph(esc(update["title"]), styles["title"]))
    story.append(Paragraph(f"{esc(update['categoryLabel'])} | {esc(update['displayDate'])}", styles["cover_meta"]))
    story.append(branded_rule(width))
    story.append(Spacer(1, 0.18 * inch))

    img = cover_image(update, 1.55 * inch, 2.0 * inch)
    if img:
        summary_cell = [
            Paragraph(esc(update["summary"]), styles["summary"]),
            Spacer(1, 0.08 * inch),
            Paragraph("Prepared for active PGPZ Community members at community.pgpz.org.", styles["small"]),
        ]
        cover = Table([[summary_cell, img]], colWidths=[width - 1.85 * inch, 1.85 * inch])
        cover.setStyle(
            TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ]
            )
        )
        story.append(cover)
    else:
        story.append(Paragraph(esc(update["summary"]), styles["summary"]))

    story.append(Spacer(1, 0.18 * inch))
    box_width = (width - 0.18 * inch) / 2
    takeaways = callout("Key takeaways", update["keyTakeaways"], styles, box_width, BRAND["ice"])
    actions = callout("Action items", update["actionItems"], styles, box_width, colors.HexColor("#F6FFFC"))
    pair = Table([[takeaways, actions]], colWidths=[box_width, box_width])
    pair.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    story.append(pair)
    story.append(PageBreak())

    for section in update["sections"]:
        block: list[Any] = [Paragraph(esc(section["heading"]), styles["h1"])]
        for paragraph in section.get("body", []):
            block.append(Paragraph(esc(paragraph), styles["body"]))
        if section.get("table"):
            block.append(Spacer(1, 0.05 * inch))
            block.append(policy_table(section["table"], styles, width))
            block.append(Spacer(1, 0.08 * inch))
        if section.get("bullets"):
            block.append(bullet_list(section["bullets"], styles))
        block.append(Spacer(1, 0.08 * inch))
        story.append(KeepTogether(block[:2]))
        story.extend(block[2:])

    doc.build(story)


def main() -> None:
    updates = load_policy_updates()
    for update in updates:
        if update["slug"] in PDF_PATH_BY_SLUG:
            build_pdf(update)
            print(PDF_PATH_BY_SLUG[update["slug"]])


if __name__ == "__main__":
    main()
