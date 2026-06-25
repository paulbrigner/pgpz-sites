import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - nodemailer types not installed
import nodemailer from "nodemailer";
import { requireAdminSession } from "@/lib/admin/auth";
import { buildEmailServerConfig, isValidEmail, normalizeEmail } from "@/lib/admin/email-transport";
import {
  listPolicyUpdateSendHistory,
  recordEmailEvent,
  recordPolicyUpdateSendRun,
  summarizePolicyUpdateEmailStats,
} from "@/lib/admin/email-log";
import {
  createNewsletterTrackingRecord,
  markNewsletterTrackingSent,
} from "@/lib/admin/email-tracking";
import { listPolicyUpdateRecipients, type PolicyUpdateRecipient } from "@/lib/admin/roster";
import {
  findUserProfileByEmail,
  getUserProfileDisplayName,
} from "@/lib/admin/user-profile";
import { EMAIL_FROM, SITE_URL } from "@/lib/config";
import {
  createPolicyUpdateUploadSlug,
  deleteDraftUploadedPolicyUpdateRecord,
  formatPolicyUpdateDisplayDate,
  getDistributablePolicyUpdate,
  getDistributablePolicyUpdateSummaries,
  getPolicyUpdateUploadBucket,
  getUploadedPolicyUpdateRecord,
  normalizePolicyUpdateCategory,
  policyUpdateToSummary,
  policyUpdateUploadObjectKey,
  publishUploadedPolicyUpdate,
  saveGeneratedPolicyUpdateContent,
  savePolicyUpdateGenerationFailure,
  saveUploadedPolicyUpdate,
  unpublishUploadedPolicyUpdate,
  uploadedPolicyUpdateToPolicyUpdate,
} from "@/lib/admin/policy-update-uploads";
import { generatePolicyUpdatePageContent } from "@/lib/admin/policy-update-generation";
import { buildPolicyUpdateEmail } from "@/lib/policy-update-email";
import {
  buildPolicyUpdateForumMarkdown,
  policyUpdateMarkdownFileName,
} from "@/lib/policy-update-markdown";
import { s3Client } from "@/lib/s3";

export const dynamic = "force-dynamic";

const MAX_POLICY_UPDATE_UPLOAD_BYTES = 25 * 1024 * 1024;

async function requireAdminOrForbidden() {
  try {
    return { session: await requireAdminSession(), response: null };
  } catch {
    return {
      session: null,
      response: NextResponse.json({ error: "Admin access required" }, { status: 403 }),
    };
  }
}

const adminUserIdFromSession = (session: any) =>
  typeof session?.user?.id === "string" ? session.user.id : null;

type PolicyUpdateSendRecipient = Omit<PolicyUpdateRecipient, "id"> & {
  id: string | null;
};

type PolicyUpdateAudienceMode = "all_active_members" | "selected_members";

async function buildDraftRecipient(email: string): Promise<PolicyUpdateSendRecipient> {
  const profile = await findUserProfileByEmail(email);
  return {
    id: profile?.id || null,
    email,
    name: profile ? getUserProfileDisplayName(profile) : null,
    firstName: profile?.firstName || null,
    lastName: profile?.lastName || null,
  };
}

function normalizeRecipientIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean),
    ),
  );
}

const formText = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
};

const isUploadFile = (value: FormDataEntryValue | null): value is File =>
  !!value &&
  typeof value === "object" &&
  typeof (value as File).arrayBuffer === "function" &&
  typeof (value as File).name === "string";

