// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { executiveFakeClient, accessFixture } from "./executive-session-test-helpers";
import type { BoardAccessRecord } from "./board-access";
import type { BoardMember } from "./session";
import { DISCLOSURE_CATEGORIES, disclosureStatus, normalizeDisclosureForm, type DisclosureForm } from "./disclosures";

const mocks = vi.hoisted(() => ({ getByEmail: vi.fn(), getById: vi.fn(), list: vi.fn(), audit: vi.fn(), document: vi.fn(), send: vi.fn(), reviewSend: vi.fn() }));
vi.mock("./dynamodb", () => ({ documentClient: {} }));
vi.mock("./config", () => ({ BOARD_ACCESS_REGISTRY_ENABLED: true, BOARD_ACCESS_TABLE: "Access", BOARD_MEETINGS_TABLE: "Meetings" }));
vi.mock("./board-access-repository", () => ({ boardAccessRepository: { getByEmail: mocks.getByEmail, getById: mocks.getById, list: mocks.list } }));
vi.mock("./audit", () => ({ authenticatedActor: (member: BoardMember) => member, boardAuditLedger: { buildAppendItems: mocks.audit } }));
vi.mock("./vault", () => ({ boardDocumentRepository: { getDocument: mocks.document } }));
vi.mock("./disclosures-email", () => ({ sendDisclosureNotice: mocks.send, sendDisclosureReviewNotice: mocks.reviewSend }));
vi.mock("./disclosures-repository", async (original) => ({ ...await original<typeof import("./disclosures-repository")>(), disclosuresRepository: { get: vi.fn(), draft: vi.fn(), events: vi.fn(), ids: vi.fn(), commit: vi.fn() } }));
import { createDisclosuresRepository, disclosuresRepository } from "./disclosures-repository";
import { createDisclosure, disclosureView, mutateDisclosure, disclosureRegister, notifyDisclosure } from "./disclosures-service";
import { disclosureHash, verifyDisclosureSubmission } from "./disclosures-integrity";
import { disclosureRecordHtml, disclosureRecord } from "./disclosures-record";

const member = (id: string, role: BoardMember["role"] = "member"): BoardMember => ({ id: `auth-${id}`, name: id, email: `${id}@example.invalid`, role, isAdmin: role === "chair" || role === "executive-director" });
const chair = member("chair", "chair"), director = member("director"), ed = member("ed", "executive-director"), counsel = member("counsel", "legal-counsel");
const completeForm = (): DisclosureForm => ({ roles: "Executive Director", matter: "PRIVATE compensation review", answers: DISCLOSURE_CATEGORIES.map((_, index) => ({ choice: index ? "none" : "disclosed", details: index ? "" : "PRIVATE financial relationship <script>alert(1)</script>" })) });
let client: ReturnType<typeof executiveFakeClient>; let records: Map<string, BoardAccessRecord>;
const input = () => ({ subjectId: "ed", reviewerId: "director", counselId: "counsel", kind: "annual", year: 2026, documentId: "policy", versionId: "v1", adoption: "proposed", dueDate: "2026-09-15" });
async function prepare(id: string, form = completeForm()) {
  const request = (await disclosuresRepository.get(id))!;
  await mutateDisclosure(ed, id, { action: "prepare", expectedVersion: request.version, form });
  return disclosureView(ed, id);
}
async function sign(id: string) {
  const view = await disclosureView(ed, id);
  await mutateDisclosure(ed, id, { action: "sign", expectedVersion: view.request.version, draftHash: view.draft?.hash, accepted: true, signedName: "ed" });
  return disclosureView(ed, id);
}
beforeEach(() => {
  vi.clearAllMocks(); client = executiveFakeClient(); records = new Map();
  for (const [id, role] of [["chair", "chair"], ["director", "member"], ["alternate", "member"], ["ed", "executive-director"], ["support", "board-support"], ["counsel", "legal-counsel"], ["othercounsel", "legal-counsel"]] as const) {
    const record = accessFixture(id, role); records.set(id, record); client.seed("Access", { pk: `ACCESS#${id}`, sk: "PROFILE", ...record });
  }
  const repository = createDisclosuresRepository(client, "Meetings");
  for (const key of Object.keys(repository) as (keyof typeof repository)[]) vi.mocked(disclosuresRepository[key]).mockImplementation(repository[key] as never);
  mocks.getByEmail.mockImplementation(async (email: string) => records.get(email.split("@")[0]) ?? null);
  mocks.getById.mockImplementation(async (id: string) => records.get(id) ?? null);
  mocks.list.mockResolvedValue({ records: [...records.values()], cursor: null });
  mocks.audit.mockResolvedValue({ TransactItems: [] }); mocks.send.mockResolvedValue(undefined); mocks.reviewSend.mockResolvedValue(undefined);
  mocks.document.mockResolvedValue({ documentId: "policy", title: "Conflict of Interest Policy", status: "active", currentVersion: { versionId: "v1", sequence: 1, sha256: "a".repeat(64) } });
});

