// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setDocumentInEffect } from "./document-effect";
import type { BoardMember } from "./session";

const mocks = vi.hoisted(() => ({ document: vi.fn(), versions: vi.fn(), commit: vi.fn(), access: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/vault", () => ({
  boardDocumentRepository: { getDocument: mocks.document, listVersions: mocks.versions, setInEffect: mocks.commit },
  VaultAuthorizationError: class extends Error {}, VaultValidationError: class extends Error { constructor(_code: string, message: string) { super(message); } },
}));
vi.mock("@/lib/session", () => ({ canManageBoardMeetings: (m: BoardMember) => ["chair", "admin", "executive-director"].includes(m.role) }));
vi.mock("@/lib/board-access-repository", () => ({ boardAccessRepository: { getByEmail: mocks.access } }));
vi.mock("@/lib/audit", () => ({ authenticatedActor: (m: unknown) => m, boardAuditLedger: { buildAppendItems: mocks.audit } }));
const member: BoardMember = { id: "chair-user", name: "Chair", email: "chair@example.invalid", role: "chair", isAdmin: true };
const input = { member, documentId: "articles", expectedRevision: 7, versionId: "v1", reason: "Original filing verified" };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ id: "chair-access", version: 4, role: "chair", status: "active" });
  mocks.document.mockResolvedValue({ documentId: "articles", revision: 7, ownerType: "library", status: "active", inEffect: null });
  mocks.versions.mockResolvedValue([{ versionId: "v1", sha256: "stored-hash" }]);
  mocks.audit.mockResolvedValue({ TransactItems: [{ Put: { Item: { type: "audit" } } }] });
});
describe("document in-effect designation", () => {
  it("binds the exact retained version, actor and server time, and commits access guards and audit together", async () => {
    await setDocumentInEffect(input);
    const [mutation, guards] = mocks.commit.mock.calls[0];
    expect(mutation.inEffect).toMatchObject({ versionId: "v1", sha256: "stored-hash", recordedBy: member.id, reason: input.reason });
    expect(Number.isFinite(Date.parse(mutation.inEffect.recordedAt))).toBe(true);
    expect(guards).toEqual(expect.arrayContaining([expect.objectContaining({ ConditionCheck: expect.objectContaining({ Key: { pk: "ACCESS#chair-access", sk: "PROFILE" } }) }), { Put: { Item: { type: "audit" } } }]));
    await setDocumentInEffect({ ...input, versionId: null, reason: "No longer operative" });
    expect(mocks.commit.mock.calls[1][0].inEffect).toBeNull();
    expect(mocks.audit.mock.calls[1][0].action).toBe("document_in_effect_cleared");
  });
  it.each(["member", "legal-counsel", "board-support"] as const)("denies %s and rechecks the current registry role", async (role) => {
    await expect(setDocumentInEffect({ ...input, member: { ...member, role } })).rejects.toThrow();
    mocks.access.mockResolvedValue({ id: "a", role, status: "active" });
    await expect(setDocumentInEffect(input)).rejects.toThrow();
    expect(mocks.commit).not.toHaveBeenCalled();
  });
  it("rejects missing or foreign versions, stale revisions, private workspace documents and empty explanations", async () => {
    await expect(setDocumentInEffect({ ...input, versionId: "foreign" })).rejects.toThrow(/belonging/);
    await expect(setDocumentInEffect({ ...input, expectedRevision: 6 })).rejects.toThrow();
    await expect(setDocumentInEffect({ ...input, reason: " " })).rejects.toThrow();
    mocks.document.mockResolvedValue({ revision: 7, ownerType: "meeting", status: "active" });
    await expect(setDocumentInEffect(input)).rejects.toThrow(/Library/);
    mocks.document.mockResolvedValue({ revision: 7, ownerType: "library", status: "archived" });
    await expect(setDocumentInEffect(input)).rejects.toThrow(/Restore/);
    expect(mocks.commit).not.toHaveBeenCalled();
  });
  it("does not commit when audit preparation fails", async () => {
    mocks.audit.mockRejectedValue(new Error("Audit unavailable"));
    await expect(setDocumentInEffect(input)).rejects.toThrow("Audit unavailable");
    expect(mocks.commit).not.toHaveBeenCalled();
  });
});
