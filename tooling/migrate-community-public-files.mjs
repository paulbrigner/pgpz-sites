#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const APPLY_CONFIRMATION = "MIGRATE-COMMUNITY-PUBLIC-STATEMENTS";

export const COMMUNITY_PUBLIC_FILES_TARGET = Object.freeze({
  accountId: "860091316962",
  bucket: "pgpz-community-content",
  tableName: "PGPZCommunityNextAuth",
  region: "us-east-1",
  prefix: "public-files",
});

export const COMMUNITY_STATEMENT_MANIFEST = Object.freeze([
  Object.freeze({
    sourceFile: "2026-07-17-hfsc-clarity-act-statement-for-the-record.pdf",
    path: "statements-for-the-record/2026-07-17-hfsc-clarity-act-statement-for-the-record.pdf",
    title: "HFSC CLARITY Act Statement for the Record",
    description:
      "Statement for the HFSC Digital Assets Subcommittee hearing on how the CLARITY Act unlocks innovation.",
    access: "public",
    contentType: "application/pdf",
    expectedSize: 217172,
    expectedSha256: "3022414ec3bedabeb7d0c33780f997fe6d1792a12147f170e73abd045f29fe3b",
  }),
  Object.freeze({
    sourceFile: "2026-07-21-hfsc-fincen-oversight-statement-for-the-record.pdf",
    path: "statements-for-the-record/2026-07-21-hfsc-fincen-oversight-statement-for-the-record.pdf",
    title: "HFSC FinCEN Oversight Statement for the Record",
    description:
      "Statement for the HFSC National Security Subcommittee hearing on FinCEN oversight.",
    access: "public",
    contentType: "application/pdf",
    expectedSize: 237530,
    expectedSha256: "1ca3c04f1910dff1b1a74a9e7191fa0b09a7d31d1ef4ff72576947a88115fa7e",
  }),
]);

const DEFAULT_SOURCE_DIRECTORY = fileURLToPath(
  new URL(
    "./fixtures/initial-community-public-files/",
    import.meta.url,
  ),
);

const PUBLIC_FILE_LIBRARY_PK = "PUBLIC_FILE_LIBRARY";

function readOptionValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value.`);
  }
  return value;
}

export function usage() {
  return [
    "Migrate the two existing Community statement PDFs into the managed public-file library.",
    "",
    "Local dry run (default; performs no AWS calls):",
    "  node tooling/migrate-community-public-files.mjs [--profile PROFILE] [--region REGION]",
    "",
    "Apply after reviewing the dry-run output:",
    `  node tooling/migrate-community-public-files.mjs --apply --confirm ${APPLY_CONFIRMATION}`,
    "    [--profile PROFILE] [--region REGION]",
    "",
    "The production account, bucket, table, object prefix, public paths, and file checksums are pinned.",
    "The source fixtures are retained outside app/public so only the managed route serves them.",
  ].join("\n");
}

export function parseArgs(argv) {
  const options = {
    apply: false,
    dryRun: false,
    confirm: null,
    profile: null,
    region: COMMUNITY_PUBLIC_FILES_TARGET.region,
    sourceDirectory: DEFAULT_SOURCE_DIRECTORY,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case "--apply":
        options.apply = true;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--confirm":
        options.confirm = readOptionValue(argv, index, argument);
        index += 1;
        break;
      case "--profile":
        options.profile = readOptionValue(argv, index, argument);
        index += 1;
        break;
      case "--region":
        options.region = readOptionValue(argv, index, argument);
        index += 1;
        break;
      case "--source-directory":
        options.sourceDirectory = path.resolve(readOptionValue(argv, index, argument));
        index += 1;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (options.help) return options;
  if (options.apply && options.dryRun) {
    throw new Error("--apply and --dry-run are mutually exclusive.");
  }
  if (options.apply && options.confirm !== APPLY_CONFIRMATION) {
    throw new Error(`--apply requires --confirm ${APPLY_CONFIRMATION}.`);
  }
  if (!options.apply && options.confirm) {
    throw new Error("--confirm is only valid with --apply.");
  }
  if (!/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/i.test(options.region)) {
    throw new Error("--region must be a valid AWS region.");
  }

  return options;
}

export async function fingerprintFile(filePath) {
  const [metadata, body] = await Promise.all([stat(filePath), readFile(filePath)]);
  if (!metadata.isFile()) {
    throw new Error(`Migration source is not a regular file: ${path.basename(filePath)}`);
  }
  return {
    body,
    size: metadata.size,
    sha256: createHash("sha256").update(body).digest("hex"),
  };
}

function assertManifestEntry(entry) {
  if (
    entry.access !== "public" ||
    entry.contentType !== "application/pdf" ||
    !/^statements-for-the-record\/[a-z0-9][a-z0-9.-]+\.pdf$/.test(entry.path) ||
    path.basename(entry.path) !== entry.sourceFile ||
    !/^[a-f0-9]{64}$/.test(entry.expectedSha256) ||
    !Number.isSafeInteger(entry.expectedSize) ||
    entry.expectedSize <= 0
  ) {
    throw new Error(`Invalid pinned migration manifest entry: ${entry.sourceFile || "unknown"}`);
  }
}

function immutableVersionId(sha256) {
  return `initial-${sha256.slice(0, 16)}`;
}

function immutableObjectKey(entry, versionId, prefix) {
  const extension = path.posix.extname(entry.path);
  const stem = entry.path.slice(0, -extension.length);
  return `${prefix}/objects/${stem}/${versionId}${extension}`;
}

export async function buildMigrationPlan({
  sourceDirectory = DEFAULT_SOURCE_DIRECTORY,
  manifest = COMMUNITY_STATEMENT_MANIFEST,
  target = COMMUNITY_PUBLIC_FILES_TARGET,
} = {}) {
  if (manifest.length !== 2) {
    throw new Error("This migration must contain exactly the two pinned statement PDFs.");
  }

  const files = [];
  for (const entry of manifest) {
    assertManifestEntry(entry);
    const sourcePath = path.resolve(sourceDirectory, entry.sourceFile);
    const sourceRoot = `${path.resolve(sourceDirectory)}${path.sep}`;
    if (!sourcePath.startsWith(sourceRoot)) {
      throw new Error(`Migration source escapes the source directory: ${entry.sourceFile}`);
    }

    const fingerprint = await fingerprintFile(sourcePath);
    if (!fingerprint.body.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
      throw new Error(`Migration source is not a PDF: ${entry.sourceFile}`);
    }
    if (
      fingerprint.size !== entry.expectedSize ||
      fingerprint.sha256 !== entry.expectedSha256
    ) {
      throw new Error(
        `Pinned checksum or size does not match migration source: ${entry.sourceFile}`,
      );
    }

    const versionId = immutableVersionId(fingerprint.sha256);
    files.push({
      ...entry,
      sourcePath,
      size: fingerprint.size,
      sha256: fingerprint.sha256,
      versionId,
      s3Bucket: target.bucket,
      s3Key: immutableObjectKey(entry, versionId, target.prefix),
      publicUrl: `https://community.pgpz.org/resources/${entry.path}`,
    });
  }

  if (new Set(files.map((file) => file.path)).size !== files.length) {
    throw new Error("The pinned migration manifest contains duplicate public paths.");
  }

  return {
    target: {
      accountId: target.accountId,
      bucket: target.bucket,
      tableName: target.tableName,
      region: target.region,
      prefix: target.prefix,
    },
    files,
  };
}

function cleanEtag(value) {
  return typeof value === "string" ? value.replace(/^"|"$/g, "").trim() || null : null;
}

export function buildPutObjectInput(file, body) {
  return {
    Bucket: file.s3Bucket,
    Key: file.s3Key,
    Body: body,
    ContentType: file.contentType,
    ContentLength: file.size,
    ServerSideEncryption: "AES256",
    IfNoneMatch: "*",
    Metadata: {
      sha256: file.sha256,
      publicpath: file.path,
    },
  };
}

