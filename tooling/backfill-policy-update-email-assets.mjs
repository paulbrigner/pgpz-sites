#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

const APP_TARGETS = Object.freeze({
  community: Object.freeze({ tableName: "PGPZCommunityNextAuth", region: "us-east-1" }),
  coalition: Object.freeze({ tableName: "PGPZCoalitionNextAuth", region: "us-east-1" }),
});

const ASSET_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]+\.(?:png|jpe?g|webp)$/i;
const POLICY_UPDATE_UPLOAD_GSI_PK = "POLICY_UPDATE_UPLOAD";

function readOptionValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value.`);
  }
  return value;
}

export function usage() {
  return [
    "Backfill immutable email assets for already-published policy updates.",
    "",
    "Dry-run (default):",
    "  node tooling/backfill-policy-update-email-assets.mjs --app community [--profile PROFILE]",
    "  node tooling/backfill-policy-update-email-assets.mjs --table TABLE --region REGION [--profile PROFILE]",
    "",
    "Apply after reviewing the dry-run:",
    "  node tooling/backfill-policy-update-email-assets.mjs --app community --apply [--profile PROFILE]",
    "",
    "Selectors are mutually exclusive. --app accepts community or coalition.",
  ].join("\n");
}

export function parseArgs(argv) {
  const parsed = {
    apply: false,
    app: null,
    tableName: null,
    region: null,
    profile: null,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case "--apply":
        parsed.apply = true;
        break;
      case "--help":
      case "-h":
        parsed.help = true;
        break;
      case "--app":
        parsed.app = readOptionValue(argv, index, argument).toLowerCase();
        index += 1;
        break;
      case "--table":
        parsed.tableName = readOptionValue(argv, index, argument);
        index += 1;
        break;
      case "--region":
        parsed.region = readOptionValue(argv, index, argument);
        index += 1;
        break;
      case "--profile":
        parsed.profile = readOptionValue(argv, index, argument);
        index += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (parsed.help) return parsed;

  if (parsed.app) {
    if (parsed.tableName || parsed.region) {
      throw new Error("Use either --app or --table with --region, not both.");
    }
    const target = APP_TARGETS[parsed.app];
    if (!target) {
      throw new Error("--app must be community or coalition.");
    }
    parsed.tableName = target.tableName;
    parsed.region = target.region;
  } else if (!parsed.tableName || !parsed.region) {
    throw new Error("Select a target with --app, or provide both --table and --region.");
  }

  return parsed;
}

function sourceAssetName(slug, src) {
  if (typeof src !== "string" || !src.startsWith("/") || src.startsWith("//")) return null;
  try {
    const url = new URL(src, "https://email-assets.invalid");
    const match = url.pathname.match(/^\/api\/policy-updates\/([^/]+)\/assets\/([^/]+)$/i);
    if (!match || decodeURIComponent(match[1]) !== slug) return null;
    const asset = decodeURIComponent(match[2]);
    return ASSET_NAME_PATTERN.test(asset) ? asset : null;
  } catch {
    return null;
  }
}

export function localPolicyUpdateAssetNames(upload) {
  if (!upload || typeof upload.slug !== "string" || !Array.isArray(upload.sections)) {
    return [];
  }

  const names = new Set();
  for (const section of upload.sections) {
    if (!section || typeof section !== "object" || !Array.isArray(section.images)) continue;
    for (const image of section.images) {
      if (!image || typeof image !== "object") continue;
      const name = sourceAssetName(upload.slug, image.src);
      if (name) names.add(name);
    }
  }
  return [...names].sort();
}

function hasMaterializationPointer(value) {
  return value !== undefined && value !== null && value !== "";
}

export function planUpload(upload) {
  if (!upload || typeof upload !== "object") {
    return { status: "skip-invalid-record", assetNames: [] };
  }
  if (upload.visibilityStatus !== "published") {
    return { status: "skip-not-published", assetNames: [] };
  }
  if (hasMaterializationPointer(upload.publicEmailAssetMaterializationId)) {
    return { status: "skip-already-materialized", assetNames: [] };
  }
  if (
    upload.type !== "POLICY_UPDATE_UPLOAD" ||
    typeof upload.pk !== "string" ||
    typeof upload.sk !== "string" ||
    typeof upload.slug !== "string" ||
    !upload.slug.trim() ||
    typeof upload.s3Bucket !== "string" ||
    !upload.s3Bucket.trim() ||
    typeof upload.s3Key !== "string" ||
    !upload.s3Key.toLowerCase().endsWith(".pdf")
  ) {
    return { status: "skip-invalid-record", assetNames: [] };
  }
  const expectedKey = `POLICY_UPDATE_UPLOAD#${upload.slug}`;
  if (upload.pk !== expectedKey || upload.sk !== expectedKey) {
    return { status: "skip-invalid-record", assetNames: [] };
  }

  const assetNames = localPolicyUpdateAssetNames(upload);
  if (!assetNames.length) return { status: "skip-no-assets", assetNames };
  return { status: "ready", assetNames };
}

