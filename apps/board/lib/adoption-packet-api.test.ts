// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/meetings/[id]/ballots/[ballotId]/packet/route";
import { adoptedFixture } from "./test-support/adoption";
const mocks = vi.hoisted(() => ({ anonymous: false, assurance: null as Response | null, ballot: vi.fn(), document: vi.fn(), versions: vi.fn(), read: vi.fn(), receipts: vi.fn(), audit: vi.fn(), s3: vi.fn() }));
vi.mock("@/lib/session", () => ({ resolveBoardMemberState: async () => mocks.anonymous ? { status: "anonymous" } : { status: "member", member: { id: "reader", email: "reader@example.invalid", role: "member" } } }));
vi.mock("@/lib/api-security", () => ({ requireBoardPasskeySession: async () => mocks.assurance }));
vi.mock("@/lib/meetings-repository", () => ({ boardMeetingsRepository: { getAsyncBallot: mocks.ballot, listConsentReceipts: mocks.receipts } }));
vi.mock("@/lib/vault", () => ({ boardDocumentRepository: { getDocument: mocks.document, listVersions: mocks.versions } }));
vi.mock("@/lib/object-store", () => ({ boardDocumentObjectStore: { readRetained: mocks.read }, isLocalBoardDocumentStorageEnabled: true }));
vi.mock("@/lib/audit", () => ({ authenticatedActor: (m: unknown) => m, boardAuditLedger: { append: mocks.audit } }));
vi.mock("@/lib/config", () => ({ SITE_URL: "https://board.example.invalid", BOARD_DOCUMENTS_RETAINED_BUCKET: "Retained" }));
vi.mock("@/lib/s3", () => ({ s3Client: { send: mocks.s3 } }));
const context = { params: Promise.resolve({ id: "m", ballotId: "b" }) };
const request = (doc = "doc") => new NextRequest(`https://board.example.invalid/api/meetings/m/ballots/b/packet?document=${doc}`);
beforeEach(() => {
  vi.clearAllMocks(); mocks.anonymous = false; mocks.assurance = null;
  const fixture = adoptedFixture();
  mocks.ballot.mockResolvedValue(fixture.ballot);
  mocks.receipts.mockResolvedValue(fixture.receipts);
  mocks.document.mockResolvedValue({ documentId: "doc", ownerType: "library", status: "active", currentVersion: { ...fixture.version, versionId: "v2" } });
  mocks.versions.mockResolvedValue([fixture.version]);
  mocks.read.mockResolvedValue({ bytes: fixture.bytes });
});
describe("adoption packet authorization", () => {
  it("requires a passkey session and never exposes private evidence to anonymous callers", async () => {
    mocks.anonymous = true; expect((await GET(request(), context)).status).toBe(401);
    mocks.anonymous = false; mocks.assurance = new Response(null, { status: 403 });
    expect((await GET(request(), context)).status).toBe(403);
    expect(mocks.ballot).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
  });
  it("rejects pending/legacy actions and documents that are not adopted targets", async () => {
    expect((await GET(request("private-executive-document"), context)).status).toBe(404);
    const { ballot } = adoptedFixture();
    mocks.ballot.mockResolvedValue({ ...ballot, status: "open" });
    expect((await GET(request(), context)).status).toBe(404);
    mocks.ballot.mockResolvedValue({ ...ballot, consent: { ...ballot.consent, schema: 1 } });
    expect((await GET(request(), context)).status).toBe(404);
    expect(mocks.document).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
  });
  it("never reads restricted records or foreign workspace files through the ordinary vault", async () => {
    mocks.document.mockResolvedValue(null);
    expect((await GET(request(), context)).status).toBe(404);
    mocks.document.mockResolvedValue({ ownerType: "meeting", meetingId: "other" });
    expect((await GET(request(), context)).status).toBe(404);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("exports the exact adopted version even after replacement or archiving, with private headers and audited access", async () => {
    mocks.document.mockResolvedValue({ documentId: "doc", ownerType: "library", status: "archived" });
    const response = await GET(request(), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("content-disposition")).toContain("attachment;");
    expect(mocks.read).toHaveBeenCalledWith("board/objects/doc/v1");
    expect(mocks.audit.mock.calls[0][0].target.version).toBe("v1");
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("signatureName");
  });
  it("fails closed on corrupt retained bytes and hides storage provider details", async () => {
    mocks.read.mockResolvedValue({ bytes: new Uint8Array([1]) });
    expect((await GET(request(), context)).status).toBe(409);
    mocks.read.mockRejectedValue(new Error("secret provider details"));
    const result = await GET(request(), context);
    expect(result.status).toBe(503); expect(await result.text()).not.toContain("secret");
  });
});