const titleFromFileName = (fileName: string) =>
  fileName.replace(/\.pdf$/i, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();

const isPublishedDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const normalizeCustomSlug = (value: string) => {
  let input = value.trim();
  if (!input) return "";

  if (/^https?:\/\//i.test(input)) {
    try {
      input = new URL(input).pathname;
    } catch {
      // Fall back to plain text cleanup below.
    }
  }

  input = input.split(/[?#]/)[0] || "";
  try {
    input = decodeURIComponent(input);
  } catch {
    // Keep the raw input if it is not valid URI-encoded text.
  }

  input = input.replace(/^\/+|\/+$/g, "").replace(/^updates\//i, "");
  return input
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
};

const textFromBody = (body: any, name: string) =>
  typeof body?.[name] === "string" ? body[name].trim() : "";

const numberFromBody = (body: any, name: string) => {
  const value = Number(body?.[name]);
  return Number.isFinite(value) ? value : 0;
};

const uploadMetadataFromValues = ({
  categoryValue,
  publishedAtValue,
  titleValue,
  shortTitleValue,
  displayDateValue,
  summaryValue,
  emailSubjectValue,
  emailPreheaderValue,
  fileName,
}: {
  categoryValue: unknown;
  publishedAtValue: string;
  titleValue: string;
  shortTitleValue: string;
  displayDateValue: string;
  summaryValue: string;
  emailSubjectValue: string;
  emailPreheaderValue: string;
  fileName: string;
}) => {
  const category = normalizePolicyUpdateCategory(categoryValue);
  const publishedAt = isPublishedDate(publishedAtValue)
    ? publishedAtValue
    : new Date().toISOString().slice(0, 10);
  const title = titleValue || titleFromFileName(fileName) || "Policy Update";
  const shortTitle = shortTitleValue || title;
  const displayDate = displayDateValue || formatPolicyUpdateDisplayDate(category, publishedAt);
  return {
    category,
    publishedAt,
    title,
    shortTitle,
    displayDate,
    summary: summaryValue,
    emailSubject: emailSubjectValue,
    emailPreheader: emailPreheaderValue,
  };
};

const streamToBuffer = async (body: any) => {
  if (!body) return Buffer.alloc(0);
  if (typeof body.transformToByteArray === "function") {
    return Buffer.from(await body.transformToByteArray());
  }

  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

async function policyUpdateSlugExists(slug: string) {
  const normalized = slug.toLowerCase();
  const updates = await getDistributablePolicyUpdateSummaries();
  return updates.some((update) => update.slug.toLowerCase() === normalized);
}

async function resolvePolicyUpdateUploadSlug({
  requestedSlug,
  title,
  publishedAt,
}: {
  requestedSlug: string;
  title: string;
  publishedAt: string;
}) {
  const rawRequestedSlug = requestedSlug.trim();
  const customSlug = normalizeCustomSlug(rawRequestedSlug);
  if (rawRequestedSlug && !customSlug) {
    throw new Error("Enter a valid URL slug using letters, numbers, or hyphens.");
  }

  const slug =
    customSlug ||
    createPolicyUpdateUploadSlug({
      title,
      publishedAt,
    });

  if (await policyUpdateSlugExists(slug)) {
    throw new Error(`The URL slug "${slug}" is already in use.`);
  }

  return slug;
}

async function preparePolicyUpdateUpload(body: any) {
  const bucket = getPolicyUpdateUploadBucket();
  if (!bucket) {
    return NextResponse.json(
      { error: "Policy update upload bucket is not configured" },
      { status: 500 },
    );
  }

  const fileName = textFromBody(body, "fileName") || "policy-update.pdf";
  const contentType = textFromBody(body, "contentType") || "application/pdf";
  const fileSize = numberFromBody(body, "fileSize");
  const fileLooksLikePdf =
    fileName.toLowerCase().endsWith(".pdf") || contentType === "application/pdf";
  if (!fileLooksLikePdf) {
    return NextResponse.json({ error: "Only PDF uploads are allowed" }, { status: 400 });
  }
  if (!fileSize || fileSize > MAX_POLICY_UPDATE_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "PDF upload must be 25 MB or smaller" },
      { status: 400 },
    );
  }

  const metadata = uploadMetadataFromValues({
    categoryValue: body?.category,
    publishedAtValue: textFromBody(body, "publishedAt"),
    titleValue: textFromBody(body, "title"),
    shortTitleValue: textFromBody(body, "shortTitle"),
    displayDateValue: textFromBody(body, "displayDate"),
    summaryValue: textFromBody(body, "summary"),
    emailSubjectValue: textFromBody(body, "emailSubject"),
    emailPreheaderValue: textFromBody(body, "emailPreheader"),
    fileName,
  });
  let slug;
  try {
    slug = await resolvePolicyUpdateUploadSlug({
      requestedSlug: textFromBody(body, "urlSlug") || textFromBody(body, "slug"),
      title: metadata.title,
      publishedAt: metadata.publishedAt,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Invalid policy update URL slug" },
      { status: 400 },
    );
  }
  const s3Key = policyUpdateUploadObjectKey(slug);
  const uploadHeaders = {
    "Content-Type": "application/pdf",
    "x-amz-server-side-encryption": "AES256",
  };
  const uploadUrl = await getSignedUrl(
    s3Client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      ContentType: "application/pdf",
      ServerSideEncryption: "AES256",
    }),
    { expiresIn: 600 },
  );

  return NextResponse.json({
    ok: true,
    upload: {
      slug,
      s3Key,
      uploadUrl,
      headers: uploadHeaders,
    },
    metadata: {
      ...metadata,
      fileName,
      fileSize,
      contentType: "application/pdf",
    },
  });
}

async function completePolicyUpdateUpload(body: any, adminUserId: string | null) {
  const bucket = getPolicyUpdateUploadBucket();
  if (!bucket) {
    return NextResponse.json(
      { error: "Policy update upload bucket is not configured" },
      { status: 500 },
    );
  }

  const slug = textFromBody(body, "slug");
  const s3Key = textFromBody(body, "s3Key");
  const fileName = textFromBody(body, "fileName") || "policy-update.pdf";
  if (!slug || !s3Key || s3Key !== policyUpdateUploadObjectKey(slug)) {
    return NextResponse.json({ error: "Invalid upload completion request" }, { status: 400 });
  }
  if (await policyUpdateSlugExists(slug)) {
    return NextResponse.json(
      { error: `The URL slug "${slug}" is already in use.` },
      { status: 400 },
    );
  }

  let head;
  try {
    head = await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: s3Key }));
  } catch {
    return NextResponse.json({ error: "Uploaded PDF was not found in storage" }, { status: 400 });
  }

  const fileSize = Number(head.ContentLength || 0);
  if (!fileSize || fileSize > MAX_POLICY_UPDATE_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "PDF upload must be 25 MB or smaller" },
      { status: 400 },
    );
  }

  const objectStart = await s3Client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      Range: "bytes=0-4",
    }),
  );
  const signature = await streamToBuffer(objectStart.Body);
  if (signature.toString("ascii") !== "%PDF-") {
    return NextResponse.json({ error: "Uploaded file is not a valid PDF" }, { status: 400 });
  }

  const metadata = uploadMetadataFromValues({
    categoryValue: body?.category,
    publishedAtValue: textFromBody(body, "publishedAt"),
    titleValue: textFromBody(body, "title"),
    shortTitleValue: textFromBody(body, "shortTitle"),
    displayDateValue: textFromBody(body, "displayDate"),
    summaryValue: textFromBody(body, "summary"),
    emailSubjectValue: textFromBody(body, "emailSubject"),
    emailPreheaderValue: textFromBody(body, "emailPreheader"),
    fileName,
  });
  const uploadedAt = new Date().toISOString();
  const upload = await saveUploadedPolicyUpdate({
    slug,
    ...metadata,
    fileName,
    fileSize,
    contentType: "application/pdf",
    s3Bucket: bucket,
    s3Key,
    uploadedAt,
    uploadedBy: adminUserId,
  });

  const update = await getDistributablePolicyUpdate(upload.slug);
  return NextResponse.json({
    ok: true,
    update: update ? policyUpdateToSummary(update, "uploaded", upload) : null,
  });
}