describe("Board individual disclosure workflow", () => {
  it("lets the Chair assign the ED, denies self-review and uninvited roles, and retains a unique annual assignment", async () => {
    const request = await createDisclosure(chair, input());
    expect(request.subject.role).toBe("executive-director");
    await expect(createDisclosure(chair, input())).rejects.toMatchObject({ status: 409 });
    await expect(createDisclosure(chair, { ...input(), subjectId: "chair", reviewerId: "chair" })).rejects.toMatchObject({ status: 400 });
    await expect(createDisclosure(ed, { ...input(), subjectId: "chair" })).rejects.toMatchObject({ status: 403 });
    await expect(createDisclosure(chair, { ...input(), reviewerId: "support" })).rejects.toMatchObject({ status: 400 });
    await expect(createDisclosure(chair, { ...input(), counselId: "support" })).rejects.toMatchObject({ status: 400 });
  });
  it("admits only named participants before querying history, draft answers, or exports", async () => {
    const request = await createDisclosure(chair, input()); await prepare(request.id);
    vi.mocked(disclosuresRepository.events).mockClear(); vi.mocked(disclosuresRepository.draft).mockClear();
    for (const actor of [chair, member("support", "board-support"), member("alternate"), member("othercounsel", "legal-counsel")]) await expect(disclosureView(actor, request.id)).rejects.toMatchObject({ status: 404 });
    expect(disclosuresRepository.events).not.toHaveBeenCalled(); expect(disclosuresRepository.draft).not.toHaveBeenCalled();
    const reviewerView = await disclosureView(director, request.id);
    expect(reviewerView.draft).toBeNull(); expect(JSON.stringify(reviewerView)).not.toContain("PRIVATE");
    expect(disclosuresRepository.draft).not.toHaveBeenCalled();
    expect((await disclosureView(counsel, request.id)).isCounsel).toBe(true);
  });
  it("saves unfinished drafts privately but requires all categories, details, acknowledgment, and correct identity to sign", async () => {
    const request = await createDisclosure(chair, input());
    const partial = { roles: "", matter: "", answers: DISCLOSURE_CATEGORIES.map(() => ({ choice: "", details: "" })) };
    await mutateDisclosure(ed, request.id, { action: "save", expectedVersion: 1, form: partial });
    await expect(sign(request.id)).rejects.toMatchObject({ status: 400 });
    const view = await prepare(request.id);
    for (const changed of [{ accepted: false }, { signedName: "someone else" }, { draftHash: "bad" }]) await expect(mutateDisclosure(ed, request.id, { action: "sign", expectedVersion: view.request.version, draftHash: view.draft!.hash, accepted: true, signedName: "ed", ...changed })).rejects.toBeDefined();
    await expect(mutateDisclosure(director, request.id, { action: "sign", expectedVersion: view.request.version })).rejects.toMatchObject({ status: 403 });
    const signed = await sign(request.id); expect(signed.request.revision).toBe(1);
    expect(signed.events[0]).toMatchObject({ questions: [...DISCLOSURE_CATEGORIES] });
    expect(signed.events[0]).toMatchObject({ kind: "submission", actor: { userId: "auth-ed" }, acknowledgment: expect.stringContaining("proposed") });
  });
  it.each(["reviewed", "satisfactory"] as const)("ties %s reviews to a signed revision, preserves amendments, and resets status", async (outcome) => {
    const request = await createDisclosure(chair, input()); await prepare(request.id); let view = await sign(request.id);
    const review = { action: "review", expectedVersion: view.request.version, submissionHash: view.request.latestHash, independent: true, outcome, note: "PRIVATE recusal required before compensation consideration." };
    await expect(mutateDisclosure(ed, request.id, review)).rejects.toMatchObject({ status: 403 });
    await expect(mutateDisclosure(counsel, request.id, review)).rejects.toMatchObject({ status: 403 });
    await expect(mutateDisclosure(director, request.id, { ...review, independent: false })).rejects.toMatchObject({ status: 400 });
    await mutateDisclosure(director, request.id, review);
    const reviewed = await disclosureView(ed, request.id);
    expect(reviewed.request.status).toBe(outcome);
    expect(reviewed.events.find((event) => event.kind === "review")).toMatchObject({ kind: "review", outcome, revision: 1 });
    expect(disclosureRecordHtml(reviewed)).toContain(disclosureStatus(outcome));
    if (outcome === "reviewed") expect(disclosureRecordHtml(reviewed)).not.toContain("satisfactory");
    expect((await disclosureRegister(chair))[0]).toMatchObject({ status: outcome, canOpen: false });
    for (let revision = 2; revision <= 5; revision++) { const form = completeForm(); form.matter = `PRIVATE amendment ${revision}`; await prepare(request.id, form); view = await sign(request.id); }
    expect(view.request.status).toBe("submitted"); expect(view.events.filter((event) => event.kind === "submission")).toHaveLength(5);
    await expect(mutateDisclosure(director, request.id, { ...review, expectedVersion: view.request.version })).rejects.toMatchObject({ status: 409 });
    const rows = [...client.items.values()].filter((row) => String(row.sk).startsWith("REVISION#")); expect(rows.length).toBeGreaterThan(10);
    expect(JSON.stringify(rows)).not.toContain("PRIVATE");
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("PRIVATE");
    const register = await disclosureRegister(chair); expect(register[0]).toMatchObject({ status: "submitted", canOpen: false }); expect(JSON.stringify(register)).not.toContain("PRIVATE");
    expect(await disclosureRegister(member("support", "board-support"))).toEqual([]);
    expect(disclosureRecord(view)).not.toHaveProperty("draft"); expect(disclosureRecordHtml(view)).not.toContain("<script>");
    expect(disclosureRecordHtml(view)).toContain("&lt;script&gt;");
  });
  it("requires explicit completion by the assigned director and clears completion on reassignment", async () => {
    const request = await createDisclosure(chair, input()); await prepare(request.id); let view = await sign(request.id);
    const review = { action: "review", expectedVersion: view.request.version, submissionHash: view.request.latestHash, independent: true, outcome: "satisfactory", note: "Review complete; no further disclosure follow-up needed." };
    for (const invalid of [{ outcome: "" }, { outcome: "approved" }, { note: "" }, { submissionHash: "stale" }]) {
      await expect(mutateDisclosure(director, request.id, { ...review, ...invalid })).rejects.toBeDefined();
    }
    await mutateDisclosure(counsel, request.id, { ...review, action: "comment" });
    view = await disclosureView(director, request.id);
    expect(view.request.status).toBe("submitted");
    expect(view.events.at(-1)).toMatchObject({ outcome: "counsel-advice" });
    await mutateDisclosure(director, request.id, { ...review, expectedVersion: view.request.version });
    view = await disclosureView(ed, request.id);
    await mutateDisclosure(ed, request.id, { action: "route", expectedVersion: view.request.version, reviewerId: "alternate", counselId: "", note: "Assign another disinterested director." });
    view = await disclosureView(member("alternate"), request.id);
    expect(view.request.status).toBe("submitted");
    expect(view.events.some((event) => event.kind === "review" && event.outcome === "satisfactory")).toBe(true);
  });
  it("removes implicated reviewers, prevents their restoration, and permits explicitly adding counsel without replacing the director", async () => {
    const request = await createDisclosure(chair, { ...input(), counselId: "" }); await prepare(request.id); let view = await sign(request.id);
    await mutateDisclosure(ed, request.id, { action: "route", expectedVersion: view.request.version, reviewerId: "director", counselId: "counsel", note: "Invite independent counsel." });
    view = await disclosureView(ed, request.id); expect((await disclosureView(counsel, request.id)).isCounsel).toBe(true);
    await mutateDisclosure(ed, request.id, { action: "route", expectedVersion: view.request.version, reviewerId: "alternate", counselId: "", note: "PRIVATE reviewer is implicated." });
    for (const actor of [director, counsel]) await expect(disclosureView(actor, request.id)).rejects.toMatchObject({ status: 404 });
    view = await disclosureView(member("alternate"), request.id); expect(view.events.some((event) => event.kind === "submission")).toBe(true); expect(view.draft).toBeNull();
    await expect(mutateDisclosure(ed, request.id, { action: "route", expectedVersion: view.request.version, reviewerId: "director", note: "Attempt restoring excluded reviewer." })).rejects.toMatchObject({ status: 400 });
  });
  it("rejects role revocation and optimistic concurrency races without overwriting prior records", async () => {
    const request = await createDisclosure(chair, input()); await prepare(request.id);
    await expect(mutateDisclosure(ed, request.id, { action: "prepare", expectedVersion: 1, form: completeForm() })).rejects.toMatchObject({ status: 409 });
    records.set("director", { ...records.get("director")!, role: "board-support" });
    await expect(disclosureView(director, request.id)).rejects.toMatchObject({ status: 404 });
    const oldView = await disclosureView(ed, request.id);
    client.seed("Access", { pk: "ACCESS#ed", sk: "PROFILE", version: 2, status: "deactivated" });
    await expect(sign(request.id)).rejects.toMatchObject({ status: 409 });
    expect((await disclosuresRepository.get(request.id))?.version).toBe(oldView.request.version);
  });
  it("accepts an invited subject assignment and sends only a claimed, explicit, single-recipient reminder", async () => {
    const invited = { ...records.get("ed")!, status: "invited" as const }; records.set("ed", invited); client.seed("Access", { pk: "ACCESS#ed", sk: "PROFILE", ...invited });
    const request = await createDisclosure(chair, input()); expect(mocks.send).not.toHaveBeenCalled();
    await expect(disclosureView(ed, request.id)).rejects.toMatchObject({ status: 403 });
    expect(await notifyDisclosure(chair, request.id, { target: "subject", expectedVersion: 1 })).toEqual({ status: "sent" });
    expect(mocks.send).toHaveBeenCalledExactlyOnceWith({ id: request.id, year: 2026, dueDate: "2026-09-15", to: "ed@example.invalid" });
    await expect(notifyDisclosure(chair, request.id, { target: "subject", expectedVersion: 1 })).rejects.toMatchObject({ status: 409 });
    await expect(notifyDisclosure(chair, request.id, { target: "subject", expectedVersion: 3 })).rejects.toMatchObject({ status: 429 });
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it("reports ambiguous email results without automatically retrying", async () => {
    const request = await createDisclosure(chair, input()); mocks.send.mockRejectedValue(new Error("PRIVATE provider response"));
    expect(await notifyDisclosure(chair, request.id, { target: "subject", expectedVersion: 1 })).toEqual({ status: "unknown" });
    expect(mocks.send).toHaveBeenCalledTimes(1); expect((await disclosuresRepository.get(request.id))?.lastNoticeStatus).toBe("unknown");
  });
  it("verifies signatures after nested map reordering and refuses tampering or a missing signed revision", async () => {
    const request = await createDisclosure(chair, input()); await prepare(request.id); const view = await sign(request.id); const submission = view.events[0];
    if (submission.kind !== "submission") throw new Error("missing submission");
    function reorder(value: unknown): unknown { return Array.isArray(value) ? value.map(reorder) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reorder(child)])) : value; }
    expect(verifyDisclosureSubmission(reorder(submission) as typeof submission)).toBe(true);
    expect(disclosureHash({ b: { y: 1, a: 2 }, a: 3 })).toBe(disclosureHash({ a: 3, b: { a: 2, y: 1 } }));
    const tampered = structuredClone(submission); tampered.form.roles = "Tampered"; expect(verifyDisclosureSubmission(tampered)).toBe(false);
    vi.mocked(disclosuresRepository.events).mockResolvedValue([tampered]); await expect(disclosureView(ed, request.id)).rejects.toMatchObject({ status: 409 });
    vi.mocked(disclosuresRepository.events).mockResolvedValue([]); await expect(disclosureView(ed, request.id)).rejects.toMatchObject({ status: 409 });
  });
  it.each(["satisfactory", "reviewed", "needs-information"] as const)("automatically emails only the subject for %s after a committed review, once per request version", async (outcome) => {
    const request = await createDisclosure(chair, input()); await prepare(request.id); const view = await sign(request.id);
    const review = { action: "review", expectedVersion: view.request.version, submissionHash: view.request.latestHash, independent: true, outcome, note: "PRIVATE review findings" };
    mocks.reviewSend.mockImplementation(async () => {
      expect((await disclosuresRepository.get(request.id))?.reviewNotice).toMatchObject({ status: "sending", outcome, revision: 1 });
      expect((await disclosuresRepository.events(request.id)).some((event) => event.kind === "review" && event.outcome === outcome)).toBe(true);
    });
    const result = await mutateDisclosure(director, request.id, review);
    expect(result.status).toBe(outcome); expect(result.reviewNotice?.status).toBe("sent");
    expect(mocks.reviewSend).toHaveBeenCalledExactlyOnceWith({ id: request.id, year: 2026, revision: 1, outcome, to: "ed@example.invalid" });
    expect(JSON.stringify(mocks.reviewSend.mock.calls)).not.toContain("PRIVATE");
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("PRIVATE");
    expect(mocks.send).not.toHaveBeenCalled();
    await expect(mutateDisclosure(director, request.id, review)).rejects.toMatchObject({ status: 409 });
    expect(mocks.reviewSend).toHaveBeenCalledTimes(1);
  });
  it("does not email for rejected reviews or counsel advice and retains a review when delivery is uncertain", async () => {
    const request = await createDisclosure(chair, input()); await prepare(request.id); let view = await sign(request.id);
    const review = { action: "review", expectedVersion: view.request.version, submissionHash: view.request.latestHash, independent: true, outcome: "satisfactory", note: "PRIVATE complete" };
    await expect(mutateDisclosure(director, request.id, { ...review, independent: false })).rejects.toMatchObject({ status: 400 });
    await mutateDisclosure(counsel, request.id, { ...review, action: "comment" });
    expect(mocks.reviewSend).not.toHaveBeenCalled();
    view = await disclosureView(director, request.id);
    mocks.reviewSend.mockRejectedValue(new Error("PRIVATE provider response"));
    const result = await mutateDisclosure(director, request.id, { ...review, expectedVersion: view.request.version });
    expect(result.status).toBe("satisfactory"); expect(result.reviewNotice?.status).toBe("unknown");
    expect(mocks.reviewSend).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(await disclosuresRepository.events(request.id))).not.toContain("PRIVATE provider response");
  });
  it.each(["deactivated", "changed-email"])("skips automatic delivery when the subject is %s", async (change) => {
    const request = await createDisclosure(chair, input()); await prepare(request.id); const view = await sign(request.id);
    const subject = records.get("ed")!;
    records.set("ed", change === "deactivated" ? { ...subject, status: "deactivated" } : { ...subject, email: "replacement@example.invalid" });
    const result = await mutateDisclosure(director, request.id, { action: "review", expectedVersion: view.request.version, submissionHash: view.request.latestHash, independent: true, outcome: "satisfactory", note: "Complete." });
    expect(result.reviewNotice?.status).toBe("skipped"); expect(result.status).toBe("satisfactory"); expect(mocks.reviewSend).not.toHaveBeenCalled();
  });
  it("preserves an intervening amendment while recording delivery and never turns a status-write failure into a failed review", async () => {
    const request = await createDisclosure(chair, input()); await prepare(request.id); let view = await sign(request.id);
    mocks.reviewSend.mockImplementation(async () => { await prepare(request.id); await sign(request.id); });
    let result = await mutateDisclosure(director, request.id, { action: "review", expectedVersion: view.request.version, submissionHash: view.request.latestHash, independent: true, outcome: "satisfactory", note: "Revision one review." });
    expect(result.revision).toBe(2); expect(result.status).toBe("submitted"); expect(result.reviewNotice).toMatchObject({ revision: 1, status: "sent" });
    view = await disclosureView(director, request.id);
    mocks.reviewSend.mockImplementation(async () => { vi.mocked(disclosuresRepository.commit).mockRejectedValueOnce(new Error("Result storage unavailable")); });
    result = await mutateDisclosure(director, request.id, { action: "review", expectedVersion: view.request.version, submissionHash: view.request.latestHash, independent: true, outcome: "satisfactory", note: "Revision two review." });
    expect(result.status).toBe("satisfactory"); expect(result.reviewNotice?.status).toBe("sending");
    expect((await disclosuresRepository.get(request.id))?.status).toBe("satisfactory");
    expect(mocks.reviewSend).toHaveBeenCalledTimes(2);
  });
  it("does not overwrite a newer review's notice when an older send finishes later", async () => {
    const request = await createDisclosure(chair, input()); await prepare(request.id); const view = await sign(request.id);
    mocks.reviewSend.mockImplementationOnce(async () => {
      const current = (await disclosuresRepository.get(request.id))!;
      await mutateDisclosure(director, request.id, { action: "review", expectedVersion: current.version, submissionHash: current.latestHash, independent: true, outcome: "needs-information", note: "Further clarification required." });
    });
    const result = await mutateDisclosure(director, request.id, { action: "review", expectedVersion: view.request.version, submissionHash: view.request.latestHash, independent: true, outcome: "satisfactory", note: "Initial review." });
    expect(result.status).toBe("needs-information"); expect(result.reviewNotice).toMatchObject({ outcome: "needs-information", status: "sent" });
    expect(mocks.reviewSend).toHaveBeenCalledTimes(2);
  });
  it("never sends when the guarded review transaction fails", async () => {
    const request = await createDisclosure(chair, input()); await prepare(request.id); const view = await sign(request.id);
    client.seed("Access", { pk: "ACCESS#director", sk: "PROFILE", version: 2, status: "deactivated" });
    await expect(mutateDisclosure(director, request.id, { action: "review", expectedVersion: view.request.version, submissionHash: view.request.latestHash, independent: true, outcome: "satisfactory", note: "Complete." })).rejects.toMatchObject({ status: 409 });
    expect(mocks.reviewSend).not.toHaveBeenCalled();
    expect((await disclosuresRepository.get(request.id))?.status).toBe("submitted");
  });
  it("requires matter context and enforces bounded, internally consistent answers", () => {
    expect(() => normalizeDisclosureForm({ ...completeForm(), matter: "" }, "matter")).toThrow();
    const form = completeForm(); form.answers[0] = { choice: "none", details: "Hidden text" }; expect(() => normalizeDisclosureForm(form, "annual")).toThrow();
    form.answers[0] = { choice: "disclosed", details: "x".repeat(4001) }; expect(() => normalizeDisclosureForm(form, "annual")).toThrow();
  });
});
