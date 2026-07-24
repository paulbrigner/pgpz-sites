import { GetObjectCommand } from "@aws-sdk/client-s3";
import { NextRequest, NextResponse } from "next/server";
import { getUploadedPolicyUpdateRecord } from "@/lib/admin/policy-update-uploads";
import { hasPolicyUpdateResourceAccess } from "@/lib/policy-update-access";
import { s3Client } from "@/lib/s3";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function contentDispositionFileName(fileName: string) {
  return fileName.replace(/["\\\r\n]/g, "_") || "policy-update.pdf";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const access = await hasPolicyUpdateResourceAccess(request);
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
  // Keep the last successful artifact available when a later regeneration fails.
  if (!upload.pdfS3Key) {
    return NextResponse.json({ error: "Policy update PDF has not been generated" }, { status: 404 });
  }

  const s3Object = await s3Client.send(
    new GetObjectCommand({
      Bucket: upload.s3Bucket,
      Key: upload.pdfS3Key,
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
      "Content-Disposition": `inline; filename="${contentDispositionFileName(upload.pdfFileName || `${upload.slug}.pdf`)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
