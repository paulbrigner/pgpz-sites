import "server-only";

import { createHash, randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  acceptanceCoversCurrentRevision,
  effectiveLetterCampaignStatus,
  isLetterCampaignStatus,
  isLetterRevisionChangeType,
  normalizeLetterSlug,
  type LetterAcceptance,
  type LetterCampaignStatus,
  type LetterDocumentRevision,
  type LetterRevisionChangeType,
  type LetterSignerIdentity,
} from "@pgpz/letter-signons";
import { documentClient, TABLE_NAME } from "@/lib/dynamodb";
import {
  LETTER_SIGNON_BUCKET,
  LETTER_SIGNON_PREFIX,
  SITE_URL,
} from "@/lib/config";
import { s3Client } from "@/lib/s3";

const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;
const CAMPAIGN_INDEX_KEY = "LETTER_CAMPAIGN";

export type StoredLetterRevision = LetterDocumentRevision & {
  bucket: string;
  key: string;
  etag: string | null;
  uploadedBy: string;
};

export type LetterCampaign = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  recipient: string;
  deadlineAt: string;
  status: LetterCampaignStatus;
  effectiveStatus: LetterCampaignStatus;
  currentDocument: StoredLetterRevision;
  revisions: StoredLetterRevision[];
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  deliveredAt: string | null;
  archivedAt: string | null;
  notices: LetterCampaignNotice[];
};

export type LetterCampaignNotice = {
  id: string;
  subject: string;
  message: string;
  changeType: LetterRevisionChangeType | "status" | "delivered";
  documentVersion: number;
  sentAt: string;
  sentBy: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
};

export type LetterSignOn = LetterSignerIdentity & {
  campaignId: string;
  userId: string;
  email: string;
  acceptances: LetterAcceptance[];
  acceptedAt: string;
  documentVersion: number;
  documentSha256: string;
  acceptanceText: string;
  current: boolean;
  withdrawnAt: string | null;
  confirmationStatus: "pending" | "sent" | "failed";
  confirmationSentAt: string | null;
  confirmationError: string | null;
  createdAt: string;
  updatedAt: string;
};

type StoredCampaignItem = Omit<LetterCampaign, "effectiveStatus"> & {
  pk: string;
  sk: string;
  type: "LETTER_CAMPAIGN";
  GSI1PK: string;
  GSI1SK: string;
};

type StoredSignOnItem = Omit<LetterSignOn, "current"> & {
  pk: string;
  sk: string;
  type: "LETTER_SIGNON";
};

const campaignKey = (campaignId: string) => ({
  pk: `LETTER_CAMPAIGN#${campaignId}`,
  sk: `LETTER_CAMPAIGN#${campaignId}`,
});

const slugKey = (slug: string) => ({
  pk: `LETTER_CAMPAIGN_SLUG#${slug}`,
  sk: `LETTER_CAMPAIGN_SLUG#${slug}`,
});

const signOnKey = (campaignId: string, userId: string) => ({
  pk: `LETTER_CAMPAIGN#${campaignId}`,
  sk: `SIGNON#${userId}`,
});

const trimText = (value: unknown, maximum: number) =>
  (typeof value === "string" ? value.trim() : "").slice(0, maximum);

