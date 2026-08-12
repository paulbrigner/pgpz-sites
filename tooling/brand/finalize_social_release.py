#!/usr/bin/env python3
"""Remove stale review labeling and deterministically rebuild the final social release.

This is a narrow release finalizer, not a visual redesign. It preserves every
approved asset and layout, changes only the two overview labels, replaces the
same overview image embedded in the guidelines PDF, then regenerates the
manifest, checksums, and ZIP from the resulting release directory.
"""

from __future__ import annotations

import hashlib
import json
import mimetypes
import shutil
import sys
import zipfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from pypdf import PdfReader, PdfWriter


REPO_ROOT = Path(__file__).resolve().parents[2]
PACKAGE_SLUG = "pgpz-social-brand-package-v4-companion-v1"
PACKAGE_ROOT = REPO_ROOT / "output" / PACKAGE_SLUG
ZIP_PATH = REPO_ROOT / "output" / "PGPZ-Social-Brand-Package-v4-Companion-v1.zip"
PREVIEW_PATH = PACKAGE_ROOT / "00-preview" / "PGPZ-Social-Brand-Package-Overview.png"
GUIDELINES_PATH = PACKAGE_ROOT / "08-guidelines" / "PGPZ-Social-Media-Brand-Guidelines-v4-Companion-v1.pdf"
BACKUP_ROOT = REPO_ROOT / "tmp" / "pdfs" / "brand-finalizer-backup"
FIXED_ZIP_TIME = (2026, 8, 12, 12, 0, 0)
PRIMARY_SLUG = "pgpz-brand-package-symbol-as-z-v4"
PRIMARY_ROOT = REPO_ROOT / "output" / PRIMARY_SLUG
PRIMARY_ZIP_PATH = REPO_ROOT / "output" / "PGPZ-Brand-Package-Symbol-as-Z-v4.zip"

EVERGREEN = "#0D1F20"
SOFT_GOLD = "#FFE6A3"
PAPER = "#F6FAF2"
SLATE = "#475569"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def backup_inputs() -> None:
    BACKUP_ROOT.mkdir(parents=True, exist_ok=True)
    for path in (PREVIEW_PATH, GUIDELINES_PATH, PACKAGE_ROOT / "manifest.json", PACKAGE_ROOT / "SHA256SUMS.txt", ZIP_PATH):
        if path.exists():
            shutil.copy2(path, BACKUP_ROOT / path.name)


def update_overview_image() -> None:
    font_path = PACKAGE_ROOT / "fonts" / "Inter-Semibold.ttf"
    with Image.open(PREVIEW_PATH) as source:
        image = source.convert("RGBA")
    if image.size != (2400, 1900):
        raise ValueError(f"Unexpected overview dimensions: {image.size}")

    draw = ImageDraw.Draw(image)
    subtitle_font = ImageFont.truetype(str(font_path), 25)
    footer_font = ImageFont.truetype(str(font_path), 20)

    # Redraw only the two labeling bands. All tiles and approved artwork remain
    # byte-for-byte visually unchanged outside these rectangles.
    draw.rectangle((0, 118, 1500, 170), fill=EVERGREEN)
    draw.text((72, 130), "V4 COMPANION  /  VERSION 1  /  ASSET OVERVIEW", font=subtitle_font, fill=SOFT_GOLD)
    draw.rectangle((0, 1815, 1500, 1900), fill=PAPER)
    draw.text((72, 1848), "CURRENT PACKAGE OVERVIEW", font=footer_font, fill=SLATE)

    temporary = PREVIEW_PATH.with_suffix(".tmp.png")
    image.save(temporary, format="PNG", optimize=True)
    temporary.replace(PREVIEW_PATH)


def update_embedded_pdf_overview() -> None:
    reader = PdfReader(GUIDELINES_PATH)
    writer = PdfWriter(clone_from=GUIDELINES_PATH)
    with Image.open(PREVIEW_PATH) as replacement:
        replacement_rgb = replacement.convert("RGB")
        replaced = 0
        seen: set[tuple[int, int]] = set()
        for page in writer.pages:
            for embedded in page.images:
                if embedded.image.size != (2400, 1900):
                    continue
                identity = embedded.indirect_reference.idnum, embedded.indirect_reference.generation
                if identity in seen:
                    continue
                embedded.replace(replacement_rgb, quality=95)
                seen.add(identity)
                replaced += 1
        if replaced != 1:
            raise ValueError(f"Expected one shared 2400x1900 PDF image object, replaced {replaced}.")

    writer.metadata = reader.metadata
    temporary = GUIDELINES_PATH.with_suffix(".tmp.pdf")
    with temporary.open("wb") as output:
        writer.write(output)
    verified = PdfReader(temporary)
    if len(verified.pages) != 14:
        raise ValueError(f"Expected 14 guidelines pages, found {len(verified.pages)}.")
    temporary.replace(GUIDELINES_PATH)


def update_reference_copy() -> None:
    index_path = PACKAGE_ROOT / "ASSET_INDEX.md"
    current = index_path.read_text(encoding="utf-8")
    current = current.replace(
        "One-page visual overview for review only; it is not a publishable social asset.",
        "One-page visual reference index for locating the production assets contained in the package.",
    )
    index_path.write_text(current, encoding="utf-8")


def file_record(path: Path) -> dict[str, object]:
    relative = path.relative_to(PACKAGE_ROOT).as_posix()
    record: dict[str, object] = {
        "path": relative,
        "bytes": path.stat().st_size,
        "sha256": digest(path),
        "mimeType": mimetypes.guess_type(path.name)[0] or "application/octet-stream",
    }
    if path.suffix.lower() == ".png":
        with Image.open(path) as image:
            record.update(width=image.width, height=image.height, mode=image.mode)
    return record