async function handlePolicyUpdateUpload(request: NextRequest) {
  const bucket = getPolicyUpdateUploadBucket();
  if (!bucket) {
    return NextResponse.json(
      { error: "Policy update upload bucket is not configured" },
      { status: 500 },
    );
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!isUploadFile(file)) {
    return NextResponse.json({ error: "Choose a PDF file to upload" }, { status: 400 });
  }

  const fileName = file.name || "policy-update.pdf";
  const fileLooksLikePdf =
    fileName.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";
  if (!fileLooksLikePdf) {
    return NextResponse.json({ error: "Only PDF uploads are allowed" }, { status: 400 });
  }
  if (file.size > MAX_POLICY_UPDATE_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "PDF upload must be 25 MB or smaller" },
      { status: 400 },
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
    return NextResponse.json({ error: "Uploaded file is not a valid PDF" }, { status: 400 });
  }

  const category = normalizePolicyUpdateCategory(formText(form, "category"));
  const metadata = uploadMetadataFromValues({
    categoryValue: category,
    publishedAtValue: formText(form, "publishedAt"),
    titleValue: formText(form, "title"),
    shortTitleValue: formText(form, "shortTitle"),
    displayDateValue: formText(form, "displayDate"),
    summaryValue: formText(form, "summary"),
    emailSubjectValue: formText(form, "emailSubject"),
    emailPreheaderValue: formText(form, "emailPreheader"),
    fileName,
  });
  const uploadedAt = new Date().toISOString();
  let slug;
  try {
    slug = await resolvePolicyUpdateUploadSlug({
      requestedSlug: formText(form, "urlSlug") || formText(form, "slug"),
      title: metadata.title,
      publishedAt: metadata.publishedAt,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Invalid policy update URL slug" },
      { status: 400 },
    );
  }
  const s3Key = policyUpdateUploadObjectKey(slug);

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      Body: bytes,
      ContentType: "application/pdf",
      ServerSideEncryption: "AES256",
    }),
  );

  const upload = await saveUploadedPolicyUpdate({
    slug,
    ...metadata,
    fileName,
    fileSize: bytes.length,
    contentType: "application/pdf",
    s3Bucket: bucket,
    s3Key,
    uploadedAt,
    uploadedBy: null,
  });

  const update = await getDistributablePolicyUpdate(upload.slug);
  return NextResponse.json({
    ok: true,
    update: update ? policyUpdateToSummary(update, "uploaded", upload) : null,
  });
}