const safeFileName = (value: unknown) => {
  const name = trimText(value, 180)
    .replace(/[^\w.\- ()]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return name.toLowerCase().endsWith(".pdf") ? name : `${name || "letter"}.pdf`;
};

function requireLetterBucket() {
  const bucket = LETTER_SIGNON_BUCKET?.trim();
  if (!bucket) {
    throw new Error(
      "Letter document storage is not configured. Set LETTER_SIGNON_BUCKET or PUBLIC_FILES_BUCKET.",
    );
  }
  return bucket;
}

function validatePdf(bytes: Uint8Array) {
  if (!bytes.byteLength) throw new Error("A PDF letter is required.");
  if (bytes.byteLength > MAX_DOCUMENT_BYTES) {
    throw new Error("Letter PDFs must be 15 MB or smaller.");
  }
  const signature = new TextDecoder().decode(bytes.slice(0, 5));
  if (signature !== "%PDF-") {
    throw new Error("The uploaded file does not contain a valid PDF signature.");
  }
}

function documentObjectKey(campaignId: string, version: number, sha256: string) {
  return `${LETTER_SIGNON_PREFIX}/campaigns/${campaignId}/documents/v${version}-${sha256.slice(0, 16)}.pdf`;
}

function toCampaign(item: Record<string, unknown> | undefined): LetterCampaign | null {
  if (!item?.id || !item.currentDocument || !Array.isArray(item.revisions)) return null;
  const status = isLetterCampaignStatus(item.status) ? item.status : "draft";
  const deadlineAt = trimText(item.deadlineAt, 80);
  return {
    id: String(item.id),
    slug: String(item.slug || ""),
    title: String(item.title || ""),
    summary: String(item.summary || ""),
    recipient: String(item.recipient || ""),
    deadlineAt,
    status,
    effectiveStatus: effectiveLetterCampaignStatus({ status, deadlineAt }),
    currentDocument: item.currentDocument as StoredLetterRevision,
    revisions: item.revisions as StoredLetterRevision[],
    createdAt: String(item.createdAt || ""),
    createdBy: String(item.createdBy || ""),
    updatedAt: String(item.updatedAt || ""),
    updatedBy: String(item.updatedBy || ""),
    deliveredAt: item.deliveredAt ? String(item.deliveredAt) : null,
    archivedAt: item.archivedAt ? String(item.archivedAt) : null,
    notices: Array.isArray(item.notices)
      ? (item.notices as LetterCampaignNotice[])
      : [],
  };
}

function toSignOn(
  item: Record<string, unknown> | undefined,
  campaign: LetterCampaign,
): LetterSignOn | null {
  if (!item?.userId || !item.email || !item.acceptedAt) return null;
  const documentVersion = Number(item.documentVersion || 0);
  return {
    campaignId: String(item.campaignId || campaign.id),
    userId: String(item.userId),
    email: String(item.email),
    signerKind: item.signerKind === "organization" ? "organization" : "individual",
    displayName: String(item.displayName || ""),
    organizationName: item.organizationName ? String(item.organizationName) : null,
    title: item.title ? String(item.title) : null,
    affiliation: item.affiliation ? String(item.affiliation) : null,
    acceptances: Array.isArray(item.acceptances)
      ? (item.acceptances as LetterAcceptance[])
      : [],
    acceptedAt: String(item.acceptedAt),
    documentVersion,
    documentSha256: String(item.documentSha256 || ""),
    acceptanceText: String(item.acceptanceText || ""),
    current:
      !item.withdrawnAt &&
      acceptanceCoversCurrentRevision({
        revisions: campaign.revisions,
        acceptedVersion: documentVersion,
        currentVersion: campaign.currentDocument.version,
      }),
    withdrawnAt: item.withdrawnAt ? String(item.withdrawnAt) : null,
    confirmationStatus:
      item.confirmationStatus === "sent"
        ? "sent"
        : item.confirmationStatus === "failed"
          ? "failed"
          : "pending",
    confirmationSentAt: item.confirmationSentAt
      ? String(item.confirmationSentAt)
      : null,
    confirmationError: item.confirmationError
      ? String(item.confirmationError)
      : null,
    createdAt: String(item.createdAt || item.acceptedAt),
    updatedAt: String(item.updatedAt || item.acceptedAt),
  };
}

async function putRevisionObject({
  campaignId,
  version,
  fileName,
  bytes,
  changeType,
  changeSummary,
  adminUserId,
}: {
  campaignId: string;
  version: number;
  fileName: string;
  bytes: Uint8Array;
  changeType: LetterRevisionChangeType;
  changeSummary: string;
  adminUserId: string;
}): Promise<StoredLetterRevision> {
  validatePdf(bytes);
  const bucket = requireLetterBucket();
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const key = documentObjectKey(campaignId, version, sha256);
  const uploadedAt = new Date().toISOString();
  const result = await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: bytes,
      ContentType: "application/pdf",
      ContentDisposition: `inline; filename="${safeFileName(fileName).replace(/"/g, "")}"`,
      ServerSideEncryption: "AES256",
      Metadata: {
        "campaign-id": campaignId,
        "document-version": String(version),
        "document-sha256": sha256,
      },
    }),
  );
  return {
    version,
    sha256,
    fileName: safeFileName(fileName),
    fileSize: bytes.byteLength,
    changeType,
    changeSummary: trimText(changeSummary, 600),
    uploadedAt,
    uploadedBy: adminUserId,
    bucket,
    key,
    etag: result.ETag ? String(result.ETag).replace(/^"|"$/g, "") : null,
  };
}

