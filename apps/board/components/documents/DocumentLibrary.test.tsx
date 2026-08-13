import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { DocumentLibrary } from "@/components/documents/DocumentLibrary";
import type { LibraryCategory } from "@/lib/document-library";

afterEach(() => cleanup());

const categories: LibraryCategory[] = [
  {
    key: "policies",
    label: "Policies",
    description: "Board policies and procedures.",
    documents: [{
      documentId: "policy-1", title: "Conflict of Interest Policy", description: "Disclosure and recusal policy.",
      category: "policies", categoryLabel: "Policies", collectionId: null, collectionLabel: null, role: "document",
      typeLabel: "PDF", versionLabel: "v2", updatedAt: "2026-08-12T00:00:00.000Z", byteLength: 2048,
      versionCount: 1, versions: [{ versionId: "policy-v1", sequence: 1, uploadedAt: "2026-08-12T00:00:00.000Z", byteLength: 2048, downloadHref: "/api/documents/policy-1/download?version=policy-v1" }],
      downloadHref: "/api/documents/policy-1/download",
    }],
  },
  {
    key: "brand-trademark",
    label: "Brand & Trademark",
    description: "Brand packages and integrity records.",
    documents: [{
      documentId: "checksums", title: "PGPZ Brand Package Checksums — Version 4", description: "SHA-256 checksums.",
      category: "brand-trademark", categoryLabel: "Brand & Trademark", collectionId: "pgpz-brand-v4", collectionLabel: "PGPZ Brand v4", role: "checksum",
      typeLabel: "Checksum", versionLabel: "v4", updatedAt: "2026-08-12T00:00:00.000Z", byteLength: 1024,
      versionCount: 1, versions: [{ versionId: "checksum-v1", sequence: 1, uploadedAt: "2026-08-12T00:00:00.000Z", byteLength: 1024, downloadHref: "/api/documents/checksums/download?version=checksum-v1" }],
      downloadHref: "/api/documents/checksums/download",
    }],
  },
];

describe("DocumentLibrary", () => {
  it("opens the brand folder but keeps its collections collapsed by default", () => {
    render(<DocumentLibrary categories={categories} />);
    expect(screen.getByRole("button", { name: /Brand & Trademark/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /PGPZ Brand v4/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "PGPZ Brand Package Checksums — Version 4" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /PGPZ Brand v4/ }));
    expect(screen.getByRole("link", { name: "PGPZ Brand Package Checksums — Version 4" })).toHaveAttribute("href", "/api/documents/checksums/download");
  });

  it("opens and highlights a linked record with its version history", () => {
    render(<DocumentLibrary categories={categories} focusDocumentId="checksums" showFocusedHistory />);
    expect(screen.getByRole("button", { name: /PGPZ Brand v4/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Version history")).toBeVisible();
    expect(screen.getByRole("link", { name: "Open this version" })).toHaveAttribute("href", "/api/documents/checksums/download?version=checksum-v1");
  });

  it("searches across folders and filters by category", () => {
    render(<DocumentLibrary categories={categories} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search documents" }), { target: { value: "conflict" } });
    expect(screen.getByRole("button", { name: /Policies/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Brand & Trademark/ })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search documents" }), { target: { value: "" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by category" }), { target: { value: "brand-trademark" } });
    expect(screen.getByRole("button", { name: /Brand & Trademark/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Policies/ })).not.toBeInTheDocument();
  });
});
