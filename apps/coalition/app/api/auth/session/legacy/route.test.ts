import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { DELETE } from "./route";

vi.mock("server-only", () => ({}));

describe("DELETE /api/auth/session/legacy", () => {
  it("expires base and chunked legacy NextAuth session cookies", async () => {
    const request = new NextRequest("https://example.test/api/auth/session/legacy", {
      method: "DELETE",
      headers: {
        cookie: [
          "next-auth.session-token.0=first",
          "next-auth.session-token.1=second",
          "__Secure-next-auth.session-token.0=secure",
          "unrelated=value",
        ].join("; "),
      },
    });

    const response = await DELETE(request);
    const cookies = response.headers.getSetCookie();

    expect(response.status).toBe(204);
    for (const name of [
      "next-auth.session-token",
      "__Secure-next-auth.session-token",
      "next-auth.session-token.0",
      "next-auth.session-token.1",
      "__Secure-next-auth.session-token.0",
    ]) {
      expect(cookies.some((cookie) => cookie.startsWith(`${name}=`))).toBe(true);
    }
    expect(cookies.some((cookie) => cookie.startsWith("unrelated="))).toBe(false);
    expect(cookies.every((cookie) => cookie.includes("Expires=Thu, 01 Jan 1970"))).toBe(true);
  });
});
