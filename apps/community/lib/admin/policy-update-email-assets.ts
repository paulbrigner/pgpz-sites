import "server-only";

import { randomUUID } from "crypto";
import { CopyObjectCommand } from "@aws-sdk/client-s3";
import { documentClient, TABLE_NAME } from "@/lib/dynamodb";
import type { UploadedPolicyUpdateRecord } from "@/lib/admin/policy-update-uploads";
import { s3Client } from "@/lib/s3";

const assetNamePattern = /^[a-z0-9][a-z0-9._-]+\.(?:png|jpe?g|webp)$/i;

export type PolicyUpdateEmailAssetMaterialization = {
  materializationId: string;
  slug: string;
  purpose: "publish" | "send";
  s3Bucket: string;
  objectPrefix: string;
  assetNames: string[];
  createdAt: string;
  createdBy: string | null;
};

const materializationKey = (materializationId: string) => ({
  pk: `POLICY_UPDATE_EMAIL_ASSET_SET#${materializationId}`,
  sk: `POLICY_UPDATE_EMAIL_ASSET_SET#${materializationId}`,
});

function sourceAssetName(slug: string, src: string) {
  try {
    if (!src.startsWith("/")) return null;
    const path = src.split(/[?#]/, 1)[0];
    const match = path.match(/^\/api\/policy-updates\/([^/]+)\/assets\/([^/]+)$/i);
    if (!match || decodeURIComponent(match[1]) !== slug) return null;
    const asset = decodeURIComponent(match[2]);
    return assetNamePattern.test(asset) ? asset : null;
  } catch {
    return null;
  }
}

export function policyUpdateEmailAssetNames(
  upload: Pick<UploadedPolicyUpdateRecord, "slug" | "sections">,
) {
  const names = new Set<string>();
  for (const section of upload.sections) {
    for (const image of section.images || []) {
      const name = sourceAssetName(upload.slug, image.src);
      if (name) names.add(name);
    }
  }
  return [...names].sort();
}

function mutableAssetObjectKey(pdfObjectKey: string, asset: string) {
  return pdfObjectKey.replace(/\.pdf$/i, `/assets/${asset}`);
}

function immutableObjectPrefix(pdfObjectKey: string, materializationId: string) {
  return pdfObjectKey.replace(/\.pdf$/i, `/email-assets/${materializationId}`);
}

function encodedCopySource(bucket: string, key: string) {
  return [bucket, ...key.split("/")].map(encodeURIComponent).join("/");
}

function toMaterialization(
  item: Record<string, unknown> | null | undefined,
): PolicyUpdateEmailAssetMaterialization | null {
  if (
    typeof item?.materializationId !== "string" ||
    typeof item.slug !== "string" ||
    (item.purpose !== "publish" && item.purpose !== "send") ||
    typeof item.s3Bucket !== "string" ||
    typeof item.objectPrefix !== "string" ||
    !Array.isArray(item.assetNames) ||
    typeof item.createdAt !== "string"
  ) {
    return null;
  }
  const assetNames = item.assetNames.filter(
    (value): value is string => typeof value === "string" && assetNamePattern.test(value),
  );
  if (assetNames.length !== item.assetNames.length) return null;
  return {
    materializationId: item.materializationId,
    slug: item.slug,
    purpose: item.purpose,
    s3Bucket: item.s3Bucket,
    objectPrefix: item.objectPrefix,
    assetNames,
    createdAt: item.createdAt,
    createdBy: typeof item.createdBy === "string" ? item.createdBy : null,
  };
}

export async function materializePolicyUpdateEmailAssets({
  upload,
  purpose,
  createdBy,
}: {
  upload: UploadedPolicyUpdateRecord;
  purpose: PolicyUpdateEmailAssetMaterialization["purpose"];
  createdBy: string | null;
}) {
  const assetNames = policyUpdateEmailAssetNames(upload);
  if (!assetNames.length) return null;

  const materializationId = randomUUID();
  const objectPrefix = immutableObjectPrefix(upload.s3Key, materializationId);
  for (const asset of assetNames) {
    const sourceKey = mutableAssetObjectKey(upload.s3Key, asset);
    await s3Client.send(
      new CopyObjectCommand({
        Bucket: upload.s3Bucket,
        Key: `${objectPrefix}/${asset}`,
        CopySource: encodedCopySource(upload.s3Bucket, sourceKey),
        ServerSideEncryption: "AES256",
      }),
    );
  }

  const materialization: PolicyUpdateEmailAssetMaterialization = {
    materializationId,
    slug: upload.slug,
    purpose,
    s3Bucket: upload.s3Bucket,
    objectPrefix,
    assetNames,
    createdAt: new Date().toISOString(),
    createdBy,
  };
  await documentClient.put({
    TableName: TABLE_NAME,
    Item: {
      ...materializationKey(materializationId),
      type: "POLICY_UPDATE_EMAIL_ASSET_SET",
      ...materialization,
    },
    ConditionExpression: "attribute_not_exists(pk)",
  });
  return materialization;
}

export async function getPolicyUpdateEmailAssetMaterialization(materializationId: string) {
  const id = materializationId.trim();
  if (!id) return null;
  const result = await documentClient.get({
    TableName: TABLE_NAME,
    Key: materializationKey(id),
    ConsistentRead: true,
  });
  return toMaterialization(result.Item as Record<string, unknown> | undefined);
}

export function materializedPolicyUpdateEmailAssetKey(
  materialization: PolicyUpdateEmailAssetMaterialization,
  asset: string,
) {
  return materialization.assetNames.includes(asset)
    ? `${materialization.objectPrefix}/${asset}`
    : null;
}
