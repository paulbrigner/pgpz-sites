import "server-only";

import { randomUUID } from "crypto";
import { documentClient, TABLE_NAME } from "@/lib/dynamodb";
import {
  policyUpdateCategoryLabels,
  policyUpdates,
  type PolicyUpdate,
  type PolicyUpdateCategory,
  type PolicyUpdateGenerationStatus,
  type PolicyUpdateSection,
  type PolicyUpdateSummary,
  type PolicyUpdateVisibilityStatus,
} from "@/lib/policy-updates";
import {
  POLICY_UPDATE_UPLOAD_BUCKET,
  POLICY_UPDATE_UPLOAD_PREFIX,
} from "@/lib/config";

const POLICY_UPDATE_UPLOAD_GSI_PK = "POLICY_UPDATE_UPLOAD";

export type UploadedPolicyUpdateRecord = {
  slug: string;
  category: PolicyUpdateCategory;
  title: string;
  shortTitle: string;
  publishedAt: string;
  displayDate: string;
  summary: string;
  emailSubject: string;
  emailPreheader: string;
  coverImage: string;
  pdfHref: string;
  portalPath: string;
  fileName: string;
  fileSize: number;
  contentType: string;
  s3Bucket: string;
  s3Key: string;
  visibilityStatus: PolicyUpdateVisibilityStatus;
  publishedOn: string | null;
  publishedBy: string | null;
  unpublishedOn: string | null;
  unpublishedBy: string | null;
  keyTakeaways: string[];
  actionItems: string[];
  sections: PolicyUpdateSection[];
  generationStatus: PolicyUpdateGenerationStatus;
  generatedAt: string | null;
  generatedBy: string | null;
  generatedModel: string | null;
  generationError: string | null;
  generationSourceTextLength: number | null;
  generationSourceTextSha256: string | null;
  uploadedAt: string;
  uploadedBy: string | null;
};

export type SaveUploadedPolicyUpdateInput = Omit<
  UploadedPolicyUpdateRecord,
  | "coverImage"
  | "pdfHref"
  | "portalPath"
  | "visibilityStatus"
  | "publishedOn"
  | "publishedBy"
  | "unpublishedOn"
  | "unpublishedBy"
  | "keyTakeaways"
  | "actionItems"
  | "sections"
  | "generationStatus"
  | "generatedAt"
  | "generatedBy"
  | "generatedModel"
  | "generationError"
  | "generationSourceTextLength"
  | "generationSourceTextSha256"
> &
  Partial<
    Pick<
      UploadedPolicyUpdateRecord,
      | "visibilityStatus"
      | "publishedOn"
      | "publishedBy"
      | "unpublishedOn"
      | "unpublishedBy"
      | "keyTakeaways"
      | "actionItems"
      | "sections"
      | "generationStatus"
      | "generatedAt"
      | "generatedBy"
      | "generatedModel"
      | "generationError"
      | "generationSourceTextLength"
      | "generationSourceTextSha256"
    >
  >;

export type SaveGeneratedPolicyUpdateContentInput = {
  slug: string;
  shortTitle?: string;
  summary: string;
  emailSubject?: string;
  emailPreheader: string;
  keyTakeaways: string[];
  actionItems: string[];
  sections: PolicyUpdateSection[];
  generatedBy: string | null;
  generatedModel: string;
  sourceTextLength: number;
  sourceTextSha256: string;
};

const textOrEmpty = (value: unknown) => (typeof value === "string" ? value : "");
const textOrNull = (value: unknown) => (typeof value === "string" && value.trim() ? value : null);

function normalizeVisibilityStatus(value: unknown): PolicyUpdateVisibilityStatus {
  return value === "published" || value === "unpublished" ? value : "draft";
}

function normalizeGenerationStatus(value: unknown): PolicyUpdateGenerationStatus {
  return value === "generated" || value === "failed" ? value : "not_started";
}

const textArrayOrFallback = (value: unknown, fallback: string[]) => {
  if (!Array.isArray(value)) return fallback;
  const items = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
  return items.length ? items : fallback;
};

