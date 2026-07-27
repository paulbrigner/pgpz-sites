import {
  LETTER_CAMPAIGN_STATUSES,
  LETTER_REVISION_CHANGE_TYPES,
  LETTER_SIGNER_KINDS,
  type LetterCampaignStateInput,
  type LetterCampaignStatus,
  type LetterDocumentRevision,
  type LetterRevisionChangeType,
  type LetterSignerIdentity,
  type LetterSignerKind,
} from "./contracts";

const campaignStatuses = new Set<string>(LETTER_CAMPAIGN_STATUSES);
const revisionChangeTypes = new Set<string>(LETTER_REVISION_CHANGE_TYPES);
const signerKinds = new Set<string>(LETTER_SIGNER_KINDS);

const cleanText = (value: unknown, maximum: number) => {
  const result = typeof value === "string" ? value.trim() : "";
  return result.slice(0, maximum);
};

export function isLetterCampaignStatus(
  value: unknown,
): value is LetterCampaignStatus {
  return typeof value === "string" && campaignStatuses.has(value);
}

export function isLetterRevisionChangeType(
  value: unknown,
): value is LetterRevisionChangeType {
  return typeof value === "string" && revisionChangeTypes.has(value);
}

export function isLetterSignerKind(value: unknown): value is LetterSignerKind {
  return typeof value === "string" && signerKinds.has(value);
}

export function normalizeLetterSlug(value: unknown) {
  return cleanText(value, 100)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function parseIsoDate(value: unknown, fieldName: string) {
  const raw = cleanText(value, 80);
  const timestamp = Date.parse(raw);
  if (!raw || !Number.isFinite(timestamp)) {
    throw new Error(`${fieldName} must be a valid date and time.`);
  }
  return new Date(timestamp).toISOString();
}

export function effectiveLetterCampaignStatus(
  campaign: LetterCampaignStateInput,
  now: Date = new Date(),
): LetterCampaignStatus {
  if (campaign.status !== "open") return campaign.status;
  const deadline = Date.parse(campaign.deadlineAt);
  if (!Number.isFinite(deadline) || now.getTime() >= deadline) return "closed";
  return "open";
}

export function isLetterSignOnOpen(
  campaign: LetterCampaignStateInput,
  now: Date = new Date(),
) {
  return effectiveLetterCampaignStatus(campaign, now) === "open";
}

export function revisionsRequireReconfirmation(
  revisions: readonly Pick<LetterDocumentRevision, "version" | "changeType">[],
  acceptedVersion: number,
  currentVersion: number,
) {
  if (acceptedVersion >= currentVersion) return false;
  return revisions.some(
    (revision) =>
      revision.version > acceptedVersion &&
      revision.version <= currentVersion &&
      revision.changeType === "material",
  );
}

export function acceptanceCoversCurrentRevision({
  revisions,
  acceptedVersion,
  currentVersion,
}: {
  revisions: readonly Pick<LetterDocumentRevision, "version" | "changeType">[];
  acceptedVersion: number;
  currentVersion: number;
}) {
  return !revisionsRequireReconfirmation(
    revisions,
    acceptedVersion,
    currentVersion,
  );
}

export function normalizeSignerIdentity(input: {
  signerKind?: unknown;
  displayName?: unknown;
  organizationName?: unknown;
  title?: unknown;
  affiliation?: unknown;
}): LetterSignerIdentity {
  const signerKind = isLetterSignerKind(input.signerKind)
    ? input.signerKind
    : "individual";
  const displayName = cleanText(input.displayName, 160);
  const organizationName = cleanText(input.organizationName, 180) || null;
  const title = cleanText(input.title, 180) || null;
  const affiliation = cleanText(input.affiliation, 180) || null;

  if (!displayName) throw new Error("Your signer name is required.");
  if (signerKind === "organization" && !organizationName) {
    throw new Error("An organization or project name is required.");
  }

  return {
    signerKind,
    displayName,
    organizationName:
      signerKind === "organization" ? organizationName : null,
    title,
    affiliation,
  };
}

export function defaultLetterAcceptanceText({
  title,
  documentVersion,
}: {
  title: string;
  documentVersion: number;
}) {
  return `I confirm that I reviewed version ${documentVersion} of "${title}", support the letter, and authorize PGPZ to include the signer information shown here in the coalition signatory list.`;
}