function mutableAssetObjectKey(pdfObjectKey, asset) {
  return pdfObjectKey.replace(/\.pdf$/i, `/assets/${asset}`);
}

function immutableObjectPrefix(pdfObjectKey, materializationId) {
  return pdfObjectKey.replace(/\.pdf$/i, `/email-assets/${materializationId}`);
}

function encodedCopySource(bucket, key) {
  return [bucket, ...key.split("/")].map(encodeURIComponent).join("/");
}

export function buildMaterializationItem({ upload, assetNames, materializationId, createdAt }) {
  const objectPrefix = immutableObjectPrefix(upload.s3Key, materializationId);
  return {
    pk: `POLICY_UPDATE_EMAIL_ASSET_SET#${materializationId}`,
    sk: `POLICY_UPDATE_EMAIL_ASSET_SET#${materializationId}`,
    type: "POLICY_UPDATE_EMAIL_ASSET_SET",
    materializationId,
    slug: upload.slug,
    purpose: "publish",
    s3Bucket: upload.s3Bucket,
    objectPrefix,
    assetNames,
    createdAt,
    createdBy: null,
  };
}

export function buildConditionalPointerUpdate({
  tableName,
  upload,
  materializationId,
}) {
  return {
    TableName: tableName,
    Key: { pk: upload.pk, sk: upload.sk },
    UpdateExpression: "SET #materialization = :materializationId",
    ConditionExpression:
      "#visibility = :published AND (attribute_not_exists(#materialization) OR #materialization = :nullValue) AND #sections = :sections AND #s3Bucket = :s3Bucket AND #s3Key = :s3Key",
    ExpressionAttributeNames: {
      "#visibility": "visibilityStatus",
      "#materialization": "publicEmailAssetMaterializationId",
      "#sections": "sections",
      "#s3Bucket": "s3Bucket",
      "#s3Key": "s3Key",
    },
    ExpressionAttributeValues: {
      ":published": "published",
      ":materializationId": materializationId,
      ":nullValue": null,
      ":sections": upload.sections,
      ":s3Bucket": upload.s3Bucket,
      ":s3Key": upload.s3Key,
    },
  };
}

function uploadFingerprint(upload) {
  return createHash("sha256")
    .update(`${upload?.pk || "unknown"}\u0000${upload?.sk || "unknown"}`)
    .digest("hex")
    .slice(0, 12);
}

function isConditionalFailure(error) {
  return error?.name === "ConditionalCheckFailedException";
}

function emptySummary(mode) {
  return {
    mode,
    scanned: 0,
    planned: 0,
    materialized: 0,
    skippedAlreadyMaterialized: 0,
    skippedNotPublished: 0,
    skippedNoAssets: 0,
    skippedInvalid: 0,
    orphaned: 0,
    failed: 0,
  };
}

function recordSkip(summary, status) {
  if (status === "skip-already-materialized") summary.skippedAlreadyMaterialized += 1;
  else if (status === "skip-not-published") summary.skippedNotPublished += 1;
  else if (status === "skip-no-assets") summary.skippedNoAssets += 1;
  else summary.skippedInvalid += 1;
}

export async function runBackfill({ options, dependencies, log = () => {} }) {
  const summary = emptySummary(options.apply ? "apply" : "dry-run");
  const uploads = await dependencies.listUploads();
  summary.scanned = uploads.length;

  for (const listedUpload of uploads) {
    let upload = listedUpload;
    let plan = planUpload(upload);
    if (plan.status !== "ready") {
      recordSkip(summary, plan.status);
      continue;
    }

    summary.planned += 1;
    if (!options.apply) continue;

    // Re-read immediately before copying so stale query results do not create avoidable orphans.
    upload = await dependencies.getUpload(upload);
    plan = planUpload(upload);
    if (plan.status !== "ready") {
      summary.planned -= 1;
      recordSkip(summary, plan.status);
      continue;
    }

    const materializationId = dependencies.randomUUID();
    const createdAt = dependencies.now();
    const materialization = buildMaterializationItem({
      upload,
      assetNames: plan.assetNames,
      materializationId,
      createdAt,
    });
    let copiedObjects = 0;
    let recordWritten = false;

    try {
      for (const asset of plan.assetNames) {
        await dependencies.copyAsset({
          bucket: upload.s3Bucket,
          sourceKey: mutableAssetObjectKey(upload.s3Key, asset),
          destinationKey: `${materialization.objectPrefix}/${asset}`,
        });
        copiedObjects += 1;
      }

      await dependencies.putMaterialization(materialization);
      recordWritten = true;
      await dependencies.attachMaterialization(
        buildConditionalPointerUpdate({
          tableName: options.tableName,
          upload,
          materializationId,
        }),
      );
      summary.materialized += 1;
    } catch (error) {
      const orphaned = copiedObjects > 0 || recordWritten;
      if (orphaned) {
        summary.orphaned += 1;
        log({
          level: "orphan",
          upload: uploadFingerprint(upload),
          materializationId,
          copiedObjects,
          recordWritten,
          reason: isConditionalFailure(error)
            ? "conditional-pointer-update-rejected"
            : "write-sequence-failed",
        });
      } else {
        summary.failed += 1;
        log({
          level: "error",
          upload: uploadFingerprint(upload),
          reason: isConditionalFailure(error) ? "conditional-write-rejected" : "write-failed",
        });
      }
    }
  }

  return summary;
}