async function deleteRevisionObject(revision: StoredLetterRevision) {
  await s3Client
    .send(
      new DeleteObjectCommand({
        Bucket: revision.bucket,
        Key: revision.key,
      }),
    )
    .catch(() => undefined);
}

export async function listLetterCampaigns({
  includeArchived = false,
}: {
  includeArchived?: boolean;
} = {}) {
  const items: LetterCampaign[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const page = await documentClient.query({
      TableName: TABLE_NAME,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk",
      ExpressionAttributeValues: { ":pk": CAMPAIGN_INDEX_KEY },
      ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
    });
    for (const item of page.Items || []) {
      const campaign = toCampaign(item);
      if (campaign && (includeArchived || campaign.status !== "archived")) {
        items.push(campaign);
      }
    }
    exclusiveStartKey = page.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (exclusiveStartKey);

  return items.sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

export async function getLetterCampaignById(campaignId: string) {
  const id = trimText(campaignId, 100);
  if (!id) return null;
  const result = await documentClient.get({
    TableName: TABLE_NAME,
    Key: campaignKey(id),
    ConsistentRead: true,
  });
  return toCampaign(result.Item);
}

export async function getLetterCampaignBySlug(slugValue: string) {
  const slug = normalizeLetterSlug(slugValue);
  if (!slug) return null;
  const lookup = await documentClient.get({
    TableName: TABLE_NAME,
    Key: slugKey(slug),
    ConsistentRead: true,
  });
  const campaignId = trimText(lookup.Item?.campaignId, 100);
  return campaignId ? getLetterCampaignById(campaignId) : null;
}

export async function createLetterCampaign(input: {
  slug: unknown;
  title: unknown;
  summary: unknown;
  recipient: unknown;
  deadlineAt: string;
  status: unknown;
  fileName: string;
  bytes: Uint8Array;
  adminUserId: string;
}) {
  const id = randomUUID();
  const slug = normalizeLetterSlug(input.slug || input.title);
  const title = trimText(input.title, 220);
  const summary = trimText(input.summary, 2_000);
  const recipient = trimText(input.recipient, 500);
  const deadline = new Date(input.deadlineAt);
  if (!Number.isFinite(deadline.getTime())) {
    throw new Error("A valid sign-on deadline is required.");
  }
  const deadlineAt = deadline.toISOString();
  const status = isLetterCampaignStatus(input.status) ? input.status : "draft";
  if (!slug) throw new Error("A URL slug is required.");
  if (!title) throw new Error("A letter title is required.");
  if (status === "open" && Date.parse(deadlineAt) <= Date.now()) {
    throw new Error("An open campaign deadline must be in the future.");
  }

  const revision = await putRevisionObject({
    campaignId: id,
    version: 1,
    fileName: input.fileName,
    bytes: input.bytes,
    changeType: "initial",
    changeSummary: "Initial draft",
    adminUserId: input.adminUserId,
  });
  const now = revision.uploadedAt;
  const campaign: StoredCampaignItem = {
    ...campaignKey(id),
    type: "LETTER_CAMPAIGN",
    id,
    slug,
    title,
    summary,
    recipient,
    deadlineAt,
    status,
    currentDocument: revision,
    revisions: [revision],
    notices: [],
    createdAt: now,
    createdBy: input.adminUserId,
    updatedAt: now,
    updatedBy: input.adminUserId,
    deliveredAt: status === "delivered" ? now : null,
    archivedAt: status === "archived" ? now : null,
    GSI1PK: CAMPAIGN_INDEX_KEY,
    GSI1SK: `${now}#${id}`,
  };

  try {
    await documentClient.transactWrite({
      TransactItems: [
        {
          Put: {
            TableName: TABLE_NAME,
            Item: campaign,
            ConditionExpression: "attribute_not_exists(pk)",
          },
        },
        {
          Put: {
            TableName: TABLE_NAME,
            Item: {
              ...slugKey(slug),
              type: "LETTER_CAMPAIGN_SLUG",
              slug,
              campaignId: id,
              createdAt: now,
            },
            ConditionExpression: "attribute_not_exists(pk)",
          },
        },
      ],
    });
  } catch (error) {
    await deleteRevisionObject(revision);
    throw error;
  }
  return toCampaign(campaign)!;
}

export async function addLetterRevision(input: {
  campaignId: string;
  fileName: string;
  bytes: Uint8Array;
  changeType: unknown;
  changeSummary: unknown;
  adminUserId: string;
}) {
  const campaign = await getLetterCampaignById(input.campaignId);
  if (!campaign) throw new Error("Letter campaign not found.");
  if (!isLetterRevisionChangeType(input.changeType) || input.changeType === "initial") {
    throw new Error("A revision must be classified as minor or material.");
  }
  const changeSummary = trimText(input.changeSummary, 600);
  if (!changeSummary) throw new Error("Describe what changed in this revision.");
  const version = campaign.currentDocument.version + 1;
  const revision = await putRevisionObject({
    campaignId: campaign.id,
    version,
    fileName: input.fileName,
    bytes: input.bytes,
    changeType: input.changeType,
    changeSummary,
    adminUserId: input.adminUserId,
  });

  try {
    await documentClient.update({
      TableName: TABLE_NAME,
      Key: campaignKey(campaign.id),
      UpdateExpression:
        "SET currentDocument = :document, revisions = list_append(revisions, :revision), updatedAt = :now, updatedBy = :admin",
      ConditionExpression:
        "attribute_exists(pk) AND currentDocument.#version = :expectedVersion",
      ExpressionAttributeNames: { "#version": "version" },
      ExpressionAttributeValues: {
        ":document": revision,
        ":revision": [revision],
        ":expectedVersion": campaign.currentDocument.version,
        ":now": revision.uploadedAt,
        ":admin": input.adminUserId,
      },
    });
  } catch (error) {
    await deleteRevisionObject(revision);
    throw error;
  }
  return getLetterCampaignById(campaign.id);
}

export async function updateLetterCampaign(input: {
  campaignId: string;
  title?: unknown;
  summary?: unknown;
  recipient?: unknown;
  deadlineAt?: unknown;
  status?: unknown;
  adminUserId: string;
}) {
  const campaign = await getLetterCampaignById(input.campaignId);
  if (!campaign) throw new Error("Letter campaign not found.");
  const title =
    input.title === undefined ? campaign.title : trimText(input.title, 220);
  const summary =
    input.summary === undefined
      ? campaign.summary
      : trimText(input.summary, 2_000);
  const recipient =
    input.recipient === undefined
      ? campaign.recipient
      : trimText(input.recipient, 500);
  const status = isLetterCampaignStatus(input.status)
    ? input.status
    : campaign.status;
  const deadline =
    input.deadlineAt === undefined
      ? new Date(campaign.deadlineAt)
      : new Date(String(input.deadlineAt));
  if (!Number.isFinite(deadline.getTime())) {
    throw new Error("A valid sign-on deadline is required.");
  }
  const deadlineAt = deadline.toISOString();
  if (!title) throw new Error("A letter title is required.");
  if (status === "open" && Date.parse(deadlineAt) <= Date.now()) {
    throw new Error("An open campaign deadline must be in the future.");
  }
  const now = new Date().toISOString();
  await documentClient.update({
    TableName: TABLE_NAME,
    Key: campaignKey(campaign.id),
    UpdateExpression:
      "SET title = :title, summary = :summary, recipient = :recipient, deadlineAt = :deadline, #status = :status, deliveredAt = :deliveredAt, archivedAt = :archivedAt, updatedAt = :now, updatedBy = :admin",
    ConditionExpression: "attribute_exists(pk)",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: {
      ":title": title,
      ":summary": summary,
      ":recipient": recipient,
      ":deadline": deadlineAt,
      ":status": status,
      ":deliveredAt":
        status === "delivered" ? campaign.deliveredAt || now : null,
      ":archivedAt": status === "archived" ? campaign.archivedAt || now : null,
      ":now": now,
      ":admin": input.adminUserId,
    },
  });
  return getLetterCampaignById(campaign.id);
}

export async function listLetterSignOns(campaign: LetterCampaign) {
  const signOns: LetterSignOn[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const page = await documentClient.query({
      TableName: TABLE_NAME,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":pk": campaignKey(campaign.id).pk,
        ":prefix": "SIGNON#",
      },
      ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
    });
    for (const item of page.Items || []) {
      const signOn = toSignOn(item, campaign);
      if (signOn) signOns.push(signOn);
    }
    exclusiveStartKey = page.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (exclusiveStartKey);
  return signOns.sort((left, right) =>
    left.acceptedAt.localeCompare(right.acceptedAt),
  );
}

export async function getLetterSignOn(
  campaign: LetterCampaign,
  userId: string,
) {
  const result = await documentClient.get({
    TableName: TABLE_NAME,
    Key: signOnKey(campaign.id, userId),
    ConsistentRead: true,
  });
  return toSignOn(result.Item, campaign);
}

export async function saveLetterSignOn(input: {
  campaign: LetterCampaign;
  userId: string;
  email: string;
  signer: LetterSignerIdentity;
  acceptanceText: string;
  now?: Date;
}) {
  const now = input.now || new Date();
  const acceptedAt = now.toISOString();
  if (
    effectiveLetterCampaignStatus(
      { status: input.campaign.status, deadlineAt: input.campaign.deadlineAt },
      now,
    ) !== "open"
  ) {
    throw new Error("This letter is no longer accepting sign-ons.");
  }
  const document = input.campaign.currentDocument;
  const acceptance: LetterAcceptance = {
    documentVersion: document.version,
    documentSha256: document.sha256,
    acceptanceText: trimText(input.acceptanceText, 1_000),
    acceptedAt,
  };
  if (!acceptance.acceptanceText) {
    throw new Error("The sign-on acceptance statement is required.");
  }
  const existing = await getLetterSignOn(input.campaign, input.userId);
  if (
    existing?.current &&
    existing.documentVersion === document.version &&
    !existing.withdrawnAt
  ) {
    return { signOn: existing, duplicate: true };
  }
  const item: StoredSignOnItem = {
    ...signOnKey(input.campaign.id, input.userId),
    type: "LETTER_SIGNON",
    campaignId: input.campaign.id,
    userId: input.userId,
    email: input.email.trim().toLowerCase(),
    ...input.signer,
    acceptances: [...(existing?.acceptances || []), acceptance],
    acceptedAt,
    documentVersion: document.version,
    documentSha256: document.sha256,
    acceptanceText: acceptance.acceptanceText,
    withdrawnAt: null,
    confirmationStatus: "pending",
    confirmationSentAt: null,
    confirmationError: null,
    createdAt: existing?.createdAt || acceptedAt,
    updatedAt: acceptedAt,
  };
  await documentClient.transactWrite({
    TransactItems: [
      {
        ConditionCheck: {
          TableName: TABLE_NAME,
          Key: campaignKey(input.campaign.id),
          ConditionExpression:
            "#status = :open AND deadlineAt > :now AND currentDocument.#version = :version AND currentDocument.sha256 = :sha256",
          ExpressionAttributeNames: {
            "#status": "status",
            "#version": "version",
          },
          ExpressionAttributeValues: {
            ":open": "open",
            ":now": acceptedAt,
            ":version": document.version,
            ":sha256": document.sha256,
          },
        },
      },
      {
        Put: {
          TableName: TABLE_NAME,
          Item: item,
          ...(existing
            ? {
                ConditionExpression:
                  "attribute_exists(pk) AND updatedAt = :expectedUpdatedAt",
                ExpressionAttributeValues: {
                  ":expectedUpdatedAt": existing.updatedAt,
                },
              }
            : { ConditionExpression: "attribute_not_exists(pk)" }),
        },
      },
    ],
  });
  return { signOn: toSignOn(item, input.campaign)!, duplicate: false };
}

export async function withdrawLetterSignOn(input: {
  campaign: LetterCampaign;
  userId: string;
  now?: Date;
}) {
  const now = input.now || new Date();
  const withdrawnAt = now.toISOString();
  if (
    effectiveLetterCampaignStatus(
      { status: input.campaign.status, deadlineAt: input.campaign.deadlineAt },
      now,
    ) !== "open"
  ) {
    throw new Error("The withdrawal window closed with the sign-on deadline.");
  }
  await documentClient.transactWrite({
    TransactItems: [
      {
        ConditionCheck: {
          TableName: TABLE_NAME,
          Key: campaignKey(input.campaign.id),
          ConditionExpression: "#status = :open AND deadlineAt > :now",
          ExpressionAttributeNames: { "#status": "status" },
          ExpressionAttributeValues: {
            ":open": "open",
            ":now": withdrawnAt,
          },
        },
      },
      {
        Update: {
          TableName: TABLE_NAME,
          Key: signOnKey(input.campaign.id, input.userId),
          UpdateExpression:
            "SET withdrawnAt = :now, updatedAt = :now, confirmationStatus = :pending REMOVE confirmationSentAt, confirmationError",
          ConditionExpression:
            "attribute_exists(pk) AND attribute_not_exists(withdrawnAt)",
          ExpressionAttributeValues: {
            ":now": withdrawnAt,
            ":pending": "pending",
          },
        },
      },
    ],
  });
  return getLetterSignOn(input.campaign, input.userId);
}

export async function markLetterConfirmation(input: {
  campaignId: string;
  userId: string;
  status: "sent" | "failed";
  error?: string | null;
}) {
  const now = new Date().toISOString();
  await documentClient.update({
    TableName: TABLE_NAME,
    Key: signOnKey(input.campaignId, input.userId),
    UpdateExpression:
      "SET confirmationStatus = :status, confirmationSentAt = :sentAt, confirmationError = :error, updatedAt = :now",
    ExpressionAttributeValues: {
      ":status": input.status,
      ":sentAt": input.status === "sent" ? now : null,
      ":error":
        input.status === "failed"
          ? trimText(input.error || "Confirmation delivery failed.", 600)
          : null,
      ":now": now,
    },
  });
}

export async function getLetterDocumentBytes(
  revision: StoredLetterRevision,
): Promise<Uint8Array> {
  const result = await s3Client.send(
    new GetObjectCommand({
      Bucket: revision.bucket,
      Key: revision.key,
    }),
  );
  if (!result.Body) throw new Error("The letter document is unavailable.");
  const bytes = await result.Body.transformToByteArray();
  validatePdf(bytes);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== revision.sha256) {
    throw new Error("The stored letter no longer matches its signed document hash.");
  }
  return bytes;
}

export async function recordLetterCampaignNotice(
  campaign: LetterCampaign,
  notice: LetterCampaignNotice,
) {
  await documentClient.transactWrite({
    TransactItems: [
      {
        Update: {
          TableName: TABLE_NAME,
          Key: campaignKey(campaign.id),
          UpdateExpression:
            "SET notices = list_append(if_not_exists(notices, :empty), :notice), updatedAt = :now, updatedBy = :admin",
          ConditionExpression: "attribute_exists(pk)",
          ExpressionAttributeValues: {
            ":empty": [],
            ":notice": [notice],
            ":now": notice.sentAt,
            ":admin": notice.sentBy,
          },
        },
      },
      {
        Update: {
          TableName: TABLE_NAME,
          Key: {
            pk: `LETTER_CAMPAIGN#${campaign.id}`,
            sk: `NOTICE#${notice.id}`,
          },
          UpdateExpression:
            "SET #status = :completed, completedAt = :now, recipientCount = :recipientCount, sentCount = :sentCount, failedCount = :failedCount",
          ConditionExpression: "#status = :sending",
          ExpressionAttributeNames: { "#status": "status" },
          ExpressionAttributeValues: {
            ":sending": "sending",
            ":completed": notice.failedCount ? "partial" : "completed",
            ":now": notice.sentAt,
            ":recipientCount": notice.recipientCount,
            ":sentCount": notice.sentCount,
            ":failedCount": notice.failedCount,
          },
        },
      },
    ],
  });
}

export async function claimLetterCampaignNotice(input: {
  campaign: LetterCampaign;
  noticeId: string;
  subject: string;
  message: string;
  changeType: LetterRevisionChangeType | "status" | "delivered";
  adminUserId: string;
}) {
  const noticeId = trimText(input.noticeId, 120);
  if (!/^[a-zA-Z0-9_-]{12,120}$/.test(noticeId)) {
    throw new Error("A valid notice idempotency key is required.");
  }
  const now = new Date().toISOString();
  await documentClient.put({
    TableName: TABLE_NAME,
    Item: {
      pk: `LETTER_CAMPAIGN#${input.campaign.id}`,
      sk: `NOTICE#${noticeId}`,
      type: "LETTER_CAMPAIGN_NOTICE",
      noticeId,
      campaignId: input.campaign.id,
      status: "sending",
      subject: trimText(input.subject, 220),
      message: trimText(input.message, 4_000),
      changeType: input.changeType,
      documentVersion: input.campaign.currentDocument.version,
      createdAt: now,
      createdBy: input.adminUserId,
    },
    ConditionExpression: "attribute_not_exists(pk)",
  });
  return noticeId;
}

export function letterCampaignUrl(campaign: Pick<LetterCampaign, "slug">) {
  return `${SITE_URL.replace(/\/+$/, "")}/letters/${encodeURIComponent(campaign.slug)}`;
}
