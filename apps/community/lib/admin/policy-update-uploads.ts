import "server-only";

import { randomUUID } from "crypto";
import { documentClient, TABLE_NAME } from "@/lib/dynamodb";
import {
  policyUpdateCategoryLabels,
  policyUpdates,
  type PolicyUpdate,
  type PolicyUpdateCategory,
  type PolicyUpdateSummary,
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
  uploadedAt: string;
  uploadedBy: string | null;
};

export type SaveUploadedPolicyUpdateInput = Omit<
  UploadedPolicyUpdateRecord,
  "coverImage" | "pdfHref" | "portalPath"
>;

const textOrEmpty = (value: unknown) => (typeof value === "string" ? value : "");
const textOrNull = (value: unknown) => (typeof value === "string" && value.trim() ? value : null);

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
    keyTakeaways: ["Open the PDF resource to review the full update."],
    actionItems: ["Share follow-up questions or feedback with PGPZ."],
    sections: [
      {
        heading: "PDF Resource",
        body: [record.summary],
      },
    ],
  };
}

export function policyUpdateToSummary(
  update: PolicyUpdate,
  source: PolicyUpdateSummary["source"] = "static",
  upload?: Pick<UploadedPolicyUpdateRecord, "uploadedAt" | "fileName">,
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
    uploadedAt: upload?.uploadedAt || null,
    fileName: upload?.fileName || null,
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
