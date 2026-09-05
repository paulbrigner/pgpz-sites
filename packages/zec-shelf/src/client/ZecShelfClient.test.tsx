import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
});

describe("ZecShelfClient contract", () => {
  it("opens a shared category link case-insensitively and hides other categories", () => {
    window.history.replaceState(null, "", "/zec-shelf?category=learning");
    render(<ZecShelfClient initialResources={[RESOURCE, { ...RESOURCE, id: "learn", title: "Learning guide", category: "Learning" }]} isAdmin={false} config={CONFIG} />);
    expect(screen.getByRole("button", { name: "Learning" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("link", { name: "Learning guide" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Resource" })).not.toBeInTheDocument();
  });

  it("updates shareable category URLs and clears the filter while preserving other URL state", () => {
    window.history.replaceState({ existing: true }, "", "/zec-shelf?source=email#collection");
    render(<ZecShelfClient initialResources={[{ ...RESOURCE, category: "Research & Media" }]} isAdmin={false} config={CONFIG} />);
    fireEvent.click(screen.getByRole("button", { name: "Research & Media" }));
    expect(new URLSearchParams(window.location.search).get("category")).toBe("Research & Media");
    expect(new URLSearchParams(window.location.search).get("source")).toBe("email");
    expect(window.location.hash).toBe("#collection");
    fireEvent.click(screen.getByRole("button", { name: "All resources" }));
    expect(new URLSearchParams(window.location.search).has("category")).toBe(false);
    expect(new URLSearchParams(window.location.search).get("source")).toBe("email");
  });

  it("restores the selected category on browser history navigation", () => {
    render(<ZecShelfClient initialResources={[RESOURCE]} isAdmin={false} config={CONFIG} />);
    act(() => {
      window.history.replaceState(null, "", "/zec-shelf?category=Policy");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(screen.getByRole("button", { name: "Policy" })).toHaveAttribute("aria-pressed", "true");
    act(() => {
      window.history.replaceState(null, "", "/zec-shelf");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(screen.getByRole("button", { name: "All resources" })).toHaveAttribute("aria-pressed", "true");
  });

  it("resyncs the filter when client navigation supplies a new server category", () => {
    const resources = [RESOURCE, { ...RESOURCE, id: "learning", title: "Learning guide", category: "Learning" }];
    const { rerender } = render(<ZecShelfClient initialResources={resources} isAdmin={false} config={CONFIG} />);
    window.history.replaceState(null, "", "/zec-shelf?category=Learning");
    rerender(<ZecShelfClient initialResources={resources} initialCategory="Learning" isAdmin={false} config={CONFIG} />);
    expect(screen.getByRole("button", { name: "Learning" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("link", { name: "Resource" })).not.toBeInTheDocument();
  });

  it("shows all resources for an unknown category link", () => {
    window.history.replaceState(null, "", "/zec-shelf?category=removed-category");
    render(<ZecShelfClient initialResources={[RESOURCE]} isAdmin={false} config={CONFIG} />);
    expect(screen.getByRole("button", { name: "All resources" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("link", { name: "Resource" })).toBeInTheDocument();
  });

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


  it("falls back from a failed capture to the matching bundled preview, then to an initial", () => {
    const { container } = render(<ZecShelfClient initialResources={[{ ...RESOURCE, previewUrl: "/expired.jpg" }]} isAdmin={false} config={CONFIG} />);
    expect(container.querySelector("img")?.getAttribute("src")).toContain("expired.jpg");
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")?.getAttribute("src")).toContain("previews%2Fresource.png");
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("R")).toBeInTheDocument();
  });

  it("does not show a bundled image for a different URL after a capture fails", () => {
    const { container } = render(<ZecShelfClient initialResources={[{ ...RESOURCE, url: "https://changed.example/", previewUrl: "/expired.jpg" }]} isAdmin={false} config={CONFIG} />);
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("R")).toBeInTheDocument();
  });

  it("retries the capture after a refresh even when the service reuses its URL", async () => {
    const resource = { ...RESOURCE, previewUrl: "/capture.jpg" };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ results: [{ id: RESOURCE.id, ok: true, previewRefreshed: true }] }))
      .mockResolvedValueOnce(Response.json({ resources: [{ ...resource, previewUpdatedAt: "2026-09-05T12:00:00.000Z" }] }));
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<ZecShelfClient initialResources={[resource]} isAdmin config={CONFIG} />);
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")?.getAttribute("src")).toContain("previews%2Fresource.png");
    fireEvent.click(screen.getByRole("button", { name: /^Check$/ }));
    await waitFor(() => expect(container.querySelector("img")?.getAttribute("src")).toContain("capture.jpg"));
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

  it("checks the full catalog one request at a time, with progress and a final reload", async () => {
    const resources = [RESOURCE, { ...RESOURCE, id: "second", title: "Second resource" }];
    let finishFirst!: (response: Response) => void;
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { finishFirst = resolve; }))
      .mockResolvedValueOnce(Response.json({ results: [{ id: "second", ok: true }] }))
      .mockResolvedValueOnce(Response.json({ resources: resources.map((resource) => ({ ...resource, checkState: "changed" })) }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ZecShelfClient initialResources={resources} isAdmin config={CONFIG} />);

    fireEvent.click(screen.getByRole("button", { name: /Check for updates/i }));
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(screen.getByRole("status")).toHaveTextContent("Checking sites… 0/2");
    expect(screen.getByRole("button", { name: /Checking sites/i })).toBeDisabled();
    await act(async () => finishFirst(Response.json({ results: [{ id: "resource", ok: true }] })));

    await waitFor(() => expect(screen.getByRole("button", { name: /Check for updates/i })).toBeEnabled());
    expect(fetchMock.mock.calls.map(([url, init]) => [url, init.method, init.body])).toEqual([
      ["/api/catalog/check", "POST", JSON.stringify({ id: "resource" })],
      ["/api/catalog/check", "POST", JSON.stringify({ id: "second" })],
      ["/api/catalog/resources", "GET", undefined],
    ]);
    expect(screen.getAllByText("Updated")).toHaveLength(2);
  });

  it.each([
    ["empty gateway timeout", () => new Response(null, { status: 504 }), "The request timed out"],
    ["HTML error page", () => new Response("<html>unavailable</html>", { status: 503 }), "The request failed (503)"],
    ["empty successful response", () => new Response(null), "empty or invalid response"],
    ["failed site check", () => Response.json({ results: [{ id: "resource", ok: false, error: "The site returned 403." }] }), "The site returned 403"],
    ["failed preview", () => Response.json({ results: [{ id: "resource", ok: true, previewError: "Preview service unavailable." }] }), "page checked, but its preview could not be refreshed"],
  ])("reports an %s and continues checking the remaining resources", async (_label, response, message) => {
    const resources = [RESOURCE, { ...RESOURCE, id: "second", title: "Second resource" }];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(Response.json({ results: [{ id: "second", ok: true }] }))
      .mockResolvedValueOnce(Response.json({ resources }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ZecShelfClient initialResources={resources} isAdmin config={CONFIG} />);

    fireEvent.click(screen.getByRole("button", { name: /Check for updates/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: /Check for updates/i })).toBeEnabled());
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(screen.getByText(message, { exact: false })).toHaveTextContent(/^Resource:/);
    expect(screen.queryByText(/Unexpected end of JSON/i)).not.toBeInTheDocument();
  });

  it("checks only the selected resource from its row", async () => {
    const resources = [RESOURCE, { ...RESOURCE, id: "second", title: "Second resource" }];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ results: [{ id: "second", ok: true }] }))
      .mockResolvedValueOnce(Response.json({ resources }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ZecShelfClient initialResources={resources} isAdmin config={CONFIG} />);

    fireEvent.click(screen.getAllByRole("button", { name: /^Check$/ })[1]);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify({ id: "second" }));
  });
});
