// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/documents/[id]/download/route";
import { resolutionReviewFixture } from "./test-support/resolution-review";

const mocks = vi.hoisted(() => ({ anonymous: false, stepUp: null as Response | null, access: vi.fn(), ballot: vi.fn(), document: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/session", () => ({ resolveBoardMemberState: async () => mocks.anonymous ? { status: "anonymous" } : { status: "member", member: { email: "chair@example.invalid", role: "member" } }, canManageBoardDocuments: () => false }));
vi.mock("@/lib/api-security", () => ({ requireBoardPasskeySession: async () => mocks.stepUp }));
vi.mock("@/lib/board-access-repository", () => ({ boardAccessRepository: { getByEmail: mocks.access } }));
vi.mock("@/lib/meetings-repository", () => ({ boardMeetingsRepository: { getAsyncBallot: mocks.ballot } }));
vi.mock("@/lib/vault", () => ({ boardDocumentRepository: { getDocument: mocks.document } }));
vi.mock("@/lib/audit", () => ({ boardAuditLedger: { append: async () => {} }, authenticatedActor: (member: unknown) => member }));
vi.mock("@/lib/object-store", () => ({ isLocalBoardDocumentStorageEnabled: true, boardDocumentObjectStore: { readRetained: mocks.read } }));
vi.mock("@/lib/dynamodb", () => ({ documentClient: {} }));
vi.mock("@/lib/s3", () => ({ s3Client: {} }));
vi.mock("@/lib/config", () => ({ BOARD_DOCUMENTS_RETAINED_BUCKET: "", BOARD_ACCESS_TABLE: "Access" }));
const get = (query = "version=v2&consentMeeting=m&consentBallot=review-ballot") => GET(new NextRequest(`http://localhost/api/documents/employment/download?${query}`), { params: Promise.resolve({ id: "employment" }) });
beforeEach(() => {
  vi.clearAllMocks(); mocks.anonymous = false; mocks.stepUp = null;
  mocks.access.mockResolvedValue({ id: "chair", status: "active", role: "member" });
  mocks.ballot.mockResolvedValue(resolutionReviewFixture());
  mocks.document.mockResolvedValue({ status: "archived", currentVersion: { versionId: "v2", objectKey: "retained", mimeType: "application/pdf", originalFileName: "employment.pdf" } });
  mocks.read.mockResolvedValue({ bytes: Buffer.from("synthetic retained version") });
});
describe("exact document access during required review", () => {
  it("lets a current required director retrieve an archived version pinned to the unchanged review packet", async () => {
    const response = await get();
    expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(await response.text()).toBe("synthetic retained version");
  });
  it("denies staff, removed directors, unrelated versions and changed review packets", async () => {
    for (const access of [{ id: "chair", status: "active", role: "executive-director" }, { id: "chair", status: "deactivated", role: "member" }, { id: "outsider", status: "active", role: "member" }]) {
      mocks.access.mockResolvedValue(access); expect((await get()).status).toBe(404);
    }
    mocks.access.mockResolvedValue({ id: "chair", status: "active", role: "member" });
    expect((await get("version=v3&consentMeeting=m&consentBallot=review-ballot")).status).toBe(404);
    expect((await get("version=v2")).status).toBe(404);
    mocks.ballot.mockResolvedValue({ ...resolutionReviewFixture(), motion: "Changed terms" });
    expect((await get()).status).toBe(404); expect(mocks.read).not.toHaveBeenCalled();
  });
  it("enforces authentication and passkey assurance before reading documents", async () => {
    mocks.anonymous = true; expect((await get()).status).toBe(401);
    mocks.anonymous = false; mocks.stepUp = new Response(null, { status: 403 }); expect((await get()).status).toBe(403);
    expect(mocks.document).not.toHaveBeenCalled();
  });
});
