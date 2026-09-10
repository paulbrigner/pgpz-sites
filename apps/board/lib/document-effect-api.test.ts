// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/documents/route";
import { OptimisticConcurrencyError } from "@pgpz/document-vault/server";
const mocks = vi.hoisted(() => ({ state: "member", manager: true, passkey: null as Response | null, stepUp: null as Response | null, set: vi.fn() }));
vi.mock("@/lib/config", () => ({ SITE_URL: "http://localhost:3203", BOARD_DOCUMENTS_STAGING_BUCKET: "test-staging" }));
vi.mock("@/lib/session", () => ({ resolveBoardMemberState: async () => ({ status: mocks.state, member: { id: "actor", role: "chair" } }), canManageBoardDocuments: () => mocks.manager }));
vi.mock("@/lib/api-security", () => ({ requireBoardPasskeySession: async () => mocks.passkey, requireBoardStepUp: async () => mocks.stepUp }));
vi.mock("@/lib/vault", () => ({ VaultAuthorizationError: class extends Error {}, VaultValidationError: class extends Error { constructor(_code: string, message: string) { super(message); } } }));
vi.mock("@/lib/audit", () => ({}));
vi.mock("@/lib/s3", () => ({}));
vi.mock("@/lib/object-store", () => ({}));
vi.mock("@/lib/document-effect", () => ({ setDocumentInEffect: mocks.set }));
const body = { action: "setInEffect", documentId: "articles", versionId: "v1", expectedRevision: 2, reason: "Filing verified" };
const request = (value: unknown = body, origin = "http://localhost:3203") => new NextRequest("http://localhost:3203/api/documents", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(value) });
beforeEach(() => { vi.clearAllMocks(); mocks.state = "member"; mocks.manager = true; mocks.passkey = null; mocks.stepUp = null; mocks.set.mockResolvedValue({ documentId: "articles" }); });
describe("document designation endpoint", () => {
  it("requires membership, document privileges, a passkey and recent verification", async () => {
    mocks.state = "anonymous"; expect((await POST(request())).status).toBe(401);
    mocks.state = "member"; mocks.manager = false; expect((await POST(request())).status).toBe(403);
    mocks.manager = true; mocks.passkey = new Response(null, { status: 403 }); expect((await POST(request())).status).toBe(403);
    mocks.passkey = null; mocks.stepUp = new Response(null, { status: 403 }); expect((await POST(request())).status).toBe(403);
    mocks.stepUp = null; expect((await POST(request(body, "https://foreign.invalid"))).status).toBe(403);
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it("never interprets a missing version as a clear and ignores forged actor or hash fields", async () => {
    expect((await POST(request({ ...body, versionId: undefined }))).status).toBe(400);
    expect((await POST(request({ ...body, member: { id: "victim" }, sha256: "forged" }))).status).toBe(200);
    expect(mocks.set.mock.calls[0][0]).toEqual({ documentId: "articles", versionId: "v1", expectedRevision: 2, reason: "Filing verified", member: { id: "actor", role: "chair" } });
    expect((await POST(request({ ...body, versionId: null }))).status).toBe(200);
    expect(mocks.set.mock.calls[1][0].versionId).toBeNull();
  });
  it("returns a conflict when another write wins, requiring a fresh review", async () => {
    mocks.set.mockRejectedValue(new OptimisticConcurrencyError("articles"));
    expect((await POST(request())).status).toBe(409);
  });
});
