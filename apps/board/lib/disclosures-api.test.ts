// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ state: vi.fn(), passkey: vi.fn(), stepUp: vi.fn(), register: vi.fn(), view: vi.fn(), mutate: vi.fn(), create: vi.fn(), notify: vi.fn() }));
vi.mock("./session", () => ({ resolveBoardMemberState: mocks.state }));
vi.mock("./api-security", () => ({ requireBoardPasskeySession: mocks.passkey, requireBoardStepUp: mocks.stepUp }));
vi.mock("./config", () => ({ SITE_URL: "https://board.example.invalid" }));
vi.mock("./disclosures-service", () => ({ disclosureRegister: mocks.register, disclosureView: mocks.view, mutateDisclosure: mocks.mutate, createDisclosure: mocks.create, notifyDisclosure: mocks.notify }));
import { GET, POST } from "../app/api/disclosures/route";
import { GET as detail, POST as change } from "../app/api/disclosures/[id]/route";
import { POST as notify } from "../app/api/disclosures/[id]/reminder/route";
import { GET as record } from "../app/api/disclosures/[id]/record/route";
import { DisclosureError } from "./disclosures";
const context = { params: Promise.resolve({ id: "private" }) };
function request(body: unknown = {}, origin = "https://board.example.invalid") { return new NextRequest("https://board.example.invalid/api/disclosures", { method: "POST", headers: { "Content-Type": "application/json", origin }, body: JSON.stringify(body) }); }
beforeEach(() => { vi.clearAllMocks(); mocks.state.mockResolvedValue({ status: "member", member: { id: "auth-ed", email: "ed@example.invalid" } }); mocks.passkey.mockResolvedValue(null); mocks.stepUp.mockResolvedValue(null); mocks.register.mockResolvedValue([]); mocks.create.mockResolvedValue({ id: "created" }); });
describe("disclosure API boundaries", () => {
  it("requires authentication and a passkey before reads", async () => {
    mocks.state.mockResolvedValueOnce({ status: "anonymous" }); expect((await GET(new NextRequest("https://board.example.invalid/api/disclosures"))).status).toBe(401);
    mocks.passkey.mockResolvedValueOnce(new Response(null, { status: 401 })); expect((await detail(new NextRequest("https://board.example.invalid/api/disclosures/private"), context)).status).toBe(401);
    expect(mocks.register).not.toHaveBeenCalled(); expect(mocks.view).not.toHaveBeenCalled();
  });
  it("enforces origin and recent passkey verification on every mutation", async () => {
    expect((await POST(request({}, "https://attacker.invalid"))).status).toBe(403);
    mocks.stepUp.mockResolvedValue(new Response(null, { status: 428 }));
    for (const action of [() => POST(request()), () => change(request(), context), () => notify(request(), context)]) expect((await action()).status).toBe(428);
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.mutate).not.toHaveBeenCalled(); expect(mocks.notify).not.toHaveBeenCalled();
  });
  it("bounds streamed input even without Content-Length, rejects malformed bodies, and returns private no-store data", async () => {
    expect((await POST(request({ note: "x".repeat(70_000) }))).status).toBe(413);
    expect((await POST(request([]))).status).toBe(400);
    expect((await POST(new NextRequest("https://board.example.invalid/api/disclosures", { method: "POST", body: "{}" }))).status).toBe(400);
    const response = await POST(request({ subjectId: "ed" })); expect(response.status).toBe(201); expect(response.headers.get("cache-control")).toContain("no-store"); expect(response.headers.get("vary")).toBe("Cookie");
  });
  it("keeps denied records and provider errors out of responses, logs, and exports", async () => {
    mocks.view.mockRejectedValue(new DisclosureError(404, "Disclosure not found."));
    expect((await record(new NextRequest("https://board.example.invalid/api/disclosures/private/record"), context)).status).toBe(404);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.mutate.mockRejectedValue(new Error("PRIVATE provider input"));
    const response = await change(request(), context); expect(response.status).toBe(500); expect(await response.text()).not.toContain("PRIVATE"); expect(JSON.stringify(spy.mock.calls)).not.toContain("PRIVATE"); spy.mockRestore();
  });
});
