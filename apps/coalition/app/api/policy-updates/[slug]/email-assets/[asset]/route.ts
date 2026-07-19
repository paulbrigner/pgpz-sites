import { GetObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import {
  getPolicyUpdateEmailAssetMaterialization,
  materializedPolicyUpdateEmailAssetKey,
} from "@/lib/admin/policy-update-email-assets";
import { getUploadedPolicyUpdateRecord } from "@/lib/admin/policy-update-uploads";
import { verifyPolicyUpdateEmailAsset } from "@/lib/email-link-security";
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string; asset: string }> },
) {
  const { slug, asset } = await params;
  if (!assetNamePattern.test(asset)) {
    return NextResponse.json({ error: "Unknown policy update email asset" }, { status: 404 });
  }

  const requestUrl = new URL(request.url);
  const requestedMaterializationId = requestUrl.searchParams.get("v")?.trim() || null;
  let publicEmailAsset = false;
  let materializationId = requestedMaterializationId;

  if (!materializationId) {
    const upload = await getUploadedPolicyUpdateRecord(slug);
    materializationId = upload?.publicEmailAssetMaterializationId || null;
    publicEmailAsset = !!materializationId;
  }
  if (!materializationId) {
    return NextResponse.json({ error: "Unknown policy update email asset" }, { status: 404 });
  }

  const materialization = await getPolicyUpdateEmailAssetMaterialization(materializationId);
  const objectKey = materialization
    ? materializedPolicyUpdateEmailAssetKey(materialization, asset)
    : null;
  if (
    !materialization ||
    materialization.slug !== slug ||
    !objectKey ||
    (publicEmailAsset && materialization.purpose !== "publish")
  ) {
    return NextResponse.json({ error: "Unknown policy update email asset" }, { status: 404 });
  }

  if (
    requestedMaterializationId &&
    !verifyPolicyUpdateEmailAsset({
      materializationId,
      slug,
      asset,
      signature: requestUrl.searchParams.get("sig"),
    })
  ) {
    return NextResponse.json({ error: "Unknown policy update email asset" }, { status: 404 });
  }

  try {
    const s3Object = await s3Client.send(
      new GetObjectCommand({
        Bucket: materialization.s3Bucket,
        Key: objectKey,
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
        "Cache-Control":
          publicEmailAsset
            ? "public, max-age=300, stale-while-revalidate=86400"
            : "private, no-store, max-age=0",
      },
    });
  } catch (err: any) {
    if (err?.name === "NoSuchKey" || err?.$metadata?.httpStatusCode === 404) {
      return NextResponse.json({ error: "Unknown policy update email asset" }, { status: 404 });
    }
    throw err;
  }
}
