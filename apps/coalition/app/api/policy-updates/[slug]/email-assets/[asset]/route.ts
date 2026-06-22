import { GetObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { getUploadedPolicyUpdateRecord } from "@/lib/admin/policy-update-uploads";
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

function referencedEmailAssetNames(upload: NonNullable<Awaited<ReturnType<typeof getUploadedPolicyUpdateRecord>>>) {
  const names = new Set<string>();
  for (const section of upload.sections) {
    for (const image of section.images || []) {
      const rawName = image.src.split("?")[0]?.split("/").filter(Boolean).pop();
      if (!rawName) continue;
      try {
        names.add(decodeURIComponent(rawName));
      } catch {
        names.add(rawName);
      }
    }
  }
  return names;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; asset: string }> },
) {
  const { slug, asset } = await params;
  if (!assetNamePattern.test(asset)) {
    return NextResponse.json({ error: "Unknown policy update email asset" }, { status: 404 });
  }

  const upload = await getUploadedPolicyUpdateRecord(slug);
  if (!upload || !referencedEmailAssetNames(upload).has(asset)) {
    return NextResponse.json({ error: "Unknown policy update email asset" }, { status: 404 });
  }

  try {
    const s3Object = await s3Client.send(
      new GetObjectCommand({
        Bucket: upload.s3Bucket,
        Key: assetObjectKey(upload.s3Key, asset),
      }),
    );

    if (!s3Object.Body) {
      return NextResponse.json({ error: "Policy update email asset is empty" }, { status: 404 });
    }

    const body =
      typeof (s3Object.Body as any).transformToWebStream === "function"
        ? (s3Object.Body as any).transformToWebStream()
        : (s3Object.Body as any);

    return new Response(body, {
      headers: {
        "Content-Type": contentTypeForAsset(asset),
        "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
      },
    });
  } catch (err: any) {
    if (err?.name === "NoSuchKey" || err?.$metadata?.httpStatusCode === 404) {
      return NextResponse.json({ error: "Unknown policy update email asset" }, { status: 404 });
    }
    throw err;
  }
}
