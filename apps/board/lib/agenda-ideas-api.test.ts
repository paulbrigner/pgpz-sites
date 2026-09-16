// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/agenda-ideas/route";
import { IdeaError } from "./agenda-ideas";
const mocks = vi.hoisted(() => ({ state: vi.fn(), assurance: vi.fn(), stepUp: vi.fn(), execute: vi.fn() }));
vi.mock("@/lib/session", () => ({ resolveBoardMemberState: mocks.state }));
vi.mock("@/lib/api-security", () => ({ requireBoardPasskeySession: mocks.assurance, requireBoardStepUp: mocks.stepUp }));
vi.mock("@/lib/agenda-ideas-service", () => ({ agendaIdeasService: { execute: mocks.execute } }));
const request = (body: unknown, origin = "http://localhost:3002") => new NextRequest("http://localhost:3002/api/agenda-ideas", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks(); mocks.state.mockResolvedValue({ status: "member", member: { id: "u", role: "board-support" } });
  mocks.assurance.mockResolvedValue(null); mocks.stepUp.mockResolvedValue(null); mocks.execute.mockResolvedValue({ id: "idea-1" });
});
describe("Agenda Ideas API", () => {
  it.each(["anonymous", "restricted"])("rejects %s before any private record access", async (status) => {
    mocks.state.mockResolvedValue({ status }); expect((await POST(request({ action: "create" }))).status).toBe(401); expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("requires a passkey session and recent step-up for content changes", async () => {
    mocks.assurance.mockResolvedValue(new Response(null, { status: 401 }));
    expect((await POST(request({ action: "comment" }))).status).toBe(401);
    mocks.assurance.mockResolvedValue(null); mocks.stepUp.mockResolvedValue(new Response(null, { status: 428 }));
    expect((await POST(request({ action: "schedule" }))).status).toBe(428); expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("records read activity without prompting for content-mutation step-up", async () => {
    const response = await POST(request({ action: "read", id: "idea-1", expectedVersion: 1 }));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(mocks.stepUp).not.toHaveBeenCalled();
    expect(mocks.assurance).toHaveBeenCalled(); expect(mocks.execute).toHaveBeenCalled();
  });
  it("rejects cross-origin and malformed requests and conceals unexpected service errors", async () => {
    expect((await POST(request({}, "https://evil.invalid"))).status).toBe(403);
    expect((await POST(request(null))).status).toBe(400);
    expect((await POST(request([]))).status).toBe(400);
    expect((await POST(request({ body: "a".repeat(65537) }))).status).toBe(413);
    expect(mocks.execute).not.toHaveBeenCalled();
    mocks.execute.mockRejectedValue(new Error("private table details"));
    const result = await POST(request({ action: "create" }));
    expect(result.status).toBe(503); expect(await result.text()).not.toContain("private table details");
  });
  it("returns actionable authorization and concurrency errors", async () => {
    mocks.execute.mockRejectedValue(new IdeaError("Refresh before saving", 409));
    expect((await POST(request({ action: "edit" }))).status).toBe(409);
    mocks.execute.mockRejectedValue(new IdeaError("Only the Chair or Executive Director", 403));
    expect((await POST(request({ action: "schedule" }))).status).toBe(403);
  });
});