def release_files(*, include_manifest: bool) -> list[Path]:
    excluded = {".DS_Store", "SHA256SUMS.txt"}
    if not include_manifest:
        excluded.add("manifest.json")
    return sorted(path for path in PACKAGE_ROOT.rglob("*") if path.is_file() and path.name not in excluded)


def rebuild_manifest_and_checksums() -> None:
    records = [file_record(path) for path in release_files(include_manifest=False)]
    manifest = {
        "manifestVersion": 1,
        "package": "PGPZ Social Media Brand Package",
        "packageVersion": "v4-companion-v1",
        "released": "2026-08-12",
        "status": "CURRENT RELEASE",
        "sourceNote": "Finalized from the preserved v4 companion development package; approved artwork and platform dimensions are unchanged.",
        "scopeNote": "manifest.json and SHA256SUMS.txt are excluded from the manifest to avoid self-referential hashes",
        "validation": {
            "fileCountExcludingManifestAndChecksums": len(records),
            "pngCount": sum(record["path"].endswith(".png") for record in records),
            "svgCount": sum(record["path"].endswith(".svg") for record in records),
            "pdfCount": sum(record["path"].endswith(".pdf") for record in records),
            "releaseLabeling": "final",
            "trademarkConditionsDocumented": True,
        },
        "files": records,
    }
    manifest_path = PACKAGE_ROOT / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=False) + "\n", encoding="utf-8")

    checksum_files = release_files(include_manifest=True)
    checksum_lines = [f"{digest(path)}  {path.relative_to(PACKAGE_ROOT).as_posix()}" for path in checksum_files]
    (PACKAGE_ROOT / "SHA256SUMS.txt").write_text("\n".join(checksum_lines) + "\n", encoding="utf-8")


def rebuild_zip() -> None:
    temporary = ZIP_PATH.with_suffix(".tmp.zip")
    files = release_files(include_manifest=True)
    files.append(PACKAGE_ROOT / "SHA256SUMS.txt")
    with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in sorted(files):
            relative = Path(PACKAGE_SLUG) / path.relative_to(PACKAGE_ROOT)
            info = zipfile.ZipInfo(relative.as_posix(), FIXED_ZIP_TIME)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, path.read_bytes())
    temporary.replace(ZIP_PATH)


def clean_primary_release_metadata() -> None:
    """Exclude Finder metadata and rebuild integrity records without changing artwork."""
    primary_backup = BACKUP_ROOT / "primary"
    primary_backup.mkdir(parents=True, exist_ok=True)
    for path in (PRIMARY_ROOT / "manifest.json", PRIMARY_ROOT / "SHA256SUMS.txt", PRIMARY_ZIP_PATH):
        shutil.copy2(path, primary_backup / path.name)

    def primary_files(*, include_manifest: bool) -> list[Path]:
        excluded = {".DS_Store", "SHA256SUMS.txt"}
        if not include_manifest:
            excluded.add("manifest.json")
        return sorted(path for path in PRIMARY_ROOT.rglob("*") if path.is_file() and path.name not in excluded)

    def primary_record(path: Path) -> dict[str, object]:
        relative = path.relative_to(PRIMARY_ROOT).as_posix()
        record: dict[str, object] = {
            "path": relative,
            "bytes": path.stat().st_size,
            "sha256": digest(path),
            "mimeType": mimetypes.guess_type(path.name)[0] or "application/octet-stream",
        }
        if path.suffix.lower() == ".png":
            with Image.open(path) as image:
                record.update(width=image.width, height=image.height, mode=image.mode)
        return record

    records = [primary_record(path) for path in primary_files(include_manifest=False)]
    manifest_path = PRIMARY_ROOT / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["files"] = records
    manifest["validation"].update({
        "fileCountExcludingManifestAndChecksums": len(records),
        "pngCount": sum(record["path"].endswith(".png") for record in records),
        "svgCount": sum(record["path"].endswith(".svg") for record in records),
        "pdfCount": sum(record["path"].endswith(".pdf") for record in records),
    })
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=False) + "\n", encoding="utf-8")

    checksum_files = primary_files(include_manifest=True)
    checksum_lines = [f"{digest(path)}  {path.relative_to(PRIMARY_ROOT).as_posix()}" for path in checksum_files]
    checksum_path = PRIMARY_ROOT / "SHA256SUMS.txt"
    checksum_path.write_text("\n".join(checksum_lines) + "\n", encoding="utf-8")

    temporary = PRIMARY_ZIP_PATH.with_suffix(".tmp.zip")
    archive_files = [*primary_files(include_manifest=True), checksum_path]
    with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in sorted(set(archive_files)):
            relative = Path(PRIMARY_SLUG) / path.relative_to(PRIMARY_ROOT)
            info = zipfile.ZipInfo(relative.as_posix(), FIXED_ZIP_TIME)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, path.read_bytes())
    temporary.replace(PRIMARY_ZIP_PATH)
    print(f"primary archive: {digest(PRIMARY_ZIP_PATH)}")


def main() -> None:
    if "--primary-only" in sys.argv:
        clean_primary_release_metadata()
        print(f"backup: {BACKUP_ROOT}")
        return
    backup_inputs()
    before = digest(PREVIEW_PATH)
    update_overview_image()
    update_embedded_pdf_overview()
    update_reference_copy()
    rebuild_manifest_and_checksums()
    rebuild_zip()
    print(f"preview: {before[:16]} -> {digest(PREVIEW_PATH)[:16]}")
    print(f"guidelines: {digest(GUIDELINES_PATH)}")
    print(f"archive: {digest(ZIP_PATH)}")
    print(f"backup: {BACKUP_ROOT}")


if __name__ == "__main__":
    main()