const sectionArrayOrFallback = (value: unknown, fallback: PolicyUpdateSection[]) => {
  if (!Array.isArray(value)) return fallback;
  const sections = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const heading = textOrEmpty(record.heading).trim();
      const body = textArrayOrFallback(record.body, []);
      if (!heading || !body.length) return null;

      const section: PolicyUpdateSection = { heading, body };
      const bullets = textArrayOrFallback(record.bullets, []);
      const bodyAfterBullets = textArrayOrFallback(record.bodyAfterBullets, []);
      if (bullets.length) section.bullets = bullets;
      if (bodyAfterBullets.length) section.bodyAfterBullets = bodyAfterBullets;

      if (record.table && typeof record.table === "object") {
        const tableRecord = record.table as Record<string, unknown>;
        const columns = textArrayOrFallback(tableRecord.columns, []);
        const rows = Array.isArray(tableRecord.rows)
          ? tableRecord.rows
              .map((row) => textArrayOrFallback(row, []))
              .filter((row) => row.length)
          : [];
        if (columns.length && rows.length) section.table = { columns, rows };
      }

      if (Array.isArray(record.links)) {
        const links = record.links
          .map((link) => {
            if (!link || typeof link !== "object") return null;
            const linkRecord = link as Record<string, unknown>;
            const text = textOrEmpty(linkRecord.text).trim();
            const href = textOrEmpty(linkRecord.href).trim();
            return text && href ? { text, href } : null;
          })
          .filter((link): link is { text: string; href: string } => !!link);
        if (links.length) section.links = links;
      }

      return section;
    })
    .filter((section): section is PolicyUpdateSection => !!section);
  return sections.length ? sections : fallback;
};

function defaultUploadedPolicyUpdateContent({
  category,
  summary,
}: {
  category: PolicyUpdateCategory;
  summary: string;
}) {
  const categoryLabel = policyUpdateCategoryLabels[category];
  const fallbackSummary =
    summary.trim() || `A ${categoryLabel.toLowerCase()} resource is available for PGPZ members.`;
  const keyTakeaways =
    category === "special"
      ? [
          "A new featured policy resource has been uploaded for PGPZ Community review.",
          "Open the PDF resource to review the full analysis, citations, and formatting.",
          "This draft page can be published once the admin review is complete.",
        ]
      : [
          "A new weekly policy memo has been uploaded for PGPZ Community review.",
          "Open the PDF resource to review the full weekly update through the Zcash policy lens.",
          "This draft page can be published once the admin review is complete.",
        ];

  return {
    keyTakeaways,
    actionItems: [
      "Review the PDF resource and confirm the page metadata before publishing.",
      "Share follow-up questions or feedback with PGPZ.",
    ],
    sections: [
      {
        heading: "PDF Resource",
        body: [
          fallbackSummary,
          "This page is generated from the uploaded PDF metadata. The full resource is available through the PDF link above.",
        ],
      },
    ] satisfies PolicyUpdateSection[],
  };
}

export function getPolicyUpdateUploadBucket() {
  return POLICY_UPDATE_UPLOAD_BUCKET?.trim() || "";
}

export function policyUpdateUploadObjectKey(slug: string) {
  const cleanSlug = slug.trim().replace(/^\/+|\/+$/g, "");
  return POLICY_UPDATE_UPLOAD_PREFIX
    ? `${POLICY_UPDATE_UPLOAD_PREFIX}/${cleanSlug}.pdf`
    : `${cleanSlug}.pdf`;
}

export function createPolicyUpdateUploadSlug({
  title,
  publishedAt,
}: {
  title: string;
  publishedAt: string;
}) {
  const datePart = /^\d{4}-\d{2}-\d{2}$/.test(publishedAt)
    ? publishedAt
    : new Date().toISOString().slice(0, 10);
  const titlePart =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "policy-update";
  return `${datePart}-${titlePart}-${randomUUID().slice(0, 8)}`;
}

