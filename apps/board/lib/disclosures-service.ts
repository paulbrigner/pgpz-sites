import "server-only";
import { randomUUID } from "node:crypto";
import { sendDisclosureNotice } from "./disclosures-email";
import { boardAccessRepository } from "./board-access-repository";
import type { BoardAccessRecord } from "./board-access";
import { BOARD_ACCESS_REGISTRY_ENABLED } from "./config";
import { accessRecordGuard } from "./director-roster";
import { boardAuditLedger, authenticatedActor } from "./audit";
import type { BoardMember } from "./session";
import { boardDocumentRepository } from "./vault";
import { disclosuresRepository as repository } from "./disclosures-repository";
import { disclosureHash, verifyDisclosureSubmission } from "./disclosures-integrity";
import {
  DISCLOSURE_CATEGORIES, DISCLOSURE_ELECTRONIC_CONSENT, DisclosureError, disclosureAcknowledgment, disclosureChair, disclosureDirector, disclosureText, normalizeDisclosureForm,
  type DisclosureRequest, type DisclosureIdentity, type DisclosureSubmission, type DisclosureView, type DisclosureRegisterRow, type DisclosureEvent,
} from "./disclosures";

export const disclosureIdentity = (record: BoardAccessRecord): DisclosureIdentity => ({ accessId: record.id, email: record.email, name: record.name, role: record.role });
export async function disclosureActor(member: BoardMember) {
  const record = BOARD_ACCESS_REGISTRY_ENABLED ? await boardAccessRepository.getByEmail(member.email) : null;
  if (!record || record.status !== "active") throw new DisclosureError(403, "Active Board access is required.");
  return record;
}
async function selectedPerson(value: unknown, allowInvited = false) {
  const id = disclosureText(value, "Selected person", 150);
  const record = await boardAccessRepository.getById(id);
  if (!record || (record.status !== "active" && !(allowInvited && record.status === "invited"))) throw new DisclosureError(400, "Choose a current person from the Board roster.");
  return record;
}
function matches(person: DisclosureIdentity | null, record: BoardAccessRecord) { return !!person && person.accessId === record.id && person.email === record.email; }
export function disclosurePermissions(request: DisclosureRequest, record: BoardAccessRecord) {
  const isSubject = matches(request.subject, record) && record.status === "active";
  const excluded = request.excludedIds.includes(record.id);
  return { isSubject,
    isReviewer: !isSubject && !excluded && record.status === "active" && matches(request.reviewer, record) && disclosureDirector(record.role),
    isCounsel: !isSubject && !excluded && record.status === "active" && matches(request.counsel, record) && record.role === "legal-counsel",
  };
}
export async function requireDisclosureAccess(member: BoardMember, id: string) {
  const record = await disclosureActor(member);
  const request = await repository.get(id);
  const permissions = request ? disclosurePermissions(request, record) : null;
  if (!request || !permissions || !Object.values(permissions).some(Boolean)) throw new DisclosureError(404, "Disclosure not found.");
  // Admission contains no private answers. No draft or history query may precede this check.
  return { request, record, ...permissions };
}
export async function disclosureView(member: BoardMember, id: string): Promise<DisclosureView> {
  const { request, isSubject, isReviewer, isCounsel } = await requireDisclosureAccess(member, id);
  const events = await repository.events(id);
  const submissions = events.filter((event): event is DisclosureSubmission => event.kind === "submission");
  let previousHash: string | null = null;
  for (const [index, submission] of submissions.entries()) {
    if (!verifyDisclosureSubmission(submission) || submission.requestId !== id || submission.revision !== index + 1 || submission.previousHash !== previousHash) throw new DisclosureError(409, "The signed disclosure failed integrity verification.");
    previousHash = submission.hash;
  }
  if (request.revision !== submissions.length || request.latestHash !== previousHash) throw new DisclosureError(409, "The disclosure changed. Refresh to load its current record.");
  const draft = isSubject ? await repository.draft(id) : null;
  // Recheck after reading content to catch concurrent reassignment/revocation before returning it.
  const current = await requireDisclosureAccess(member, id);
  if (current.request.version !== request.version) throw new DisclosureError(409, "The disclosure changed. Refresh to load its current record.");
  return { request, events, draft, isSubject, isReviewer, isCounsel };
}
export async function disclosureDirectory(member: BoardMember) {
  const actor = await disclosureActor(member); const records: BoardAccessRecord[] = [];
  let cursor: Record<string, unknown> | null = null;
  do {
    const page = await boardAccessRepository.list({ limit: 100, ...(cursor ? { cursor } : {}) });
    records.push(...page.records.filter((record) => record.status !== "deactivated" && (disclosureChair(actor.role) || (record.status === "active" && (disclosureDirector(record.role) || record.role === "legal-counsel")) || record.id === actor.id)));
    cursor = page.cursor;
  } while (cursor);
  return records.map((record) => ({ ...disclosureIdentity(record), status: record.status }));
}
export async function disclosureRegister(member: BoardMember): Promise<DisclosureRegisterRow[]> {
  const actor = await disclosureActor(member);
  const requests = await Promise.all((await repository.ids(disclosureDirector(actor.role) ? undefined : actor.id)).map((id) => repository.get(id)));
  return requests.flatMap((request) => {
    if (!request) return [];
    const canOpen = Object.values(disclosurePermissions(request, actor)).some(Boolean);
    if (!canOpen && !disclosureDirector(actor.role)) return [];
    return [{ id: request.id, version: request.version, year: request.year, kind: request.kind, dueDate: request.dueDate, status: request.status, revision: request.revision, name: request.subject.name, canOpen }];
  }).sort((a, b) => b.year - a.year || a.name.localeCompare(b.name));
}
async function mutationGuards(member: BoardMember, request: DisclosureRequest, action: string, records: BoardAccessRecord[], evidence?: unknown) {
  const audit = await boardAuditLedger.buildAppendItems({ category: "account", action: `disclosure_${action}`, outcome: "success", actor: authenticatedActor(member),
    // Only opaque references and the signed digest enter the broader audit ledger.
    target: { type: "disclosure", id: request.id, version: evidence ? disclosureHash({ requestId: request.id, version: request.version, evidence }) : request.latestHash }, idempotencyKey: randomUUID(), occurredAt: new Date().toISOString(),
  });
  return [...new Map(records.map((record) => {
    const guard = accessRecordGuard(record);
    guard.ConditionCheck.ExpressionAttributeValues[":active"] = record.status;
    return [record.id, guard];
  })).values(), ...audit.TransactItems as Record<string, unknown>[]];
}
async function reviewers(subjectId: string, reviewerId: unknown, counselId: unknown, excludedIds: string[] = []) {
  const reviewer = await selectedPerson(reviewerId);
  const counsel = counselId ? await selectedPerson(counselId) : null;
  if (!disclosureDirector(reviewer.role) || reviewer.id === subjectId || excludedIds.includes(reviewer.id)) throw new DisclosureError(400, "Choose a different, disinterested director as reviewer.");
  if (counsel && (counsel.role !== "legal-counsel" || counsel.id === subjectId || excludedIds.includes(counsel.id))) throw new DisclosureError(400, "Choose eligible, explicitly invited legal counsel.");
  return { reviewer, counsel };
}
export async function createDisclosure(member: BoardMember, input: Record<string, unknown>) {
  const actor = await disclosureActor(member);
  const subject = await selectedPerson(input.subjectId, true);
  if (subject.id !== actor.id && !disclosureChair(actor.role)) throw new DisclosureError(403, "Only the Chair can assign another person's disclosure.");
  const { reviewer, counsel } = await reviewers(subject.id, input.reviewerId, input.counselId);
  if (input.kind !== "annual" && input.kind !== "matter") throw new DisclosureError(400, "Choose annual or matter-specific disclosure.");
  if (!Number.isInteger(input.year) || Number(input.year) < 2020 || Number(input.year) > 2100) throw new DisclosureError(400, "Enter a valid reporting year.");
  if (input.adoption !== "adopted" && input.adoption !== "proposed") throw new DisclosureError(400, "Specify whether the selected policy has been adopted.");
  const dueDate = input.dueDate ? disclosureText(input.dueDate, "Due date", 10) : null;
  if (dueDate && (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !Number.isFinite(Date.parse(dueDate)) || new Date(dueDate).toISOString().slice(0, 10) !== dueDate)) throw new DisclosureError(400, "Enter a valid due date.");
  const document = await boardDocumentRepository.getDocument(disclosureText(input.documentId, "Policy document", 150));
  if (!document || document.status !== "active" || document.currentVersion.versionId !== input.versionId || !/^[a-f0-9]{64}$/i.test(document.currentVersion.sha256)) throw new DisclosureError(409, "Select the current active policy version and try again.");
  const request: DisclosureRequest = { id: randomUUID(), version: 1, kind: input.kind, year: Number(input.year), dueDate,
    subject: disclosureIdentity(subject), reviewer: disclosureIdentity(reviewer), counsel: counsel ? disclosureIdentity(counsel) : null, excludedIds: [],
    policy: { documentId: document.documentId, versionId: document.currentVersion.versionId, title: document.title, sequence: document.currentVersion.sequence, sha256: document.currentVersion.sha256, adoption: input.adoption },
    createdAt: new Date().toISOString(), createdBy: actor.id, status: "requested", revision: 0, latestHash: null, lastNoticeAt: null, lastNoticeStatus: null,
  };
  return repository.commit(request, null, await mutationGuards(member, request, "assigned", [actor, subject, reviewer, ...(counsel ? [counsel] : [])]));
}
export async function mutateDisclosure(member: BoardMember, id: string, input: Record<string, unknown>) {
  const access = await requireDisclosureAccess(member, id);
  const { request, record, isSubject, isReviewer, isCounsel } = access;
  if (input.expectedVersion !== request.version) throw new DisclosureError(409, "The disclosure changed. Refresh before trying again.");
  const next = { ...request, version: request.version + 1 }; const at = new Date().toISOString();
  let event: DisclosureEvent | undefined;
  let draft;
  const guards = [record];
  if (input.action === "save" || input.action === "prepare") {
    if (!isSubject) throw new DisclosureError(403, "Only the named person can prepare their disclosure.");
    const form = normalizeDisclosureForm(input.form, request.kind, input.action === "prepare");
    draft = { form, hash: disclosureHash({ form, policy: request.policy, requestId: id }), savedAt: at };
  } else if (input.action === "sign") {
    if (!isSubject) throw new DisclosureError(403, "Only the named person can sign their disclosure.");
    draft = await repository.draft(id);
    if (!draft || input.draftHash !== draft.hash || draft.hash !== disclosureHash({ form: draft.form, policy: request.policy, requestId: id })) throw new DisclosureError(409, "Save and review the current disclosure before signing.");
    if (input.accepted !== true) throw new DisclosureError(400, "Confirm the acknowledgment and intent to sign electronically.");
    const signedName = disclosureText(input.signedName, "Your signature", 200);
    if (signedName.replace(/\s+/g, " ").toLocaleLowerCase() !== record.name.trim().replace(/\s+/g, " ").toLocaleLowerCase()) throw new DisclosureError(400, "Type your name exactly as shown for this Board account.");
    const unsigned: Omit<DisclosureSubmission, "hash"> = { kind: "submission", schema: 1, requestId: id, revision: request.revision + 1, previousHash: request.latestHash,
      disclosureKind: request.kind, year: request.year, policy: request.policy, form: normalizeDisclosureForm(draft.form, request.kind), questions: [...DISCLOSURE_CATEGORIES],
      actor: { ...disclosureIdentity(record), userId: member.id }, signedName, deliveredAt: at,
      acknowledgment: disclosureAcknowledgment(request.policy), electronicConsent: DISCLOSURE_ELECTRONIC_CONSENT,
    };
    event = { ...unsigned, hash: disclosureHash(unsigned) }; next.revision = event.revision; next.latestHash = event.hash; next.status = "submitted";
    // Reviewers can change status only against this newly signed revision.
  } else if (input.action === "review" || input.action === "comment") {
    if ((!isReviewer && !isCounsel) || (input.action === "review" && !isReviewer)) throw new DisclosureError(403, "Only the assigned director may record completion of review; invited counsel may add advice.");
    if (!request.latestHash || input.submissionHash !== request.latestHash) throw new DisclosureError(409, "Review the current signed submission first.");
    if (input.independent !== true) throw new DisclosureError(400, "Confirm you are disinterested in this disclosure; otherwise route it to another director.");
    if (input.action === "review" && input.outcome !== "reviewed" && input.outcome !== "needs-information" && input.outcome !== "satisfactory") throw new DisclosureError(400, "Choose a review outcome.");
    const note = disclosureText(input.note, "Review findings and any required recusals or next steps", 6000);
    const outcome = input.action === "comment" ? "counsel-advice" : String(input.outcome);
    event = { kind: "review", at, actor: disclosureIdentity(record), revision: request.revision, note, outcome };
    if (input.action === "review") next.status = input.outcome as DisclosureRequest["status"];
  } else if (input.action === "route") {
    if (!isSubject && !isReviewer && !isCounsel) throw new DisclosureError(403, "Only an admitted participant can route a disclosure.");
    const note = disclosureText(input.note, "Reason for changing the review assignment", 2000);
    // Removed reviewers cannot restore themselves. The subject or an admitted reviewer must explicitly route elsewhere.
    if (input.reviewerId === request.reviewer.accessId && (input.counselId || null) === (request.counsel?.accessId ?? null)) throw new DisclosureError(400, "Choose a different review assignment.");
    const retainedIds = [input.reviewerId, input.counselId];
    const removedIds = [request.reviewer.accessId, ...(request.counsel ? [request.counsel.accessId] : [])].filter((personId) => !retainedIds.includes(personId));
    const excludedIds = [...new Set([...request.excludedIds, ...removedIds])];
    const selected = await reviewers(request.subject.accessId, input.reviewerId, input.counselId, excludedIds);
    next.reviewer = disclosureIdentity(selected.reviewer); next.counsel = selected.counsel ? disclosureIdentity(selected.counsel) : null; next.excludedIds = excludedIds;
    next.status = request.revision ? "submitted" : "requested";
    guards.push(selected.reviewer, ...(selected.counsel ? [selected.counsel] : []));
    event = { kind: "routing", at, actor: disclosureIdentity(record), revision: request.revision, note, outcome: `Assigned to ${selected.reviewer.name}${selected.counsel ? ` with counsel ${selected.counsel.name}` : ""}` };
  } else throw new DisclosureError(400, "Unknown disclosure action.");
  return repository.commit(next, request.version, await mutationGuards(member, next, String(input.action), guards, event ?? draft), { ...(draft ? { draft } : {}), ...(event ? { event } : {}) });
}

