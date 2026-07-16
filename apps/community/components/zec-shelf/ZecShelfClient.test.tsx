import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { reorderClientResources, ZecShelfClient } from "@/components/zec-shelf/ZecShelfClient";
import type { ZecShelfResource } from "@/lib/zec-shelf";

const RESOURCE: ZecShelfResource = {
  id: "zcash-community",
  title: "Zcash Community",
  url: "https://www.zcashcommunity.com/",
  description: "An independent community hub for Zcash education and projects.",
  category: "Community",
  position: 0,
  contentSignature: "signature",
  lastCheckedAt: "2026-07-16T10:00:00.000Z",
  lastChangedAt: "2026-07-15T10:00:00.000Z",
  lastHttpStatus: 200,
  checkState: "same",
  previewUrl: null,
  previewUpdatedAt: null,
  createdAt: "2026-07-14T10:00:00.000Z",
  updatedAt: "2026-07-16T10:00:00.000Z",
};

describe("ZecShelfClient permissions", () => {
  it("shows freshness but no administrative controls to members", () => {
    render(<ZecShelfClient initialResources={[RESOURCE]} isAdmin={false} />);

    expect(screen.getByText(/Last update observed/i)).toBeInTheDocument();
    expect(screen.queryByText("No change")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add resource/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Check for updates/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Edit$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Remove$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Move Zcash Community/i })).not.toBeInTheDocument();
  });

  it("shows maintenance controls and check state to administrators", () => {
    render(<ZecShelfClient initialResources={[RESOURCE]} isAdmin />);

    expect(screen.getByRole("button", { name: /Add resource/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Check for updates/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Edit$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Remove$/i })).toBeInTheDocument();
    expect(screen.getByText("No change")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Move Zcash Community to top/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Move Zcash Community to bottom/i })).toBeInTheDocument();
  });
});

describe("ZEC Shelf reordering", () => {
  const resources = [
    { ...RESOURCE, id: "first", title: "First" },
    { ...RESOURCE, id: "second", title: "Second", position: 1 },
    { ...RESOURCE, id: "third", title: "Third", position: 2 },
  ];

  it("moves an entry directly to the top", () => {
    expect(reorderClientResources(resources, "third", "top").map((resource) => resource.id))
      .toEqual(["third", "first", "second"]);
  });

  it("moves an entry directly to the bottom", () => {
    expect(reorderClientResources(resources, "first", "bottom").map((resource) => resource.id))
      .toEqual(["second", "third", "first"]);
  });
});