export function normalizePolicyUpdateCategory(value: unknown): PolicyUpdateCategory {
  return value === "special" ? "special" : "weekly";
}

export function formatPolicyUpdateDisplayDate(category: PolicyUpdateCategory, publishedAt: string) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(publishedAt)
    ? new Date(`${publishedAt}T00:00:00.000Z`)
    : new Date();
  const formatted = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
  return category === "weekly" ? `Week of ${formatted}` : formatted;
}

export function defaultPolicyUpdateCoverImage(category: PolicyUpdateCategory) {
  return category === "special"
    ? "/resources/1H2026-us-digital-asset-policy-cover.png"
    : "/resources/2026-06-08-weekly-policy-memo-cover.png";
}

function uploadedRecordFromItem(item: Record<string, any> | undefined | null): UploadedPolicyUpdateRecord | null {
  if (!item?.slug || !item?.s3Bucket || !item?.s3Key) return null;
  const category = normalizePolicyUpdateCategory(item.category);
  const slug = textOrEmpty(item.slug);
  const title = textOrEmpty(item.title) || slug;
  const shortTitle = textOrEmpty(item.shortTitle) || title;
  const publishedAt = textOrEmpty(item.publishedAt) || textOrEmpty(item.uploadedAt).slice(0, 10);
  const displayDate = textOrEmpty(item.displayDate) || formatPolicyUpdateDisplayDate(category, publishedAt);
  const categoryLabel = policyUpdateCategoryLabels[category];
  const summary =
    textOrEmpty(item.summary) ||
    `A ${categoryLabel.toLowerCase()} resource is available for PGPZ members.`;
  const defaultContent = defaultUploadedPolicyUpdateContent({ category, summary });

  return {
    slug,
    category,
    title,
    shortTitle,
    publishedAt,
    displayDate,
    summary,
    emailSubject: textOrEmpty(item.emailSubject) || `PGPZ ${categoryLabel}: ${title}`,
    emailPreheader:
      textOrEmpty(item.emailPreheader) ||
      summary.replace(/\s+/g, " ").trim().slice(0, 220) ||
      `A new ${categoryLabel.toLowerCase()} is available.`,
    coverImage: textOrEmpty(item.coverImage) || defaultPolicyUpdateCoverImage(category),
    pdfHref: `/api/policy-updates/${encodeURIComponent(slug)}/pdf`,
    portalPath: `/updates/${slug}`,
    fileName: textOrEmpty(item.fileName) || `${slug}.pdf`,
    fileSize: Number(item.fileSize || 0),
    contentType: textOrEmpty(item.contentType) || "application/pdf",
    s3Bucket: textOrEmpty(item.s3Bucket),
    s3Key: textOrEmpty(item.s3Key),
    visibilityStatus: normalizeVisibilityStatus(item.visibilityStatus),
    publishedOn: textOrNull(item.publishedOn),
    publishedBy: textOrNull(item.publishedBy),
    unpublishedOn: textOrNull(item.unpublishedOn),
    unpublishedBy: textOrNull(item.unpublishedBy),
    keyTakeaways: textArrayOrFallback(item.keyTakeaways, defaultContent.keyTakeaways),
    actionItems: textArrayOrFallback(item.actionItems, defaultContent.actionItems),
    sections: sectionArrayOrFallback(item.sections, defaultContent.sections),
    generationStatus: normalizeGenerationStatus(item.generationStatus),
    generatedAt: textOrNull(item.generatedAt),
    generatedBy: textOrNull(item.generatedBy),
    generatedModel: textOrNull(item.generatedModel),
    generationError: textOrNull(item.generationError),
    generationSourceTextLength: Number.isFinite(Number(item.generationSourceTextLength))
      ? Number(item.generationSourceTextLength)
      : null,
    generationSourceTextSha256: textOrNull(item.generationSourceTextSha256),
    uploadedAt: textOrEmpty(item.uploadedAt),
    uploadedBy: textOrNull(item.uploadedBy),
  };
}

