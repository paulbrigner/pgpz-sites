import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Page from "@/app/(portal)/meetings/[id]/page";
const mocks = vi.hoisted(() => ({ manage: true, get: vi.fn(), library: vi.fn(), meeting: vi.fn(), versions: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireBoardMember: async () => ({ id: "chair", email: "chair@example.invalid" }), canManageBoardMeetings: () => mocks.manage, canPrepareBoardMeetings: () => false, canManageBoardDocuments: () => mocks.manage, canParticipateBoardDiscussions: () => true }));
vi.mock("@/lib/meetings-repository", () => ({ boardMeetingsRepository: { getMeeting: mocks.get } }));
vi.mock("@/lib/vault", () => ({ boardDocumentRepository: { listDocuments: mocks.library, listMeetingDocuments: mocks.meeting, listVersions: mocks.versions } }));
vi.mock("@/lib/director-roster", () => ({ readDirectorRoster: async () => ({ revision: "r1", directors: [] }) }));
vi.mock("@/lib/executive-session-access", () => ({ executiveAccessRecord: async () => null, visibleExecutiveSessions: async () => [], listExecutiveCandidates: async () => [] }));
vi.mock("@/lib/executive-sessions-repository", () => ({ executiveSessionsRepository: { reports: async () => [] } }));
vi.mock("@/components/meetings/MeetingDetail", () => ({ MeetingDetail: (props: unknown) => <div>{JSON.stringify(props)}</div> }));
vi.mock("@/components/meetings/ExecutiveSessions", () => ({ ExecutiveSessions: () => null }));
vi.mock("@pgpz/ui", () => ({ Container: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
beforeEach(() => {
  vi.clearAllMocks(); mocks.manage = true;
  mocks.get.mockResolvedValue({ meeting: { id: "m", status: "scheduled", format: "asynchronous" }, agendaItems: [], attendance: [], decisions: [], asyncBallots: [], asyncVotes: [], asyncDiscussionMessages: [], actionItems: [], deliveries: [] });
  mocks.meeting.mockResolvedValue([]);
  mocks.library.mockResolvedValue([{ documentId: "articles", title: "Articles", status: "active", versionCount: 2, currentVersion: { versionId: "v5", sequence: 5 } }]);
  mocks.versions.mockResolvedValue([{ versionId: "v4", sequence: 4, originalFileName: "comparison.pdf", sha256: "comparison-hash", objectKey: "SECRET_KEY" }, { versionId: "v5", sequence: 5, originalFileName: "clean.pdf", sha256: "clean-hash" }]);
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
