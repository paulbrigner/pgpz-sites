export const LETTER_CAMPAIGN_STATUSES = [
  "draft",
  "open",
  "closed",
  "delivered",
  "archived",
] as const;

export type LetterCampaignStatus = (typeof LETTER_CAMPAIGN_STATUSES)[number];

export const LETTER_REVISION_CHANGE_TYPES = [
  "initial",
  "minor",
  "material",
] as const;

export type LetterRevisionChangeType =
  (typeof LETTER_REVISION_CHANGE_TYPES)[number];

export const LETTER_SIGNER_KINDS = ["individual", "organization"] as const;

export type LetterSignerKind = (typeof LETTER_SIGNER_KINDS)[number];

export type LetterDocumentRevision = Readonly<{
  version: number;
  sha256: string;
  fileName: string;
  fileSize: number;
  changeType: LetterRevisionChangeType;
  changeSummary: string;
  uploadedAt: string;
}>;

export type LetterCampaignStateInput = Readonly<{
  status: LetterCampaignStatus;
  deadlineAt: string;
}>;

export type LetterAcceptance = Readonly<{
  documentVersion: number;
  documentSha256: string;
  acceptanceText: string;
  acceptedAt: string;
}>;

export type LetterSignerIdentity = Readonly<{
  signerKind: LetterSignerKind;
  displayName: string;
  organizationName: string | null;
  title: string | null;
  affiliation: string | null;
}>;
