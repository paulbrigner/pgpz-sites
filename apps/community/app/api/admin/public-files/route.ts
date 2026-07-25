import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin/auth";
import {
  createPublicFileVersionId,
  getPublicFileRecord,
  getPublicFilesBucket,
  listPublicFileRecords,
  publicFileObjectKey,
  publicFileRecordToItem,
  restorePreviousPublicFileVersion,
  savePublicFileUpload,
  setPublicFileArchived,
  updatePublicFileMetadata,
} from "@/lib/admin/public-files";
import {
  MAX_PUBLIC_FILE_BYTES,
  normalizePublicFilePath,
  normalizePublicFileAccess,
  publicFileContentType,
  publicFileExtension,
  publicFileTitleFromPath,
  PublicFileValidationError,
} from "@/lib/public-files";
import { s3Client } from "@/lib/s3";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

const bodyText = (body: any, key: string) =>
  typeof body?.[key] === "string" ? body[key].trim() : "";

const safeOriginalFileName = (value: string, fallback: string) => {
  const baseName = value.replace(/\\/g, "/").split("/").pop()?.trim() || fallback;
  return baseName.slice(0, 255);
};

const safePublicPath = (
  value: string,
):
  | { path: string; response: null }
  | { path: null; response: NextResponse } => {
  try {
    return { path: normalizePublicFilePath(value), response: null };
  } catch (error) {
    const message =
      error instanceof PublicFileValidationError ? error.message : "Enter a valid public path.";
    return {
      path: null,
      response: NextResponse.json({ error: message }, { status: 400 }),
    };
  }
};

const cleanEtag = (value: string | undefined) => value?.replace(/^"|"$/g, "") || null;
const isConditionalWriteConflict = (error: unknown) =>
  (error as { name?: unknown } | null)?.name === "ConditionalCheckFailedException";

const conflictResponse = () =>
  NextResponse.json(
    { error: "This public file changed. Refresh the library and try again." },
    { status: 409 },
  );

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

const publicFileSignatureMatches = (path: string, bytes: Buffer) => {
  const extension = publicFileExtension(path);
  if (extension === ".pdf") return bytes.subarray(0, 5).toString("ascii") === "%PDF-";
  if (extension === ".png") {
    return bytes.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  }
  if (extension === ".jpg" || extension === ".jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (extension === ".webp") {
    return (
      bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
      bytes.subarray(8, 12).toString("ascii") === "WEBP"
    );
  }
  if ([".docx", ".xlsx", ".pptx", ".zip"].includes(extension)) {
    if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return false;
    return (
      (bytes[2] === 0x03 && bytes[3] === 0x04) ||
      (bytes[2] === 0x05 && bytes[3] === 0x06) ||
      (bytes[2] === 0x07 && bytes[3] === 0x08)
    );
  }
  if (extension === ".csv" || extension === ".txt") {
    return !bytes.includes(0);
  }
  return false;
};

const removeRejectedUpload = async (bucket: string, key: string) => {
  try {
    await s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch {
    // Best-effort cleanup; the versioned key is not addressable without metadata.
  }
};

export async function GET() {
  const auth = await requireAdminOrForbidden();
  if (auth.response) return auth.response;

  const records = await listPublicFileRecords();
  return NextResponse.json({
    files: records.map(publicFileRecordToItem),
  });
}

async function prepareUpload(body: any) {
  const bucket = getPublicFilesBucket();
  if (!bucket) {
    return NextResponse.json(
      { error: "Public file storage is not configured" },
      { status: 500 },
    );
  }

  const normalized = safePublicPath(bodyText(body, "path"));
  if (normalized.path === null) return normalized.response;
  const path = normalized.path;
  const originalFileName = safeOriginalFileName(
    bodyText(body, "fileName"),
    path.split("/").pop() || "download",
  );
  const fileSize = Number(body?.fileSize);
  const replace = body?.replace === true;
  const contentType = publicFileContentType(path);

  if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_PUBLIC_FILE_BYTES) {
    return NextResponse.json(
      { error: "Public files must be larger than zero bytes and no larger than 50 MB." },
      { status: 400 },
    );
  }
  if (
    !contentType ||
    publicFileExtension(originalFileName) !== publicFileExtension(path)
  ) {
    return NextResponse.json(
      { error: "The selected file type must match the public path extension." },
      { status: 400 },
    );
  }

  const existing = await getPublicFileRecord(path, { includeArchived: true });
  if (existing && !replace) {
    return NextResponse.json(
      {
        error: `A public file already uses /resources/${path}. Use Replace on the existing file.`,
      },
      { status: 409 },
    );
  }

  const versionId = createPublicFileVersionId();
  const s3Key = publicFileObjectKey(path, versionId);
  const uploadHeaders = {
    "Content-Type": contentType,
    "x-amz-server-side-encryption": "AES256",
  };
  const uploadUrl = await getSignedUrl(
    s3Client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      ContentType: contentType,
      ServerSideEncryption: "AES256",
    }),
    { expiresIn: 600 },
  );

  return NextResponse.json({
    ok: true,
    upload: {
      path,
      versionId,
      s3Key,
      uploadUrl,
      headers: uploadHeaders,
    },
  });
}