export function buildPublicFileRecord(file, { createdAt, etag }) {
  return {
    pk: PUBLIC_FILE_LIBRARY_PK,
    sk: `FILE#${file.path}`,
    type: "PUBLIC_FILE",
    path: file.path,
    title: file.title,
    description: file.description,
    originalFileName: file.sourceFile,
    contentType: file.contentType,
    fileSize: file.size,
    access: "public",
    revision: 1,
    versionId: file.versionId,
    s3Bucket: file.s3Bucket,
    s3Key: file.s3Key,
    etag: cleanEtag(etag),
    status: "active",
    createdAt,
    createdBy: null,
    updatedAt: createdAt,
    updatedBy: null,
    archivedAt: null,
    archivedBy: null,
    previousVersions: [],
  };
}

export function buildConditionalRecordTransaction(tableName, records) {
  return {
    TransactItems: records.map((record) => ({
      Put: {
        TableName: tableName,
        Item: record,
        ConditionExpression: "attribute_not_exists(#pk) AND attribute_not_exists(#sk)",
        ExpressionAttributeNames: {
          "#pk": "pk",
          "#sk": "sk",
        },
      },
    })),
  };
}

function assertStoredObjectMatches(file, head) {
  const metadataSha256 = head?.Metadata?.sha256 || head?.Metadata?.SHA256;
  if (
    head?.ContentLength !== file.size ||
    metadataSha256 !== file.sha256 ||
    head?.ServerSideEncryption !== "AES256"
  ) {
    throw new Error(`Existing S3 object does not match the pinned migration file: ${file.s3Key}`);
  }
  return cleanEtag(head.ETag);
}

export async function runMigration({
  options,
  plan,
  dependencies,
  now = () => new Date().toISOString(),
}) {
  if (!options.apply) {
    return {
      mode: "dry-run",
      planned: plan.files.length,
      uploaded: 0,
      reused: 0,
      recordsWritten: 0,
    };
  }

  const callerAccount = await dependencies.getCallerAccount();
  if (callerAccount !== plan.target.accountId) {
    throw new Error(
      `Selected AWS profile belongs to account ${callerAccount || "unknown"}, not the pinned Community account.`,
    );
  }

  const existingRecords = await Promise.all(
    plan.files.map((file) => dependencies.getRecord(file.path)),
  );
  const existingRecord = existingRecords.find(Boolean);
  if (existingRecord) {
    throw new Error(
      `A managed public-file record already exists at ${existingRecord.path || "a pinned path"}; no writes were attempted.`,
    );
  }

  const heads = [];
  for (const file of plan.files) {
    const head = await dependencies.headObject(file);
    if (head) assertStoredObjectMatches(file, head);
    heads.push(head);
  }

  let uploaded = 0;
  let reused = 0;
  const verifiedHeads = [];
  for (let index = 0; index < plan.files.length; index += 1) {
    const file = plan.files[index];
    if (heads[index]) {
      reused += 1;
      verifiedHeads.push(heads[index]);
      continue;
    }

    await dependencies.putObject(file);
    const verified = await dependencies.headObject(file);
    if (!verified) {
      throw new Error(`S3 did not return the uploaded migration object: ${file.s3Key}`);
    }
    assertStoredObjectMatches(file, verified);
    verifiedHeads.push(verified);
    uploaded += 1;
  }

  const createdAt = now();
  const records = plan.files.map((file, index) =>
    buildPublicFileRecord(file, {
      createdAt,
      etag: verifiedHeads[index]?.ETag,
    }),
  );
  await dependencies.putRecords(records);

  return {
    mode: "apply",
    planned: plan.files.length,
    uploaded,
    reused,
    recordsWritten: records.length,
  };
}