export function uploadedPolicyUpdateToPolicyUpdate(record: UploadedPolicyUpdateRecord): PolicyUpdate {
  const categoryLabel = policyUpdateCategoryLabels[record.category];
  return {
    slug: record.slug,
    category: record.category,
    categoryLabel,
    title: record.title,
    shortTitle: record.shortTitle,
    publishedAt: record.publishedAt,
    displayDate: record.displayDate,
    summary: record.summary,
    emailSubject: record.emailSubject,
    emailPreheader: record.emailPreheader,
    coverImage: record.coverImage,
    pdfHref: record.pdfHref,
    portalPath: record.portalPath,
    keyTakeaways: record.keyTakeaways,
    actionItems: record.actionItems,
    sections: record.sections,
  };
}

export function policyUpdateToSummary(
  update: PolicyUpdate,
  source: PolicyUpdateSummary["source"] = "static",
  upload?: Pick<
    UploadedPolicyUpdateRecord,
    | "uploadedAt"
    | "fileName"
    | "visibilityStatus"
    | "publishedOn"
    | "publishedBy"
    | "unpublishedOn"
    | "unpublishedBy"
    | "generationStatus"
    | "generatedAt"
    | "generatedBy"
    | "generatedModel"
    | "generationError"
    | "generationSourceTextLength"
    | "generationSourceTextSha256"
  >,
): PolicyUpdateSummary {
  return {
    slug: update.slug,
    category: update.category,
    categoryLabel: update.categoryLabel,
    title: update.title,
    shortTitle: update.shortTitle,
    publishedAt: update.publishedAt,
    displayDate: update.displayDate,
    summary: update.summary,
    emailSubject: update.emailSubject,
    emailPreheader: update.emailPreheader,
    coverImage: update.coverImage,
    pdfHref: update.pdfHref,
    portalPath: update.portalPath,
    source,
    visibilityStatus: source === "uploaded" ? upload?.visibilityStatus || "draft" : "published",
    publishedOn: source === "uploaded" ? upload?.publishedOn || null : update.publishedAt,
    publishedBy: source === "uploaded" ? upload?.publishedBy || null : null,
    unpublishedOn: source === "uploaded" ? upload?.unpublishedOn || null : null,
    unpublishedBy: source === "uploaded" ? upload?.unpublishedBy || null : null,
    uploadedAt: upload?.uploadedAt || null,
    fileName: upload?.fileName || null,
    generationStatus: source === "uploaded" ? upload?.generationStatus || "not_started" : null,
    generatedAt: source === "uploaded" ? upload?.generatedAt || null : null,
    generatedBy: source === "uploaded" ? upload?.generatedBy || null : null,
    generatedModel: source === "uploaded" ? upload?.generatedModel || null : null,
    generationError: source === "uploaded" ? upload?.generationError || null : null,
    generationSourceTextLength:
      source === "uploaded" && typeof upload?.generationSourceTextLength === "number"
        ? upload.generationSourceTextLength
        : null,
    generationSourceTextSha256:
      source === "uploaded" ? upload?.generationSourceTextSha256 || null : null,
  };
}