async function completeUpload(body: any, adminUserId: string | null) {
  const bucket = getPublicFilesBucket();
  if (!bucket) {
    return NextResponse.json(
      { error: "Public file storage is not configured" },
      { status: 500 },
    );
  }

  const normalized = safePublicPath(bodyText(body, "path"));
  if (normalized.path === null) return normalized.response;
  const path = normalized.path;
  const versionId = bodyText(body, "versionId");
  const s3Key = bodyText(body, "s3Key");
  const expectedKey = versionId ? publicFileObjectKey(path, versionId) : "";
  const replace = body?.replace === true;
  if (!versionId || !s3Key || s3Key !== expectedKey) {
    return NextResponse.json({ error: "Invalid upload completion request" }, { status: 400 });
  }

  const existing = await getPublicFileRecord(path, { includeArchived: true });
  if (existing && !replace) {
    await removeRejectedUpload(bucket, s3Key);
    return NextResponse.json(
      { error: `A public file already uses /resources/${path}.` },
      { status: 409 },
    );
  }

  let head;
  try {
    head = await s3Client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: s3Key,
      }),
    );
  } catch {
    return NextResponse.json(
      { error: "The uploaded file was not found in storage." },
      { status: 400 },
    );
  }

  const fileSize = Number(head.ContentLength || 0);
  const contentType = publicFileContentType(path);
  const originalFileName = safeOriginalFileName(
    bodyText(body, "fileName"),
    path.split("/").pop() || "download",
  );
  if (
    !fileSize ||
    fileSize > MAX_PUBLIC_FILE_BYTES ||
    !contentType ||
    head.ContentType !== contentType ||
    publicFileExtension(originalFileName) !== publicFileExtension(path)
  ) {
    await removeRejectedUpload(bucket, s3Key);
    return NextResponse.json(
      { error: "The uploaded file did not pass the public-file size or type checks." },
      { status: 400 },
    );
  }

  let signatureBytes;
  try {
    const signatureObject = await s3Client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: s3Key,
        Range: "bytes=0-511",
      }),
    );
    signatureBytes = await streamToBuffer(signatureObject.Body);
  } catch {
    await removeRejectedUpload(bucket, s3Key);
    return NextResponse.json(
      { error: "The uploaded file could not be validated in storage." },
      { status: 400 },
    );
  }
  if (!publicFileSignatureMatches(path, signatureBytes)) {
    await removeRejectedUpload(bucket, s3Key);
    return NextResponse.json(
      { error: "The uploaded file contents do not match its public file type." },
      { status: 400 },
    );
  }

  let record;
  try {
    record = await savePublicFileUpload({
      path,
      title: bodyText(body, "title") || existing?.title || publicFileTitleFromPath(path),
      description:
        typeof body?.description === "string"
          ? body.description.trim()
          : existing?.description || "",
      originalFileName,
      contentType,
      fileSize,
      access: normalizePublicFileAccess(body?.access ?? existing?.access),
      versionId,
      s3Bucket: bucket,
      s3Key,
      etag: cleanEtag(head.ETag),
      adminUserId,
    });
  } catch (error: any) {
    await removeRejectedUpload(bucket, s3Key);
    if (isConditionalWriteConflict(error)) return conflictResponse();
    throw error;
  }
  return NextResponse.json({ ok: true, file: publicFileRecordToItem(record) });
}

async function handleAction(body: any, adminUserId: string | null) {
  switch (body?.action) {
    case "prepareUpload":
      return prepareUpload(body);
    case "completeUpload":
      return completeUpload(body, adminUserId);
    case "archive":
    case "restore": {
      const normalized = safePublicPath(bodyText(body, "path"));
      if (normalized.path === null) return normalized.response;
      const record = await setPublicFileArchived({
        path: normalized.path,
        archived: body.action === "archive",
        adminUserId,
      });
      if (!record) {
        return NextResponse.json({ error: "Unknown public file" }, { status: 404 });
      }
      return NextResponse.json({ ok: true, file: publicFileRecordToItem(record) });
    }
    case "restorePreviousVersion": {
      const normalized = safePublicPath(bodyText(body, "path"));
      if (normalized.path === null) return normalized.response;
      const record = await restorePreviousPublicFileVersion({
        path: normalized.path,
        adminUserId,
      });
      if (!record) {
        return NextResponse.json(
          { error: "No previous version is available for this public file." },
          { status: 404 },
        );
      }
      return NextResponse.json({ ok: true, file: publicFileRecordToItem(record) });
    }
    default:
      return NextResponse.json({ error: "Unknown public file action" }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminOrForbidden();
  if (auth.response) return auth.response;
  const body = await request.json().catch(() => ({}));
  try {
    return await handleAction(body, adminUserIdFromSession(auth.session));
  } catch (error) {
    if (isConditionalWriteConflict(error)) return conflictResponse();
    throw error;
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdminOrForbidden();
  if (auth.response) return auth.response;
  const body = await request.json().catch(() => ({}));
  const normalized = safePublicPath(bodyText(body, "path"));
  if (normalized.path === null) return normalized.response;
  const existing = await getPublicFileRecord(normalized.path, {
    includeArchived: true,
  });
  if (!existing) {
    return NextResponse.json({ error: "Unknown public file" }, { status: 404 });
  }
  let record;
  try {
    record = await updatePublicFileMetadata({
      path: normalized.path,
      title: bodyText(body, "title"),
      description: bodyText(body, "description"),
      access: normalizePublicFileAccess(body?.access ?? existing.access),
      adminUserId: adminUserIdFromSession(auth.session),
    });
  } catch (error) {
    if (isConditionalWriteConflict(error)) return conflictResponse();
    throw error;
  }
  if (!record) {
    return NextResponse.json({ error: "Unknown public file" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, file: publicFileRecordToItem(record) });
}
