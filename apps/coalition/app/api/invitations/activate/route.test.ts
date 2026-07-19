import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  inspectInvitationActivationToken: vi.fn(),
}));

vi.mock("@/lib/config", () => ({ SITE_URL: "https://coalition.example.test" }));

vi.mock("@/lib/admin/invitations", () => {
  class InvitationError extends Error {
    status: number;

    constructor(message: string, status = 400) {
      super(message);
      this.status = status;
    }
  }

  return {
    inspectInvitationActivationToken: mocks.inspectInvitationActivationToken,
    InvitationError,
  };
});

import { InvitationError } from "@/lib/admin/invitations";
import { GET } from "./route";

describe("GET /api/invitations/activate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.inspectInvitationActivationToken.mockResolvedValue({ status: "ready", userId: "user-1" });
  });

  it("validates then redirects to sign-in without activating membership", async () => {
    const response = await GET(
      new NextRequest("https://coalition.example.test/api/invitations/activate?token=valid-token"),
    );

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location") || "");
    expect(location.origin + location.pathname).toBe("https://coalition.example.test/signin");
    expect(location.searchParams.get("callbackUrl")).toBe("/");
    expect(location.searchParams.get("reason")).toBe("invitation-pending");
    expect(mocks.inspectInvitationActivationToken).toHaveBeenCalledWith("valid-token");
  });

  it("redirects expired links without performing acceptance", async () => {
    mocks.inspectInvitationActivationToken.mockRejectedValue(
      new InvitationError("This invitation link has expired.", 410),
    );

    const response = await GET(
      new NextRequest("https://coalition.example.test/api/invitations/activate?token=expired-token"),
    );

    const location = new URL(response.headers.get("location") || "");
    expect(location.searchParams.get("reason")).toBe("invitation-expired");
  });
});