export async function saveUploadedPolicyUpdate(
  input: SaveUploadedPolicyUpdateInput,
): Promise<UploadedPolicyUpdateRecord> {
  const category = normalizePolicyUpdateCategory(input.category);
  const categoryLabel = policyUpdateCategoryLabels[category];
  const summary =
    input.summary.trim() ||
    `A ${categoryLabel.toLowerCase()} resource is available for PGPZ members.`;
  const defaultContent = defaultUploadedPolicyUpdateContent({ category, summary });
  const record: UploadedPolicyUpdateRecord = {
    ...input,
    category,
    summary,
    displayDate: input.displayDate || formatPolicyUpdateDisplayDate(category, input.publishedAt),
    emailSubject: input.emailSubject.trim() || `PGPZ ${categoryLabel}: ${input.title}`,
    emailPreheader:
      input.emailPreheader.trim() ||
      summary.replace(/\s+/g, " ").trim().slice(0, 220) ||
      `A new ${categoryLabel.toLowerCase()} is available.`,
    coverImage: defaultPolicyUpdateCoverImage(category),
    pdfHref: `/api/policy-updates/${encodeURIComponent(input.slug)}/pdf`,
    portalPath: `/updates/${input.slug}`,
    visibilityStatus: input.visibilityStatus || "draft",
    publishedOn: input.publishedOn || null,
    publishedBy: input.publishedBy || null,
    unpublishedOn: input.unpublishedOn || null,
    unpublishedBy: input.unpublishedBy || null,
    keyTakeaways: input.keyTakeaways?.length ? input.keyTakeaways : defaultContent.keyTakeaways,
    actionItems: input.actionItems?.length ? input.actionItems : defaultContent.actionItems,
    sections: input.sections?.length ? input.sections : defaultContent.sections,
    generationStatus: input.generationStatus || "not_started",
    generatedAt: input.generatedAt || null,
    generatedBy: input.generatedBy || null,
    generatedModel: input.generatedModel || null,
    generationError: input.generationError || null,
    generationSourceTextLength: input.generationSourceTextLength || null,
    generationSourceTextSha256: input.generationSourceTextSha256 || null,
  };

  await documentClient.put({
    TableName: TABLE_NAME,
    Item: {
      pk: `POLICY_UPDATE_UPLOAD#${record.slug}`,
      sk: `POLICY_UPDATE_UPLOAD#${record.slug}`,
      type: "POLICY_UPDATE_UPLOAD",
      ...record,
      GSI1PK: POLICY_UPDATE_UPLOAD_GSI_PK,
      GSI1SK: `${record.uploadedAt}#${record.slug}`,
    },
  });

  return record;
}

export async function saveGeneratedPolicyUpdateContent(
  input: SaveGeneratedPolicyUpdateContentInput,
) {
  const slug = input.slug.trim();
  if (!slug) return null;

  const existing = await getUploadedPolicyUpdateRecord(slug);
  if (!existing) return null;

  const now = new Date().toISOString();
  const shortTitle = input.shortTitle?.trim() || existing.shortTitle;
  const emailSubject = input.emailSubject?.trim() || existing.emailSubject;

  await documentClient.update({
    TableName: TABLE_NAME,
    Key: {
      pk: `POLICY_UPDATE_UPLOAD#${slug}`,
      sk: `POLICY_UPDATE_UPLOAD#${slug}`,
    },
    UpdateExpression: [
      "SET #shortTitle = :shortTitle",
      "#summary = :summary",
      "#emailSubject = :emailSubject",
      "#emailPreheader = :emailPreheader",
      "#keyTakeaways = :keyTakeaways",
      "#actionItems = :actionItems",
      "#sections = :sections",
      "#generationStatus = :generationStatus",
      "#generatedAt = :generatedAt",
      "#generatedBy = :generatedBy",
      "#generatedModel = :generatedModel",
      "#generationError = :generationError",
      "#generationSourceTextLength = :generationSourceTextLength",
      "#generationSourceTextSha256 = :generationSourceTextSha256",
    ].join(", "),
    ExpressionAttributeNames: {
      "#shortTitle": "shortTitle",
      "#summary": "summary",
      "#emailSubject": "emailSubject",
      "#emailPreheader": "emailPreheader",
      "#keyTakeaways": "keyTakeaways",
      "#actionItems": "actionItems",
      "#sections": "sections",
      "#generationStatus": "generationStatus",
      "#generatedAt": "generatedAt",
      "#generatedBy": "generatedBy",
      "#generatedModel": "generatedModel",
      "#generationError": "generationError",
      "#generationSourceTextLength": "generationSourceTextLength",
      "#generationSourceTextSha256": "generationSourceTextSha256",
    },
    ExpressionAttributeValues: {
      ":shortTitle": shortTitle,
      ":summary": input.summary,
      ":emailSubject": emailSubject,
      ":emailPreheader": input.emailPreheader,
      ":keyTakeaways": input.keyTakeaways,
      ":actionItems": input.actionItems,
      ":sections": input.sections,
      ":generationStatus": "generated",
      ":generatedAt": now,
      ":generatedBy": input.generatedBy,
      ":generatedModel": input.generatedModel,
      ":generationError": null,
      ":generationSourceTextLength": input.sourceTextLength,
      ":generationSourceTextSha256": input.sourceTextSha256,
    },
  });

  return getUploadedPolicyUpdateRecord(slug);
}

