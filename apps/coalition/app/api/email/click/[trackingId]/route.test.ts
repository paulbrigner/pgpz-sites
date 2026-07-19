import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { buildTrackedClickUrl } from "@/lib/email-link-security";

const mocks = vi.hoisted(() => ({
  recordLegacyNewsletterSameSiteClick: vi.fn(),
  recordNewsletterClick: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/config", () => ({
  EMAIL_TRACKING_SECRET: "test-email-tracking-secret",
  EMAIL_TRACKING_SECRET_PREVIOUS: undefined,
  BETTER_AUTH_SECRET: undefined,
  NEXTAUTH_SECRET: undefined,
}));
vi.mock("@/lib/admin/email-tracking", () => ({
  recordLegacyNewsletterSameSiteClick: mocks.recordLegacyNewsletterSameSiteClick,
  recordNewsletterClick: mocks.recordNewsletterClick,
}));

async function follow(url: string, trackingId = "tracking-1") {
  const { GET } = await import("./route");
  return GET(new NextRequest(url), { params: Promise.resolve({ trackingId }) });
}

describe("tracked email click route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.recordNewsletterClick.mockResolvedValue({ trackingId: "tracking-1" });
    mocks.recordLegacyNewsletterSameSiteClick.mockResolvedValue({ trackingId: "tracking-1" });
  });

  it("records and follows a destination signed for a stored tracking record", async () => {
    const destination = "https://external.example/article?id=1";
    const response = await follow(
      buildTrackedClickUrl("https://site.example", "tracking-1", destination),
    );

    expect(response.headers.get("location")).toBe(destination);
    expect(mocks.recordNewsletterClick).toHaveBeenCalledWith("tracking-1", destination);
  });

  it("does not follow a destination changed after signing", async () => {
    const url = new URL(
      buildTrackedClickUrl(
        "https://site.example",
        "tracking-1",
        "https://external.example/article",
      ),
    );
    url.searchParams.set("url", "https://attacker.example/phish");

    const response = await follow(url.toString());

    expect(response.headers.get("location")).not.toContain("attacker.example");
    expect(new URL(response.headers.get("location")!).hostname).toMatch(/\.pgpz\.org$/);
    expect(mocks.recordNewsletterClick).not.toHaveBeenCalled();
  });

  it("does not follow a valid signature when the tracking record is unknown", async () => {
    mocks.recordNewsletterClick.mockResolvedValueOnce(null);
    const destination = "https://external.example/article";

    const response = await follow(
      buildTrackedClickUrl("https://site.example", "tracking-1", destination),
    );

    expect(response.headers.get("location")).not.toBe(destination);
    expect(new URL(response.headers.get("location")!).hostname).toMatch(/\.pgpz\.org$/);
  });

  it("does not follow a valid-HMAC destination rejected by the stored allowlist", async () => {
    mocks.recordNewsletterClick.mockResolvedValueOnce(null);
    const destination = "https://external.example/not-in-stored-destinations";

    const response = await follow(
      buildTrackedClickUrl("https://site.example", "tracking-1", destination),
    );

    expect(response.headers.get("location")).not.toBe(destination);
    expect(mocks.recordNewsletterClick).toHaveBeenCalledWith("tracking-1", destination);
  });

  it("preserves legacy unsigned same-site links but rejects unsigned external links", async () => {
    const fallback = await follow(
      "https://site.example/api/email/click/tracking-1?url=https%3A%2F%2Fattacker.example%2Fphish",
    );
    const siteOrigin = new URL(fallback.headers.get("location")!).origin;
    const legacyDestination = `${siteOrigin}/updates`;

    const legacyResponse = await follow(
      `https://site.example/api/email/click/tracking-1?url=${encodeURIComponent(legacyDestination)}`,
    );

    expect(fallback.headers.get("location")).not.toContain("attacker.example");
    expect(legacyResponse.headers.get("location")).toBe(legacyDestination);
    expect(mocks.recordLegacyNewsletterSameSiteClick).toHaveBeenCalledWith(
      "tracking-1",
      legacyDestination,
    );
  });

  it("rejects signed non-HTTP destinations", async () => {
    const response = await follow(
      "https://site.example/api/email/click/tracking-1?url=javascript%3Aalert%281%29&sig=not-a-valid-signature",
    );

    expect(new URL(response.headers.get("location")!).hostname).toMatch(/\.pgpz\.org$/);
    expect(mocks.recordNewsletterClick).not.toHaveBeenCalled();
  });
});