async function generateUploadedPolicyUpdateContent(body: any, adminUserId: string | null) {
  const slug = textFromBody(body, "slug");
  if (!slug) {
    return NextResponse.json({ error: "Choose an uploaded update" }, { status: 400 });
  }

  const record = await getUploadedPolicyUpdateRecord(slug);
  if (!record) {
    return NextResponse.json({ error: "Unknown uploaded policy update" }, { status: 404 });
  }

  try {
    const object = await s3Client.send(
      new GetObjectCommand({
        Bucket: record.s3Bucket,
        Key: record.s3Key,
      }),
    );
    const bytes = await streamToBuffer(object.Body);
    if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw new Error("Stored upload is not a valid PDF.");
    }

    const generated = await generatePolicyUpdatePageContent(record, bytes);
    const updated = await saveGeneratedPolicyUpdateContent({
      slug: record.slug,
      title: generated.title,
      shortTitle: generated.shortTitle,
      coverImage: generated.coverImage,
      summary: generated.summary,
      emailSubject: generated.emailSubject,
      emailPreheader: generated.emailPreheader,
      keyTakeaways: generated.keyTakeaways,
      actionItems: generated.actionItems,
      sections: generated.sections,
      generatedBy: adminUserId,
      generatedModel: generated.generatedModel,
      sourceTextLength: generated.sourceTextLength,
      sourceTextSha256: generated.sourceTextSha256,
    });
    if (!updated) {
      return NextResponse.json({ error: "Unknown uploaded policy update" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      update: policyUpdateToSummary(uploadedPolicyUpdateToPolicyUpdate(updated), "uploaded", updated),
    });
  } catch (err: any) {
    const message = typeof err?.message === "string" ? err.message : "Failed to generate policy update content.";
    const failed = await savePolicyUpdateGenerationFailure({
      slug: record.slug,
      error: message,
      generatedBy: adminUserId,
      generatedModel: "pdf-source-exact",
    }).catch(() => null);

    return NextResponse.json(
      {
        error: message,
        update: failed
          ? policyUpdateToSummary(uploadedPolicyUpdateToPolicyUpdate(failed), "uploaded", failed)
          : null,
      },
      { status: 500 },
    );
  }
}

