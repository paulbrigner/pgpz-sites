import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { sessionFixture } from "./executive-session-test-helpers";
import { ExecutiveSessionError } from "./executive-sessions";
import Page from "@/app/(portal)/meetings/[id]/executive-sessions/[sessionId]/page";

const mocks = vi.hoisted(() => ({ access: vi.fn(), messages: vi.fn(), materials: vi.fn(), member: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireBoardMember: mocks.member }));
vi.mock("@/lib/executive-session-access", () => ({ requireExecutiveAccess: mocks.access }));
vi.mock("@/lib/executive-sessions-repository", () => ({ executiveSessionsRepository: { messages: mocks.messages, materials: mocks.materials } }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));
vi.mock("@pgpz/ui", () => ({ Container: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/meetings/ExecutiveSessionWorkspace", () => ({ ExecutiveSessionWorkspace: (props: unknown) => <div>{JSON.stringify(props)}</div> }));
const params = Promise.resolve({ id: "meeting-1", sessionId: "session-1" });

beforeEach(() => {
  vi.clearAllMocks(); mocks.member.mockResolvedValue({ id: "member" }); mocks.messages.mockResolvedValue([]); mocks.materials.mockResolvedValue([]);
});

describe("restricted session server rendering", () => {
  it("does not fetch or serialize discussion/materials for an excluded viewer, including RSC leaf requests", async () => {
    mocks.access.mockRejectedValue(new ExecutiveSessionError(404, "Session not found."));
    await expect(Page({ params })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.messages).not.toHaveBeenCalled(); expect(mocks.materials).not.toHaveBeenCalled();
  });
  it("omits storage keys from the authenticated client payload", async () => {
    mocks.access.mockResolvedValue({ session: sessionFixture(), canManage: true });
    mocks.materials.mockResolvedValue([{ id: "file", title: "PRIVATE file", objectKey: "private-storage-key" }]);
    const html = renderToStaticMarkup(await Page({ params }));
    expect(html).toContain("PRIVATE file"); expect(html).not.toContain("private-storage-key");
  });
});
