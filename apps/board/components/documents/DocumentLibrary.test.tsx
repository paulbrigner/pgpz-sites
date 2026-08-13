import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
      typeLabel: "PDF", versionLabel: "v2", updatedAt: "2026-08-12T00:00:00.000Z", byteLength: 2048,
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
      typeLabel: "Checksum", versionLabel: "v4", updatedAt: "2026-08-12T00:00:00.000Z", byteLength: 1024,
      status: "active",
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

  it("shows management controls only to document managers", () => {
    const { rerender } = render(<DocumentLibrary categories={categories} />);
    expect(screen.queryByRole("button", { name: "Add document" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Filter by document status" })).not.toBeInTheDocument();

    rerender(<DocumentLibrary categories={categories} canManage />);
    expect(screen.getByRole("button", { name: "Add document" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Filter by document status" })).toBeVisible();
  });

  it("updates a display name from the document's contextual controls", async () => {
    libraryMocks.fetchWithBoardStepUp.mockResolvedValue({ ok: true, json: async () => ({}) });
    render(<DocumentLibrary categories={categories} canManage />);
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by category" }), { target: { value: "policies" } });
    fireEvent.click(screen.getByRole("button", { name: /Policies/ }));
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