function policyUpdateAssetPrefix(s3Key: string) {
  return s3Key.replace(/\.pdf$/i, "/assets/");
}

async function deletePolicyUpdateUploadObjects(record: NonNullable<Awaited<ReturnType<typeof getUploadedPolicyUpdateRecord>>>) {
  const keys = new Set<string>([record.s3Key]);
  const prefix = policyUpdateAssetPrefix(record.s3Key);
  let ContinuationToken: string | undefined;

  do {
    const listed = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: record.s3Bucket,
        Prefix: prefix,
        ContinuationToken,
      }),
    );
    for (const item of listed.Contents || []) {
      if (item.Key) keys.add(item.Key);
    }
    ContinuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (ContinuationToken);

  for (const key of keys) {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: record.s3Bucket,
        Key: key,
      }),
    );
  }
}

async function deleteDraftPolicyUpdate(body: any) {
  const slug = textFromBody(body, "slug");
  if (!slug) {
    return NextResponse.json({ error: "Choose a draft update to delete" }, { status: 400 });
  }

  const record = await getUploadedPolicyUpdateRecord(slug);
  if (!record) {
    return NextResponse.json({ error: "Unknown uploaded policy update" }, { status: 404 });
  }
  if (record.visibilityStatus !== "draft") {
    return NextResponse.json(
      { error: "Only draft updates can be deleted before publishing." },
      { status: 400 },
    );
  }

  await deletePolicyUpdateUploadObjects(record);
  const deleted = await deleteDraftUploadedPolicyUpdateRecord(record.slug);
  if (!deleted) {
    return NextResponse.json({ error: "Unknown uploaded policy update" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    slug: deleted.slug,
    title: deleted.title,
  });
}

async function resolvePolicyUpdateAudience(body: any) {
  const audienceMode: PolicyUpdateAudienceMode =
    body?.audienceMode === "selected_members" ? "selected_members" : "all_active_members";
  const allRecipients = await listPolicyUpdateRecipients();

  if (audienceMode === "all_active_members") {
    return { audienceMode, recipients: allRecipients, activeRecipientCount: allRecipients.length };
  }

  const recipientIds = normalizeRecipientIds(body?.recipientIds);
  if (!recipientIds.length) {
    throw new Error("Select at least one active member recipient.");
  }

  const selectedIds = new Set(recipientIds);
  const recipients = allRecipients.filter((recipient) => selectedIds.has(recipient.id));
  if (recipients.length !== selectedIds.size) {
    throw new Error("Selected recipients must be active members with unsuppressed email addresses.");
  }

  return { audienceMode, recipients, activeRecipientCount: allRecipients.length };
}

async function exportPolicyUpdateMarkdown(body: any) {
  const slug = textFromBody(body, "slug");
  if (!slug) {
    return NextResponse.json({ error: "Choose a policy update to export" }, { status: 400 });
  }

  const update = await getDistributablePolicyUpdate(slug);
  if (!update) {
    return NextResponse.json({ error: "Unknown policy update" }, { status: 404 });
  }

  const markdown = buildPolicyUpdateForumMarkdown(update, {
    siteUrl: SITE_URL,
    greeting: textFromBody(body, "greeting") || "Hi everyone,",
  });

  return NextResponse.json({
    ok: true,
    slug: update.slug,
    title: update.title,
    fileName: policyUpdateMarkdownFileName(update),
    markdown,
  });
}

export async function GET() {
  const admin = await requireAdminOrForbidden();
  if (admin.response) return admin.response;

  const recipients = await listPolicyUpdateRecipients();
  const updates = await getDistributablePolicyUpdateSummaries();
  const [statsBySlug, sendHistory] = await Promise.all([
    summarizePolicyUpdateEmailStats(updates.map((update) => update.slug)),
    listPolicyUpdateSendHistory(updates),
  ]);
  return NextResponse.json({
    updates,
    recipientCount: recipients.length,
    recipients,
    statsBySlug,
    sendHistory,
  });
}
export async function POST(request: NextRequest) {
  const admin = await requireAdminOrForbidden();
  if (admin.response) return admin.response;
  const adminUserId = adminUserIdFromSession(admin.session);

  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    return handlePolicyUpdateUpload(request);
  }

  let body: any = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body?.action === "prepareUpload") {
    return preparePolicyUpdateUpload(body);
  }
  if (body?.action === "completeUpload") {
    return completePolicyUpdateUpload(body, adminUserId);
  }
  if (body?.action === "generateContent") {
    return generateUploadedPolicyUpdateContent(body, adminUserId);
  }
  if (body?.action === "exportMarkdown") {
    return exportPolicyUpdateMarkdown(body);
  }
  if (body?.action === "deleteDraftUpdate") {
    return deleteDraftPolicyUpdate(body);
  }
  if (body?.action === "publishUpdate" || body?.action === "unpublishUpdate") {
    const slug = textFromBody(body, "slug");
    if (!slug) {
      return NextResponse.json({ error: "Choose an uploaded update" }, { status: 400 });
    }
    const upload =
      body.action === "publishUpdate"
        ? await publishUploadedPolicyUpdate(slug, adminUserId)
        : await unpublishUploadedPolicyUpdate(slug, adminUserId);
    if (!upload) {
      return NextResponse.json({ error: "Unknown uploaded policy update" }, { status: 404 });
    }
    const update = uploadedPolicyUpdateToPolicyUpdate(upload);
    return NextResponse.json({
      ok: true,
      update: policyUpdateToSummary(update, "uploaded", upload),
    });
  }

  const transportConfig = buildEmailServerConfig();
  if (!transportConfig || !EMAIL_FROM) {
    return NextResponse.json({ error: "Email provider not configured" }, { status: 500 });
  }

  const slug = typeof body?.slug === "string" ? body.slug.trim() : "";
  const draftRecipientEmail = normalizeEmail(body?.draftRecipientEmail || body?.testRecipientEmail);
  const confirmSend = body?.confirmSend === true;
  if (!confirmSend) {
    return NextResponse.json({ error: "confirmSend must be true before sending member email" }, { status: 400 });
  }
  if (draftRecipientEmail && !isValidEmail(draftRecipientEmail)) {
    return NextResponse.json({ error: "Enter a valid draft recipient email" }, { status: 400 });
  }

  const update = await getDistributablePolicyUpdate(slug);
  if (!update) {
    return NextResponse.json({ error: "Unknown policy update" }, { status: 404 });
  }

  const draftMode = !!draftRecipientEmail;
  const uploadedRecord = await getUploadedPolicyUpdateRecord(slug);
  if (!draftMode && uploadedRecord && uploadedRecord.visibilityStatus !== "published") {
    return NextResponse.json(
      { error: "Publish this update before sending it to subscribers." },
      { status: 400 },
    );
  }
  let audienceMode: PolicyUpdateAudienceMode = "all_active_members";
  let activeRecipientCount = 0;
  let recipients: PolicyUpdateSendRecipient[];
  if (draftMode) {
    recipients = [await buildDraftRecipient(draftRecipientEmail)];
  } else {
    try {
      const resolvedAudience = await resolvePolicyUpdateAudience(body);
      audienceMode = resolvedAudience.audienceMode;
      activeRecipientCount = resolvedAudience.activeRecipientCount;
      recipients = resolvedAudience.recipients;
    } catch (err: any) {
      return NextResponse.json(
        { error: typeof err?.message === "string" ? err.message : "Invalid policy update audience" },
        { status: 400 },
      );
    }
  }
  if (!recipients.length) {
    return NextResponse.json({ error: "No active member recipients with unsuppressed email addresses" }, { status: 400 });
  }

  const transporter = nodemailer.createTransport(transportConfig);
  const emailType = `policy_update_${update.category}${draftMode ? "_draft" : ""}`;
  const policyUpdateSendRunId = draftMode ? null : randomUUID();
  const failures: Array<{ email: string; error: string }> = [];
  let sent = 0;

  for (const recipient of recipients) {
    const tracking = !draftMode
      ? await createNewsletterTrackingRecord({
          newsletterId: update.slug,
          sendRunId: policyUpdateSendRunId,
          messageType: "policy_update",
          audienceMode,
          userId: recipient.id,
          email: recipient.email,
        })
      : null;
    const built = buildPolicyUpdateEmail(
      update,
      {
        email: recipient.email,
        name: recipient.name,
        firstName: recipient.firstName,
        lastName: recipient.lastName,
      },
      SITE_URL,
      tracking
        ? {
            trackingId: tracking.trackingId,
            trackLinks: true,
            includeOpenPixel: true,
            includeUnsubscribe: true,
          }
        : undefined,
    );
    try {
      const sendResult = await transporter.sendMail({
        to: recipient.email,
        from: EMAIL_FROM,
        subject: built.subject,
        text: built.text,
        html: built.html,
      });
      if (tracking) {
        await markNewsletterTrackingSent({
          trackingId: tracking.trackingId,
          providerMessageId: sendResult?.messageId ? String(sendResult.messageId) : null,
        });
      }
      sent += 1;
      await recordEmailEvent({
        userId: recipient.id,
        email: recipient.email,
        type: emailType,
        subject: built.subject,
        status: "sent",
        providerMessageId: sendResult?.messageId ? String(sendResult.messageId) : null,
        metadata: {
          updateSlug: update.slug,
          category: update.category,
          policyUpdateSendRunId,
          trackingId: tracking?.trackingId || null,
          audienceMode: draftMode ? "draft" : audienceMode,
          portalUrl: built.portalUrl,
          draft: draftMode,
          profileNameResolved: !!recipient.name,
        },
      });
    } catch (err: any) {
      const error = typeof err?.message === "string" ? err.message : "Failed to send policy update";
      failures.push({ email: recipient.email, error });
      await recordEmailEvent({
        userId: recipient.id,
        email: recipient.email,
        type: emailType,
        subject: update.emailSubject,
        status: "failed",
        error,
        metadata: {
          updateSlug: update.slug,
          category: update.category,
          policyUpdateSendRunId,
          trackingId: tracking?.trackingId || null,
          audienceMode: draftMode ? "draft" : audienceMode,
          draft: draftMode,
          profileNameResolved: !!recipient.name,
        },
      }).catch(() => undefined);
    }
  }

  if (!draftMode && policyUpdateSendRunId) {
    await recordPolicyUpdateSendRun({
      sendRunId: policyUpdateSendRunId,
      update,
      recipientCount: recipients.length,
      sentCount: sent,
      failedCount: failures.length,
      failurePreview: failures,
      audienceMode,
    });
  }

  return NextResponse.json({
    ok: failures.length === 0,
    slug: update.slug,
    sendRunId: policyUpdateSendRunId,
    title: update.title,
    draft: draftMode,
    recipientEmail: draftRecipientEmail || null,
    resolvedRecipientName: draftMode ? recipients[0]?.firstName || null : null,
    audienceMode: draftMode ? "draft" : audienceMode,
    activeRecipientCount,
    recipientCount: recipients.length,
    sent,
    failed: failures.length,
    failures: failures.slice(0, 10),
  });
}
