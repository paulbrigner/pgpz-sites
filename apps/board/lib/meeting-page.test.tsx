import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Page from "@/app/(portal)/meetings/[id]/page";
import type { MeetingDetailView } from "@/components/meetings/types";
import type { ConsentReceipt } from "./written-consents";
const mocks = vi.hoisted(() => ({ manage: true, get: vi.fn(), library: vi.fn(), meeting: vi.fn(), versions: vi.fn(), access: vi.fn(), detail: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireBoardMember: async () => ({ id: "chair", email: "chair@example.invalid" }), canManageBoardMeetings: () => mocks.manage, canPrepareBoardMeetings: () => false, canManageBoardDocuments: () => mocks.manage, canParticipateBoardDiscussions: () => true }));
vi.mock("@/lib/meetings-repository", () => ({ boardMeetingsRepository: { getMeeting: mocks.get } }));
vi.mock("@/lib/vault", () => ({ boardDocumentRepository: { listDocuments: mocks.library, listMeetingDocuments: mocks.meeting, listVersions: mocks.versions } }));
vi.mock("@/lib/director-roster", () => ({ readDirectorRoster: async () => ({ revision: "r1", directors: [] }) }));
vi.mock("@/lib/executive-session-access", () => ({ executiveAccessRecord: mocks.access, visibleExecutiveSessions: async () => [], listExecutiveCandidates: async () => [] }));
vi.mock("@/lib/executive-sessions-repository", () => ({ executiveSessionsRepository: { reports: async () => [] } }));
vi.mock("@/components/meetings/MeetingDetail", () => ({ MeetingDetail: (props: unknown) => { mocks.detail(props); return <div>{JSON.stringify(props)}</div>; } }));
vi.mock("@/components/meetings/ExecutiveSessions", () => ({ ExecutiveSessions: () => null }));
vi.mock("@pgpz/ui", () => ({ Container: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
beforeEach(() => {
  vi.clearAllMocks(); mocks.manage = true;
  mocks.access.mockResolvedValue(null);
  mocks.get.mockResolvedValue({ meeting: { id: "m", status: "scheduled", format: "asynchronous" }, agendaItems: [], attendance: [], decisions: [], asyncBallots: [], asyncVotes: [], asyncDiscussionMessages: [], actionItems: [], deliveries: [] });
  mocks.meeting.mockResolvedValue([]);
  mocks.library.mockResolvedValue([{ documentId: "articles", title: "Articles", status: "active", versionCount: 2, currentVersion: { versionId: "v5", sequence: 5 } }]);
  mocks.versions.mockResolvedValue([{ versionId: "v4", sequence: 4, originalFileName: "comparison.pdf", sha256: "comparison-hash", objectKey: "SECRET_KEY" }, { versionId: "v5", sequence: 5, originalFileName: "clean.pdf", sha256: "clean-hash" }]);
});

const directors = ["chair", "other", "withdrawn", "pending"].map((id) => ({ userId: id, name: `Director ${id}`, email: `${id}@example.invalid` }));
function receipt(index: number, action: ConsentReceipt["action"] = "consent"): ConsentReceipt {
  const director = directors[index];
  return { id: `private-receipt-${index}`, meetingId: "m", ballotId: "b1", contentHash: "hash",
    accessId: director.userId, email: director.email, name: director.name, action,
    authenticatedUserId: `private-auth-${index}`, signatureName: `Private signature ${index}`, statement: "Private statement",
    receivedAt: `2026-09-11T1${index}:30:00.000Z`, supersedesReceiptId: null };
}
async function consentPage(receipts = [receipt(0), receipt(1), receipt(2, "withdraw")]) {
  const record = await mocks.get();
  const ballot = { id: "b1", status: "open", consentMode: "unanimous-v1", eligibleVoters: directors,
    consent: { schema: 3, contentHash: "hash", rosterRevision: "r1", startAt: "2026-09-11T08:00:00Z", endAt: "2026-09-20T08:00:00Z", receipts } };
  mocks.get.mockResolvedValue({ ...record, asyncBallots: [ballot, { ...ballot, id: "b2", consent: { ...ballot.consent, receipts: [] } }] });
  renderToStaticMarkup(await Page({ params: Promise.resolve({ id: "m" }) }));
  return (mocks.detail.mock.lastCall![0] as { detail: MeetingDetailView }).detail;
}

describe("meeting director consent visibility", () => {
  it.each(["member", "chair", "admin"])("shows %s the latest named statuses per resolution without other signature evidence", async (role) => {
    mocks.manage = role !== "member";
    mocks.access.mockResolvedValue({ id: "chair", email: "chair@example.invalid", role, status: "active" });
    const detail = await consentPage();
    expect(detail.asyncBallots[0].consent!.directorStatuses).toEqual(directors.map((director, i) => ({
      userId: director.userId, name: director.name,
      status: i < 2 ? "consented" : i === 2 ? "withdrawn" : "pending",
      receivedAt: i < 3 ? receipt(i).receivedAt : null,
    })));
    expect(detail.asyncBallots[1].consent!.directorStatuses!.every((person) => person.status === "pending" && person.receivedAt === null)).toBe(true);
    expect(detail.asyncBallots[0].consent!.viewerReceipt).toEqual(receipt(0));
    for (const i of [1, 2]) {
      expect(JSON.stringify(detail)).not.toContain(`private-receipt-${i}`);
      expect(JSON.stringify(detail)).not.toContain(`private-auth-${i}`);
      expect(JSON.stringify(detail)).not.toContain(`Private signature ${i}`);
    }
  });

  it.each([
    ["executive-director", "active"], ["legal-counsel", "active"], ["board-support", "active"],
    ["member", "deactivated"], ["chair", "invited"], [null, null],
  ])("omits named status metadata from the server payload for %s / %s", async (role, status) => {
    mocks.access.mockResolvedValue(role ? { id: "viewer", email: "chair@example.invalid", role, status } : null);
    const detail = await consentPage();
    for (const ballot of detail.asyncBallots) expect(ballot.consent).not.toHaveProperty("directorStatuses");
    expect(JSON.stringify(detail)).not.toContain(receipt(1).receivedAt);
    expect(JSON.stringify(detail)).not.toContain("Private signature");
  });

  it("matches the frozen roster by access ID and reflects a fresh consent after withdrawal", async () => {
    mocks.access.mockResolvedValue({ id: "chair", role: "chair", status: "active" });
    const fresh = { ...receipt(2), id: "fresh-consent", receivedAt: "2026-09-11T15:00:00Z", supersedesReceiptId: "old-withdrawal" };
    const detail = await consentPage([{ ...receipt(1), accessId: "replaced-identity" }, fresh]);
    expect(detail.asyncBallots[0].consent!.directorStatuses).toEqual([
      { userId: "chair", name: "Director chair", status: "pending", receivedAt: null },
      { userId: "other", name: "Director other", status: "pending", receivedAt: null },
      { userId: "withdrawn", name: "Director withdrawn", status: "consented", receivedAt: fresh.receivedAt },
      { userId: "pending", name: "Director pending", status: "pending", receivedAt: null },
    ]);
    expect(JSON.stringify(detail)).not.toContain("fresh-consent");
    expect(JSON.stringify(detail)).not.toContain("old-withdrawal");
  });
});
describe("meeting resolution attachment choices", () => {
  it("provides managers exact historical version metadata without storage keys", async () => {
    const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ id: "m" }) }));
    expect(mocks.versions).toHaveBeenCalledWith("articles");
    expect(html).toContain("comparison.pdf"); expect(html).toContain("clean.pdf");
    expect(html).not.toContain("SECRET_KEY");
  });
  it("does not fetch the library or version history for non-managers", async () => {
    mocks.manage = false;
    const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ id: "m" }) }));
    expect(mocks.library).not.toHaveBeenCalled(); expect(mocks.versions).not.toHaveBeenCalled();
    expect(html).not.toContain("comparison.pdf");
  });
});