export async function savePolicyUpdateGenerationFailure({
  slug,
  error,
  generatedBy,
  generatedModel,
}: {
  slug: string;
  error: string;
  generatedBy: string | null;
  generatedModel: string;
}) {
  const cleanSlug = slug.trim();
  if (!cleanSlug) return null;

  const existing = await getUploadedPolicyUpdateRecord(cleanSlug);
  if (!existing) return null;

  await documentClient.update({
    TableName: TABLE_NAME,
    Key: {
      pk: `POLICY_UPDATE_UPLOAD#${cleanSlug}`,
      sk: `POLICY_UPDATE_UPLOAD#${cleanSlug}`,
    },
    UpdateExpression:
      "SET #generationStatus = :generationStatus, #generatedAt = :generatedAt, #generatedBy = :generatedBy, #generatedModel = :generatedModel, #generationError = :generationError",
    ExpressionAttributeNames: {
      "#generationStatus": "generationStatus",
      "#generatedAt": "generatedAt",
      "#generatedBy": "generatedBy",
      "#generatedModel": "generatedModel",
      "#generationError": "generationError",
    },
    ExpressionAttributeValues: {
      ":generationStatus": "failed",
      ":generatedAt": new Date().toISOString(),
      ":generatedBy": generatedBy,
      ":generatedModel": generatedModel,
      ":generationError": error.slice(0, 1000),
    },
  });

  return getUploadedPolicyUpdateRecord(cleanSlug);
}

export async function getUploadedPolicyUpdateRecord(slug: string) {
  const cleanSlug = slug.trim();
  if (!cleanSlug) return null;

  const res = await documentClient.get({
    TableName: TABLE_NAME,
    Key: {
      pk: `POLICY_UPDATE_UPLOAD#${cleanSlug}`,
      sk: `POLICY_UPDATE_UPLOAD#${cleanSlug}`,
    },
  });

  return uploadedRecordFromItem(res.Item);
}

export async function getUploadedPolicyUpdate(slug: string) {
  const record = await getUploadedPolicyUpdateRecord(slug);
  return record ? uploadedPolicyUpdateToPolicyUpdate(record) : null;
}

