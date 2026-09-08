import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentLibrary } from "@/components/documents/DocumentLibrary";
import type { LibraryCategory } from "@/lib/document-library";

const libraryMocks = vi.hoisted(() => ({ refresh: vi.fn(), fetchWithBoardStepUp: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: libraryMocks.refresh }) }));
vi.mock("@/lib/step-up-client", () => ({ fetchWithBoardStepUp: libraryMocks.fetchWithBoardStepUp }));

afterEach(() => cleanup());
beforeEach(() => {
  libraryMocks.refresh.mockReset();
  libraryMocks.fetchWithBoardStepUp.mockReset();
});

const categories: LibraryCategory[] = [
  {
    key: "policies",
    label: "Policies",
    description: "Board policies and procedures.",
    documents: [{
      documentId: "policy-1", title: "Conflict of Interest Policy", description: "Disclosure and recusal policy.",
      category: "policies", categoryLabel: "Policies", collectionId: null, collectionLabel: null, role: "document",
      typeLabel: "PDF", fileType: "PDF", versionLabel: "v2", updatedAt: "2026-08-12T00:00:00.000Z", byteLength: 2048,
      status: "active",
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
      typeLabel: "Checksum", fileType: "TXT", versionLabel: "v4", updatedAt: "2026-08-12T00:00:00.000Z", byteLength: 1024,
      status: "active",
      versionCount: 1, versions: [{ versionId: "checksum-v1", sequence: 1, uploadedAt: "2026-08-12T00:00:00.000Z", byteLength: 1024, downloadHref: "/api/documents/checksums/download?version=checksum-v1" }],
      downloadHref: "/api/documents/checksums/download",
    }],
  },
];

const mixedCategories: LibraryCategory[] = categories.map((category) => ({
  ...category,
  documents: [...category.documents, category.key === "policies" ? {
    ...category.documents[0], documentId: "archived-policy", title: "Previous Conflict Policy", status: "archived" as const,
    downloadHref: "/api/documents/archived-policy/download",
  } : {
    ...category.documents[0], documentId: "brand-package", title: "PGPZ Identity Package", role: "package" as const,
    typeLabel: "Package", fileType: "ZIP", downloadHref: "/api/documents/brand-package/download",
  }],
}));

