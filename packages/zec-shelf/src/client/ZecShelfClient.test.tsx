import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ZecShelfClientConfig, ZecShelfResource } from "../domain";
import { ZecShelfClient } from "./ZecShelfClient";

const CONFIG: ZecShelfClientConfig = {
  apiBasePath: "/api/catalog",
  title: "Coalition Library",
  heroEyebrow: "Member references",
  description: "A configurable resource collection.",
  collectionEyebrow: "The catalog",
  collectionTitle: "Useful resources",
  curatedForLabel: "Curated for test members",
  suggestedCategories: ["Policy", "Learning"],
  defaultCategory: "Policy",
  fallbackPreviewByResourceId: {
    resource: { url: "https://example.com/", src: "/previews/resource.png" },
  },
  theme: {
    ink: "#111827",
    secondary: "#334155",
    accent: "#f59e0b",
    accentSoft: "#fde68a",
    accentSubtle: "rgba(245, 158, 11, 0.14)",
    accentText: "#92400e",
    ice: "#f8fafc",
    teal: "#0f766e",
    surface: "#ffffff",
    focusRing: "rgba(245, 158, 11, 0.24)",
    overlay: "rgba(15, 23, 42, 0.72)",
    heroBackground: "linear-gradient(125deg, #0f172a, #334155)",
    heroBorder: "rgba(245, 158, 11, 0.28)",
  },
};

const RESOURCE: ZecShelfResource = {
  id: "resource",
  title: "Resource",
  url: "https://example.com/",
  description: "A useful resource.",
  category: "Policy",
  position: 0,
  contentSignature: "signature",
  lastCheckedAt: "2026-07-17T00:00:00.000Z",
  lastChangedAt: "2026-07-16T00:00:00.000Z",
  lastHttpStatus: 200,
  checkState: "same",
  previewUrl: null,
  previewUpdatedAt: null,
  createdAt: "2026-07-15T00:00:00.000Z",
  updatedAt: "2026-07-17T00:00:00.000Z",
};

describe("ZecShelfClient contract", () => {
  it("renders app-provided copy and URL-matched previews without member management controls", () => {
    const { container } = render(<ZecShelfClient initialResources={[RESOURCE]} isAdmin={false} config={CONFIG} />);

    expect(screen.getByRole("heading", { name: "Coalition Library" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Useful resources" })).toBeInTheDocument();
    expect(screen.getByText("Curated for test members")).toBeInTheDocument();
    expect(container.querySelector("img")?.getAttribute("src")).toContain("previews%2Fresource.png");
    expect(screen.queryByRole("button", { name: /Add resource/i })).not.toBeInTheDocument();
    expect(screen.queryByText("01")).not.toBeInTheDocument();
  });

  it("does not reuse a seeded preview after the resource URL changes", () => {
    const { container } = render(
      <ZecShelfClient
        initialResources={[{ ...RESOURCE, url: "https://changed.example/" }]}
        isAdmin={false}
        config={CONFIG}
      />,
    );

    expect(container.querySelector("img")).toBeNull();
  });

  it("shows all maintenance controls to administrators", () => {
    render(<ZecShelfClient initialResources={[RESOURCE]} isAdmin config={CONFIG} />);

    expect(screen.getByRole("button", { name: /Add resource/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Check for updates/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Edit$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Remove$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Move Resource to top/i })).toBeInTheDocument();
    expect(screen.getByText("No change")).toBeInTheDocument();
  });
});