export async function disclosurePolicyOptions() {
  return (await boardDocumentRepository.listDocuments({ status: "active" })).map((document) => ({ documentId: document.documentId, versionId: document.currentVersion.versionId, title: document.title, sequence: document.currentVersion.sequence }));
}

/** A manual, single-recipient send is claimed before delivery; an uncertain attempt is never automatically retried. */
export async function notifyDisclosure(member: BoardMember, id: string, input: Record<string, unknown>) {
  const actor = await disclosureActor(member); const request = await repository.get(id);
  if (!request) throw new DisclosureError(404, "Disclosure not found.");
  const permissions = disclosurePermissions(request, actor);
  if (!disclosureChair(actor.role) && !permissions.isSubject && !permissions.isReviewer) throw new DisclosureError(403, "Only the Chair, subject, or assigned director can send this reminder.");
  if (input.expectedVersion !== request.version) throw new DisclosureError(409, "Refresh the disclosure before sending a reminder.");
  if (request.lastNoticeAt && Date.now() - Date.parse(request.lastNoticeAt) < 5 * 60_000) throw new DisclosureError(429, "A reminder was attempted recently. Wait five minutes before another send.");
  const target = input.target === "reviewer" ? request.reviewer : input.target === "subject" ? request.subject : null;
  if (!target) throw new DisclosureError(400, "Choose the subject or reviewing director.");
  const recipient = await selectedPerson(target.accessId, input.target === "subject");
  if (recipient.email !== target.email || (input.target === "reviewer" && !disclosureDirector(recipient.role))) throw new DisclosureError(409, "The recipient's Board access changed.");
  const pending: DisclosureRequest = { ...request, version: request.version + 1, lastNoticeAt: new Date().toISOString(), lastNoticeStatus: "sending" };
  await repository.commit(pending, request.version, await mutationGuards(member, pending, "notice_attempted", [actor, recipient]), { event: {
    kind: "notice", at: pending.lastNoticeAt!, actor: disclosureIdentity(actor), revision: request.revision, outcome: "attempted", note: `Reminder to ${input.target}. A send attempt is not proof of delivery.`,
  } });
  let status: "sent" | "unknown" = "sent";
  try { await sendDisclosureNotice({ id, year: request.year, dueDate: request.dueDate, to: recipient.email }); } catch { status = "unknown"; }
  // Another edit may have advanced the request during email delivery. Preserve that edit and report uncertainty if recording the result conflicts.
  const current = await repository.get(id);
  if (!current || current.lastNoticeAt !== pending.lastNoticeAt) return { status: "unknown" };
  try {
    await repository.commit({ ...current, version: current.version + 1, lastNoticeStatus: status }, current.version, await mutationGuards(member, current, "notice_result", [actor, recipient]), { event: {
      kind: "notice", at: new Date().toISOString(), actor: disclosureIdentity(actor), revision: request.revision, outcome: status,
      note: status === "sent" ? "Email provider accepted the reminder; inbox delivery is not confirmed." : "Delivery is uncertain. Check with the recipient before manually trying again.",
    } });
  } catch { return { status: "unknown" }; }
  return { status };
}