describe("DocumentLibrary", () => {
  it("keeps the brand folder and its collections collapsed until opened", () => {
    render(<DocumentLibrary categories={categories} />);
    expect(screen.getByRole("button", { name: /Brand & Trademark/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: /PGPZ Brand v4/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Brand & Trademark/ }));
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

  it("shows management controls only to document managers", () => {
    const { rerender } = render(<DocumentLibrary categories={categories} />);
    expect(screen.queryByRole("button", { name: "Add document" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Filter by document status" })).not.toBeInTheDocument();

    rerender(<DocumentLibrary categories={categories} canManage />);
    expect(screen.getByRole("button", { name: "Add document" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Filter by document status" })).toBeVisible();
  });

  it("defaults to active records and lets managers select all or archived documents", () => {
    render(<DocumentLibrary categories={mixedCategories} canManage />);
    const status = screen.getByRole("combobox", { name: "Filter by document status" });
    expect(status).toHaveValue("active");
    expect(screen.getByText("3 documents shown")).toBeVisible();
    fireEvent.change(status, { target: { value: "all" } });
    expect(screen.getByText("4 documents shown")).toBeVisible();
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by category" }), { target: { value: "policies" } });
    expect(screen.getByRole("link", { name: "Conflict of Interest Policy" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Previous Conflict Policy" })).toBeVisible();
    expect(screen.getByText("Archived", { selector: "span" })).toBeVisible();
    fireEvent.change(status, { target: { value: "archived" } });
    expect(screen.getByText("1 document shown")).toBeVisible();
    expect(screen.queryByRole("link", { name: "Conflict of Interest Policy" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Previous Conflict Policy" })).toBeVisible();
  });

  it("combines search, status, category, collection, and actual file type, then clears them", () => {
    render(<DocumentLibrary categories={mixedCategories} canManage />);
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by document status" }), { target: { value: "all" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by category" }), { target: { value: "brand-trademark" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by collection" }), { target: { value: "pgpz-brand-v4" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by file type" }), { target: { value: "ZIP" } });
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "  identity  " } });
    expect(screen.getByText("1 document shown")).toBeVisible();
    expect(screen.getByRole("link", { name: "PGPZ Identity Package" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "PGPZ Brand Package Checksums — Version 4" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by file type" }), { target: { value: "PDF" } });
    expect(screen.getByText("No documents match these filters.")).toBeVisible();
    expect(screen.getByText("0 documents shown")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(screen.getByRole("combobox", { name: "Filter by document status" })).toHaveValue("active");
    for (const name of ["category", "collection", "file type"]) expect(screen.getByRole("combobox", { name: `Filter by ${name}` })).toHaveValue("all");
    expect(screen.getByText("3 documents shown")).toBeVisible();
    expect(screen.getByRole("button", { name: /Brand & Trademark/ })).toHaveAttribute("aria-expanded", "false");
  });

  it("filters documents without a collection and keeps options available across status changes", () => {
    render(<DocumentLibrary categories={mixedCategories} canManage />);
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by collection" }), { target: { value: "none" } });
    expect(screen.getByRole("link", { name: "Conflict of Interest Policy" })).toBeVisible();
    expect(screen.getByText("1 document shown")).toBeVisible();
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by document status" }), { target: { value: "archived" } });
    expect(screen.getByRole("link", { name: "Previous Conflict Policy" })).toBeVisible();
    expect(screen.getByRole("option", { name: "ZIP" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "PGPZ Brand v4" })).toBeInTheDocument();
  });

  it("preserves the selected file type when a version refresh removes its last match", () => {
    const { rerender } = render(<DocumentLibrary categories={mixedCategories} canManage />);
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by file type" }), { target: { value: "ZIP" } });
    expect(screen.getByText("1 document shown")).toBeVisible();
    const refreshed = mixedCategories.map((category) => ({ ...category, documents: category.documents.map((document) => document.fileType === "ZIP" ? { ...document, fileType: "PDF" } : document) }));
    rerender(<DocumentLibrary categories={refreshed} canManage />);
    expect(screen.getByRole("combobox", { name: "Filter by file type" })).toHaveValue("ZIP");
    expect(screen.getByText("0 documents shown")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByText("3 documents shown")).toBeVisible();
    expect(screen.queryByRole("option", { name: "ZIP" })).not.toBeInTheDocument();
  });

  it("opens an archived record and its history through a manager's direct link", () => {
    render(<DocumentLibrary categories={mixedCategories} canManage focusDocumentId="archived-policy" showFocusedHistory />);
    expect(screen.getByRole("combobox", { name: "Filter by document status" })).toHaveValue("archived");
    expect(screen.getByRole("link", { name: "Previous Conflict Policy" })).toBeVisible();
    expect(screen.getByText("Version history")).toBeVisible();
  });

  it("excludes archived records and their filter metadata for non-managers", () => {
    const archivedOnly: LibraryCategory = {
      key: "agreements", label: "Agreements", description: "Archived only",
      documents: [{ ...mixedCategories[0].documents[1], category: "agreements", collectionId: "private-collection", collectionLabel: "Archived collection", fileType: "CSV" }],
    };
    render(<DocumentLibrary categories={[...mixedCategories, archivedOnly]} focusDocumentId="archived-policy" />);
    expect(screen.queryByRole("combobox", { name: "Filter by document status" })).not.toBeInTheDocument();
    expect(screen.getByText("3 documents shown")).toBeVisible();
    expect(screen.queryByRole("option", { name: "Agreements" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Archived collection" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("combobox", { name: "Filter by file type" })).queryByRole("option", { name: "CSV" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "previous" } });
    expect(screen.getByText("0 documents shown")).toBeVisible();
    expect(screen.queryByRole("link", { name: "Previous Conflict Policy" })).not.toBeInTheDocument();
  });

  it("updates a display name from the document's contextual controls", async () => {
    libraryMocks.fetchWithBoardStepUp.mockResolvedValue({ ok: true, json: async () => ({}) });
    render(<DocumentLibrary categories={categories} canManage />);
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by category" }), { target: { value: "policies" } });
    fireEvent.click(screen.getByRole("button", { name: "Manage Conflict of Interest Policy" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Display name" }), { target: { value: "Board Conflict of Interest Policy" } });
    fireEvent.click(screen.getByRole("button", { name: "Save display name" }));

    await waitFor(() => expect(libraryMocks.fetchWithBoardStepUp).toHaveBeenCalledOnce());
    const [, init] = libraryMocks.fetchWithBoardStepUp.mock.calls[0];
    expect(JSON.parse(String(init.body))).toMatchObject({
      action: "updateDisplayName",
      documentId: "policy-1",
      displayName: "Board Conflict of Interest Policy",
    });
    expect(libraryMocks.refresh).toHaveBeenCalledOnce();
  });
});
