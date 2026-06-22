import { GetObjectCommand } from "@aws-sdk/client-s3";
import { NextRequest, NextResponse } from "next/server";
import { getUploadedPolicyUpdateRecord } from "@/lib/admin/policy-update-uploads";
import { hasPolicyUpdateResourceAccess } from "@/lib/policy-update-access";
import { s3Client } from "@/lib/s3";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const assetNamePattern = /^[a-z0-9][a-z0-9._-]+\.(?:png|jpe?g|webp)$/i;

function contentTypeForAsset(asset: string) {
  const lower = asset.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/png";
}

function assetObjectKey(pdfObjectKey: string, asset: string) {
  return pdfObjectKey.replace(/\.pdf$/i, `/assets/${asset}`);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; asset: string }> },
) {
  const access = await hasPolicyUpdateResourceAccess(request);
  if (!access.allowed) {
    return NextResponse.json({ error: "Membership required" }, { status: 403 });
  }

  const { slug, asset } = await params;
  if (!assetNamePattern.test(asset)) {
    return NextResponse.json({ error: "Unknown policy update asset" }, { status: 404 });
  }

  const upload = await getUploadedPolicyUpdateRecord(slug);
  if (!upload) {
    return NextResponse.json({ error: "Unknown policy update asset" }, { status: 404 });
  }
  if (upload.visibilityStatus !== "published" && !access.isAdmin) {
    return NextResponse.json({ error: "Unknown policy update asset" }, { status: 404 });
  }

  try {
    const s3Object = await s3Client.send(
      new GetObjectCommand({
        Bucket: upload.s3Bucket,
        Key: assetObjectKey(upload.s3Key, asset),
      }),
    );

    if (!s3Object.Body) {
      return NextResponse.json({ error: "Policy update asset is empty" }, { status: 404 });
    }

    const body =
      typeof (s3Object.Body as any).transformToWebStream === "function"
        ? (s3Object.Body as any).transformToWebStream()
        : (s3Object.Body as any);

    return new Response(body, {
      headers: {
        "Content-Type": contentTypeForAsset(asset),
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err: any) {
    if (err?.name === "NoSuchKey" || err?.$metadata?.httpStatusCode === 404) {
      return NextResponse.json({ error: "Unknown policy update asset" }, { status: 404 });
    }
    throw err;
  }
}