export async function listUploadedPolicyUpdateRecords() {
  const uploads: UploadedPolicyUpdateRecord[] = [];
  let ExclusiveStartKey: Record<string, any> | undefined;

  do {
    const res = await documentClient.query({
      TableName: TABLE_NAME,
      IndexName: "GSI1",
      KeyConditionExpression: "#gsi1pk = :pk",
      ExpressionAttributeNames: { "#gsi1pk": "GSI1PK" },
      ExpressionAttributeValues: { ":pk": POLICY_UPDATE_UPLOAD_GSI_PK },
      ExclusiveStartKey,
      ScanIndexForward: false,
    });

    for (const item of res.Items || []) {
      const upload = uploadedRecordFromItem(item);
      if (upload) uploads.push(upload);
    }

    ExclusiveStartKey = res.LastEvaluatedKey as any;
  } while (ExclusiveStartKey);

  return uploads.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

export async function listPublishedPolicyUpdateRecords() {
  const uploads = await listUploadedPolicyUpdateRecords();
  return uploads
    .filter((upload) => upload.visibilityStatus === "published")
    .sort((a, b) => (b.publishedOn || b.uploadedAt).localeCompare(a.publishedOn || a.uploadedAt));
}

export async function publishUploadedPolicyUpdate(slug: string, adminUserId: string | null) {
  const record = await getUploadedPolicyUpdateRecord(slug);
  if (!record) return null;

  const now = new Date().toISOString();
  await documentClient.update({
    TableName: TABLE_NAME,
    Key: {
      pk: `POLICY_UPDATE_UPLOAD#${record.slug}`,
      sk: `POLICY_UPDATE_UPLOAD#${record.slug}`,
    },
    UpdateExpression:
      "SET visibilityStatus = :status, publishedOn = :now, publishedBy = :adminUserId, unpublishedOn = :nullValue, unpublishedBy = :nullValue",
    ExpressionAttributeValues: {
      ":status": "published",
      ":now": now,
      ":adminUserId": adminUserId,
      ":nullValue": null,
    },
  });

  return getUploadedPolicyUpdateRecord(record.slug);
}

export async function unpublishUploadedPolicyUpdate(slug: string, adminUserId: string | null) {
  const record = await getUploadedPolicyUpdateRecord(slug);
  if (!record) return null;

  const now = new Date().toISOString();
  await documentClient.update({
    TableName: TABLE_NAME,
    Key: {
      pk: `POLICY_UPDATE_UPLOAD#${record.slug}`,
      sk: `POLICY_UPDATE_UPLOAD#${record.slug}`,
    },
    UpdateExpression:
      "SET visibilityStatus = :status, unpublishedOn = :now, unpublishedBy = :adminUserId",
    ExpressionAttributeValues: {
      ":status": "unpublished",
      ":now": now,
      ":adminUserId": adminUserId,
    },
  });

  return getUploadedPolicyUpdateRecord(record.slug);
}

export async function getDistributablePolicyUpdate(slug: string) {
  return (await getUploadedPolicyUpdate(slug)) || policyUpdates.find((update) => update.slug === slug) || null;
}

export async function getDistributablePolicyUpdateSummaries() {
  const uploads = await listUploadedPolicyUpdateRecords();
  return [
    ...uploads.map((upload) =>
      policyUpdateToSummary(uploadedPolicyUpdateToPolicyUpdate(upload), "uploaded", upload),
    ),
    ...policyUpdates.map((update) => policyUpdateToSummary(update, "static")),
  ];
}

export async function getPublishedPolicyUpdate(slug: string) {
  const staticUpdate = policyUpdates.find((update) => update.slug === slug);
  if (staticUpdate) return staticUpdate;
  const uploaded = await getUploadedPolicyUpdateRecord(slug);
  if (!uploaded || uploaded.visibilityStatus !== "published") return null;
  return uploadedPolicyUpdateToPolicyUpdate(uploaded);
}

export async function getPublishedPolicyUpdates() {
  const uploads = await listPublishedPolicyUpdateRecords();
  return [
    ...uploads.map((upload) => uploadedPolicyUpdateToPolicyUpdate(upload)),
    ...policyUpdates,
  ].sort((a, b) => {
    const aUpload = uploads.find((upload) => upload.slug === a.slug);
    const bUpload = uploads.find((upload) => upload.slug === b.slug);
    const aSortValue = aUpload?.publishedOn || a.publishedAt;
    const bSortValue = bUpload?.publishedOn || b.publishedAt;
    return bSortValue.localeCompare(aSortValue);
  });
}

export async function getPublishedPolicyUpdateSummaries() {
  const updates = await getPublishedPolicyUpdates();
  const uploads = await listPublishedPolicyUpdateRecords();
  const uploadBySlug = new Map(uploads.map((upload) => [upload.slug, upload]));
  return updates.map((update) => {
    const upload = uploadBySlug.get(update.slug);
    return upload
      ? policyUpdateToSummary(update, "uploaded", upload)
      : policyUpdateToSummary(update, "static");
  });
}

export async function getPublishedPolicyUpdatesByCategory(category: PolicyUpdateCategory) {
  const updates = await getPublishedPolicyUpdates();
  return updates.filter((update) => update.category === category);
}