export async function createAwsDependencies(options) {
  if (options.profile) process.env.AWS_PROFILE = options.profile;

  const [{ DynamoDBClient }, dynamo, s3] = await Promise.all([
    import("@aws-sdk/client-dynamodb"),
    import("@aws-sdk/lib-dynamodb"),
    import("@aws-sdk/client-s3"),
  ]);
  const documentClient = dynamo.DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: options.region }),
  );
  const s3Client = new s3.S3Client({ region: options.region });

  return {
    randomUUID,
    now: () => new Date().toISOString(),
    async listUploads() {
      const uploads = [];
      let ExclusiveStartKey;
      do {
        const result = await documentClient.send(
          new dynamo.QueryCommand({
            TableName: options.tableName,
            IndexName: "GSI1",
            KeyConditionExpression: "#gsi1pk = :pk",
            ExpressionAttributeNames: { "#gsi1pk": "GSI1PK" },
            ExpressionAttributeValues: { ":pk": POLICY_UPDATE_UPLOAD_GSI_PK },
            ExclusiveStartKey,
          }),
        );
        uploads.push(...(result.Items || []));
        ExclusiveStartKey = result.LastEvaluatedKey;
      } while (ExclusiveStartKey);
      return uploads;
    },
    async getUpload(upload) {
      const result = await documentClient.send(
        new dynamo.GetCommand({
          TableName: options.tableName,
          Key: { pk: upload.pk, sk: upload.sk },
          ConsistentRead: true,
        }),
      );
      return result.Item || null;
    },
    async copyAsset({ bucket, sourceKey, destinationKey }) {
      await s3Client.send(
        new s3.CopyObjectCommand({
          Bucket: bucket,
          Key: destinationKey,
          CopySource: encodedCopySource(bucket, sourceKey),
          ServerSideEncryption: "AES256",
        }),
      );
    },
    async putMaterialization(materialization) {
      await documentClient.send(
        new dynamo.PutCommand({
          TableName: options.tableName,
          Item: materialization,
          ConditionExpression: "attribute_not_exists(pk)",
        }),
      );
    },
    async attachMaterialization(update) {
      await documentClient.send(new dynamo.UpdateCommand(update));
    },
  };
}

function printEvent(event) {
  const fields = [`level=${event.level}`, `upload=${event.upload}`, `reason=${event.reason}`];
  if (event.materializationId) fields.push(`materialization=${event.materializationId}`);
  if (typeof event.copiedObjects === "number") fields.push(`copied=${event.copiedObjects}`);
  if (typeof event.recordWritten === "boolean") fields.push(`record=${event.recordWritten}`);
  console.error(fields.join(" "));
}

export async function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(error.message);
    console.error(usage());
    return 1;
  }
  if (options.help) {
    console.log(usage());
    return 0;
  }

  const dependencies = await createAwsDependencies(options);
  console.log(
    JSON.stringify({
      mode: options.apply ? "apply" : "dry-run",
      target: options.app || options.tableName,
      region: options.region,
    }),
  );
  const summary = await runBackfill({ options, dependencies, log: printEvent });
  console.log(JSON.stringify(summary));
  if (!options.apply) {
    console.log("Dry-run only. No S3 or DynamoDB writes were attempted.");
  }
  return summary.failed || summary.orphaned ? 2 : 0;
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath === import.meta.url) {
  main().then(
    (exitCode) => {
      process.exitCode = exitCode;
    },
    (error) => {
      console.error(`Backfill failed: ${error?.name || "Error"}`);
      process.exitCode = 1;
    },
  );
}