function isNotFound(error) {
  return (
    error?.name === "NotFound" ||
    error?.name === "NoSuchKey" ||
    error?.$metadata?.httpStatusCode === 404
  );
}

function isPreconditionFailure(error) {
  return error?.name === "PreconditionFailed" || error?.$metadata?.httpStatusCode === 412;
}

export async function createAwsDependencies(options, plan) {
  if (options.profile) process.env.AWS_PROFILE = options.profile;
  const [{ DynamoDBClient }, dynamo, s3] = await Promise.all([
    import("@aws-sdk/client-dynamodb"),
    import("@aws-sdk/lib-dynamodb"),
    import("@aws-sdk/client-s3"),
  ]);

  const documentClient = dynamo.DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: options.region }),
    { marshallOptions: { removeUndefinedValues: true } },
  );
  const s3Client = new s3.S3Client({ region: options.region });
  const awsBaseArguments = [
    ...(options.profile ? ["--profile", options.profile] : []),
    "--region",
    options.region,
  ];

  return {
    async getCallerAccount() {
      const result = spawnSync(
        "aws",
        [
          ...awsBaseArguments,
          "sts",
          "get-caller-identity",
          "--query",
          "Account",
          "--output",
          "text",
        ],
        { encoding: "utf8" },
      );
      if (result.error) throw result.error;
      if (result.status !== 0) {
        throw new Error("AWS CLI could not verify the selected profile and account.");
      }
      return result.stdout.trim();
    },
    async getRecord(publicPath) {
      const result = await documentClient.send(
        new dynamo.GetCommand({
          TableName: plan.target.tableName,
          Key: {
            pk: PUBLIC_FILE_LIBRARY_PK,
            sk: `FILE#${publicPath}`,
          },
          ConsistentRead: true,
        }),
      );
      return result.Item || null;
    },
    async headObject(file) {
      try {
        return await s3Client.send(
          new s3.HeadObjectCommand({
            Bucket: file.s3Bucket,
            Key: file.s3Key,
          }),
        );
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    },
    async putObject(file) {
      const body = await readFile(file.sourcePath);
      try {
        await s3Client.send(
          new s3.PutObjectCommand(buildPutObjectInput(file, body)),
        );
      } catch (error) {
        // A matching object may have won a race after the read-only preflight.
        // The mandatory post-upload HEAD check still verifies its pinned metadata.
        if (!isPreconditionFailure(error)) throw error;
      }
    },
    async putRecords(records) {
      await documentClient.send(
        new dynamo.TransactWriteCommand(
          buildConditionalRecordTransaction(plan.target.tableName, records),
        ),
      );
    },
  };
}

function printablePlan(options, plan) {
  return {
    mode: options.apply ? "apply" : "dry-run",
    confirmation: APPLY_CONFIRMATION,
    target: {
      ...plan.target,
      region: options.region,
    },
    files: plan.files.map((file) => ({
      sourceFile: file.sourceFile,
      path: file.path,
      publicUrl: file.publicUrl,
      access: file.access,
      size: file.size,
      sha256: file.sha256,
      versionId: file.versionId,
      s3Key: file.s3Key,
    })),
  };
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

  try {
    const plan = await buildMigrationPlan({
      sourceDirectory: options.sourceDirectory,
    });
    console.log(JSON.stringify(printablePlan(options, plan), null, 2));
    if (!options.apply) {
      console.log("Dry-run only. No AWS calls or writes were attempted.");
      return 0;
    }

    const dependencies = await createAwsDependencies(options, plan);
    const summary = await runMigration({ options, plan, dependencies });
    console.log(JSON.stringify(summary, null, 2));
    return 0;
  } catch (error) {
    console.error(`Migration failed: ${error?.message || error?.name || "Error"}`);
    return 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath === import.meta.url) {
  main().then(
    (exitCode) => {
      process.exitCode = exitCode;
    },
    (error) => {
      console.error(`Migration failed: ${error?.message || error?.name || "Error"}`);
      process.exitCode = 1;
    },
  );
}
