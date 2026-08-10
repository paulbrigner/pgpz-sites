import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createPublicFileAdminRouteHandlers } from "@pgpz/public-files/server";
import { NextRequest, NextResponse } from "next/server";
import { isFeatureEnabled } from "@/config/features";
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
import { s3Client } from "@/lib/s3";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const handlers = createPublicFileAdminRouteHandlers({
  jsonResponse: (body, init) => NextResponse.json(body, init),
  isFeatureEnabled,
  requireAdminSession,
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
  createUploadUrl: ({ bucket, key, contentType, expiresIn }) =>
    getSignedUrl(
      s3Client,
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
        ServerSideEncryption: "AES256",
      }),
      { expiresIn },
    ),
  deleteObject: ({ bucket, key }) =>
    s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })),
  headObject: ({ bucket, key }) =>
    s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: key })),
  getObject: ({ bucket, key, range }) =>
    s3Client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key, ...(range ? { Range: range } : {}) }),
    ),
});

export function GET() {
  return handlers.GET();
}

export function POST(request: NextRequest) {
  return handlers.POST(request);
}

export function PATCH(request: NextRequest) {
  return handlers.PATCH(request);
}
