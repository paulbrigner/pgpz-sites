import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { reorderClientResources, ZecShelfClient, type ZecShelfResource } from "@pgpz/zec-shelf/client";
import { COMMUNITY_ZEC_SHELF_CLIENT_CONFIG } from "@/lib/zec-shelf-config";

afterEach(cleanup);

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
    render(<ZecShelfClient initialResources={[RESOURCE]} isAdmin={false} config={COMMUNITY_ZEC_SHELF_CLIENT_CONFIG} />);

    expect(screen.getByText(/Last update observed/i)).toBeInTheDocument();
    expect(screen.queryByText("No change")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add resource/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Check for updates/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Edit$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Remove$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Move Zcash Community/i })).not.toBeInTheDocument();
    expect(screen.queryByText("01")).not.toBeInTheDocument();
  });

  it("shows maintenance controls and check state to administrators", () => {
    render(<ZecShelfClient initialResources={[RESOURCE]} isAdmin config={COMMUNITY_ZEC_SHELF_CLIENT_CONFIG} />);

    expect(screen.getByRole("button", { name: /Add resource/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Check for updates/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Edit$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Remove$/i })).toBeInTheDocument();
    expect(screen.getByText("No change")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Move Zcash Community to top/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Move Zcash Community to bottom/i })).toBeInTheDocument();
    expect(screen.queryByText("01")).not.toBeInTheDocument();
  });

  it("shows operable category overflow cues when more filters are available", async () => {
    const user = userEvent.setup();
    const resources = Array.from({ length: 8 }, (_, index) => ({
      ...RESOURCE,
      id: `resource-${index}`,
      title: `Resource ${index}`,
      category: `Category ${index}`,
      position: index,
    }));
    render(<ZecShelfClient initialResources={resources} isAdmin={false} config={COMMUNITY_ZEC_SHELF_CLIENT_CONFIG} />);

    const categories = screen.getByRole("group", { name: "Filter by category" });
    Object.defineProperties(categories, {
      clientWidth: { configurable: true, value: 920 },
      scrollLeft: { configurable: true, value: 0, writable: true },
      scrollWidth: { configurable: true, value: 920 },
      scrollBy: {
        configurable: true,
        value: ({ left = 0 }: ScrollToOptions) => {
          const maxScrollLeft = Math.max(0, categories.scrollWidth - categories.clientWidth);
          categories.scrollLeft = Math.min(maxScrollLeft, Math.max(0, categories.scrollLeft + left));
          fireEvent.scroll(categories);
        },
      },
    });
    fireEvent(window, new Event("resize"));
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Show more categories" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Show previous categories" })).not.toBeInTheDocument();
    });

    Object.defineProperty(categories, "clientWidth", { configurable: true, value: 320 });
    fireEvent(window, new Event("resize"));

    expect(screen.getByRole("button", { name: "All resources" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Category 0" }));
    expect(screen.getByRole("button", { name: "Category 0" })).toHaveAttribute("aria-pressed", "true");

    for (let click = 0; click < 3; click += 1) {
      await user.click(await screen.findByRole("button", { name: "Show more categories" }));
    }
    expect(categories.scrollLeft).toBeGreaterThan(0);
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Show more categories" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Show previous categories" })).toHaveFocus();
    });

    for (let click = 0; click < 3; click += 1) {
      await user.click(screen.getByRole("button", { name: "Show previous categories" }));
    }
    expect(categories.scrollLeft).toBe(0);
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Show previous categories" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Show more categories" })).toHaveFocus();
    });
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
