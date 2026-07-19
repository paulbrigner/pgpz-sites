import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getNewsletterTrackingRecord: vi.fn(),
  recordNewsletterUnsubscribe: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/email-tracking", () => ({
  getNewsletterTrackingRecord: mocks.getNewsletterTrackingRecord,
  recordNewsletterUnsubscribe: mocks.recordNewsletterUnsubscribe,
}));

const tracking = {
  trackingId: "tracking-1",
  newsletterId: "newsletter-1",
  unsubscribedAt: null,
};

async function getUnsubscribe() {
  const { GET } = await import("./route");
  return GET(new NextRequest("https://site.example/api/email/unsubscribe/tracking-1"), {
    params: Promise.resolve({ trackingId: "tracking-1" }),
  });
}

async function postUnsubscribe(body: string) {
  const { POST } = await import("./route");
  return POST(
    new NextRequest("https://site.example/api/email/unsubscribe/tracking-1", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    }),
    { params: Promise.resolve({ trackingId: "tracking-1" }) },
  );
}

describe("email unsubscribe route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getNewsletterTrackingRecord.mockResolvedValue(tracking);
    mocks.recordNewsletterUnsubscribe.mockResolvedValue({
      ...tracking,
      unsubscribedAt: "2026-07-19T12:00:00.000Z",
    });
  });

  it("shows a confirmation without mutating on GET", async () => {
    const response = await getUnsubscribe();

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Confirm unsubscribe");
    expect(mocks.getNewsletterTrackingRecord).toHaveBeenCalledWith("tracking-1");
    expect(mocks.recordNewsletterUnsubscribe).not.toHaveBeenCalled();
  });

  it("suppresses mail after an explicit browser confirmation POST", async () => {
    const response = await postUnsubscribe("confirm=unsubscribe");

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("You have been unsubscribed");
    expect(mocks.recordNewsletterUnsubscribe).toHaveBeenCalledWith("tracking-1");
  });

  it("supports RFC 8058 one-click unsubscribe POSTs", async () => {
    const response = await postUnsubscribe("List-Unsubscribe=One-Click");

    expect(response.status).toBe(200);
    expect(mocks.recordNewsletterUnsubscribe).toHaveBeenCalledWith("tracking-1");
  });

  it("rejects POSTs without a recognized confirmation", async () => {
    const response = await postUnsubscribe("confirm=no");

    expect(response.status).toBe(400);
    expect(mocks.recordNewsletterUnsubscribe).not.toHaveBeenCalled();
  });

  it("returns not found for an unknown GET without mutating", async () => {
    mocks.getNewsletterTrackingRecord.mockResolvedValueOnce(null);

    const response = await getUnsubscribe();

    expect(response.status).toBe(404);
    expect(mocks.recordNewsletterUnsubscribe).not.toHaveBeenCalled();
  });
});
