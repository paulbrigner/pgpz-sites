// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("better-auth/next-js", () => ({ toNextJsHandler: () => ({ GET: mocks.get }) }));
vi.mock("@/lib/auth", () => ({ auth: {} }));
vi.mock("@/lib/audit", () => ({ anonymousClaimedActor: vi.fn(), auditBestEffort: vi.fn(), authenticatedActor: vi.fn() }));
vi.mock("@/lib/passkey-enrollment", () => ({ getBoardPasskeyCount: vi.fn(), markBoardPasskeyEnrolled: vi.fn() }));
vi.mock("@/lib/passkey-notification", () => ({ sendBoardPasskeySecurityNotice: vi.fn() }));
import { GET } from "@/app/api/better-auth/[...all]/route";
beforeEach(() => vi.clearAllMocks());
describe("Board passkey authentication options", () => {
  it("requires browser verification while preserving the challenge, credential restrictions, and cookie", async () => {
    const options = { challenge: "test-challenge", rpId: "board.pgpz.org", userVerification: "preferred", timeout: 60000, allowCredentials: [{ id: "existing-key", type: "public-key", transports: ["internal"] }], extensions: { test: true } };
    mocks.get.mockResolvedValue(new Response(JSON.stringify(options), { headers: { "Set-Cookie": "challenge=test-only; Path=/; HttpOnly; Secure", "Content-Type": "application/json", "Content-Length": "10" } }));
    const response = await GET(new NextRequest("https://board.pgpz.org/api/better-auth/passkey/generate-authenticate-options"));
    expect(await response.json()).toEqual({ ...options, userVerification: "required" });
    expect(response.headers.get("set-cookie")).toBe("challenge=test-only; Path=/; HttpOnly; Secure");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.has("content-length")).toBe(false);
  });
  it("preserves errors including rate-limit status and retry headers", async () => {
    const original = new Response("Too many requests", { status: 429, headers: { "Retry-After": "60" } });
    mocks.get.mockResolvedValue(original);
    const response = await GET(new NextRequest("https://board.pgpz.org/api/better-auth/passkey/generate-authenticate-options"));
    expect(response).toBe(original);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
  });
  it("leaves unrelated auth responses unchanged", async () => {
    const original = new Response("{}"); mocks.get.mockResolvedValue(original);
    expect(await GET(new NextRequest("https://board.pgpz.org/api/better-auth/get-session"))).toBe(original);
  });
});
