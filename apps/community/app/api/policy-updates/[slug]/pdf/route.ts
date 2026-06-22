import { GetObjectCommand } from "@aws-sdk/client-s3";
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { documentClient, TABLE_NAME } from "@/lib/dynamodb";
import { NEXTAUTH_SECRET } from "@/lib/config";
import { getUploadedPolicyUpdateRecord } from "@/lib/admin/policy-update-uploads";
import { s3Client } from "@/lib/s3";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function contentDispositionFileName(fileName: string) {
  return fileName.replace(/["\\\r\n]/g, "_") || "policy-update.pdf";
}

async function hasPolicyUpdatePdfAccess(request: NextRequest) {
  const token = await getToken({ req: request as any, secret: NEXTAUTH_SECRET });
  const userId = typeof token?.sub === "string" ? token.sub : "";
  if (!userId) return { allowed: false, isAdmin: false };

  const user = await documentClient.get({
    TableName: TABLE_NAME,
    Key: { pk: `USER#${userId}`, sk: `USER#${userId}` },
    ProjectionExpression: "membershipStatus, isAdmin",
  });

  const isAdmin = user.Item?.isAdmin === true;
  return {
    allowed: user.Item?.membershipStatus === "active" || isAdmin,
    isAdmin,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const access = await hasPolicyUpdatePdfAccess(request);
  if (!access.allowed) {
    return NextResponse.json({ error: "Membership required" }, { status: 403 });
  }

  const { slug } = await params;
  const upload = await getUploadedPolicyUpdateRecord(slug);
  if (!upload) {
    return NextResponse.json({ error: "Unknown policy update PDF" }, { status: 404 });
  }
  if (upload.visibilityStatus !== "published" && !access.isAdmin) {
    return NextResponse.json({ error: "Unknown policy update PDF" }, { status: 404 });
  }

  const s3Object = await s3Client.send(
    new GetObjectCommand({
      Bucket: upload.s3Bucket,
      Key: upload.s3Key,
    }),
  );

  if (!s3Object.Body) {
    return NextResponse.json({ error: "PDF object is empty" }, { status: 404 });
  }

  const body =
    typeof (s3Object.Body as any).transformToWebStream === "function"
      ? (s3Object.Body as any).transformToWebStream()
      : (s3Object.Body as any);

  return new Response(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${contentDispositionFileName(upload.fileName)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
