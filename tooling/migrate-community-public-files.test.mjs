import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  APPLY_CONFIRMATION,
  COMMUNITY_PUBLIC_FILES_TARGET,
  COMMUNITY_STATEMENT_MANIFEST,
  buildConditionalRecordTransaction,
  buildMigrationPlan,
  buildPublicFileRecord,
  buildPutObjectInput,
  parseArgs,
  runMigration,
} from "./migrate-community-public-files.mjs";

const EXPECTED_PUBLIC_PATHS = [
  "statements-for-the-record/2026-07-17-hfsc-clarity-act-statement-for-the-record.pdf",
  "statements-for-the-record/2026-07-21-hfsc-fincen-oversight-statement-for-the-record.pdf",
];

async function fixturePlan(t) {
  const sourceDirectory = await mkdtemp(path.join(os.tmpdir(), "pgpz-public-files-"));
  t.after(() => rm(sourceDirectory, { recursive: true, force: true }));
  const body = Buffer.from("%PDF-1.7\npinned migration fixture\n%%EOF\n");
  const sha256 = createHash("sha256").update(body).digest("hex");
  const sourceFile = "statement.pdf";
  await mkdir(sourceDirectory, { recursive: true });
  await writeFile(path.join(sourceDirectory, sourceFile), body);
  const manifest = [
    {
      sourceFile,
      path: "statements-for-the-record/statement.pdf",
      title: "Statement",
      description: "",
      access: "public",
      contentType: "application/pdf",
      expectedSize: body.length,
      expectedSha256: sha256,
    },
    {
      sourceFile: "second.pdf",
      path: "statements-for-the-record/second.pdf",
      title: "Second statement",
      description: "",
      access: "public",
      contentType: "application/pdf",
      expectedSize: body.length,
      expectedSha256: sha256,
    },
  ];
  await writeFile(path.join(sourceDirectory, "second.pdf"), body);
  return buildMigrationPlan({ sourceDirectory, manifest });
}

test("pins only the two existing statement URLs and keeps both public", () => {
  assert.deepEqual(
    COMMUNITY_STATEMENT_MANIFEST.map((entry) => entry.path),
    EXPECTED_PUBLIC_PATHS,
  );
  assert.deepEqual(
    COMMUNITY_STATEMENT_MANIFEST.map((entry) => entry.access),
    ["public", "public"],
  );
  assert.deepEqual(
    COMMUNITY_STATEMENT_MANIFEST.map((entry) => ({
      size: entry.expectedSize,
      sha256: entry.expectedSha256,
    })),
    [
      {
        size: 217172,
        sha256: "3022414ec3bedabeb7d0c33780f997fe6d1792a12147f170e73abd045f29fe3b",
      },
      {
        size: 237530,
        sha256: "1ca3c04f1910dff1b1a74a9e7191fa0b09a7d31d1ef4ff72576947a88115fa7e",
      },
    ],
  );
});

test("computes and verifies checksums before building immutable object keys", async (t) => {
  const plan = await fixturePlan(t);

  assert.equal(plan.files.length, 2);
  assert.match(plan.files[0].versionId, /^initial-[a-f0-9]{16}$/);
  assert.equal(
    plan.files[0].s3Key,
    `public-files/objects/statements-for-the-record/statement/${plan.files[0].versionId}.pdf`,
  );
  assert.equal(
    plan.files[0].publicUrl,
    "https://community.pgpz.org/resources/statements-for-the-record/statement.pdf",
  );
});

test("rejects any source whose bytes no longer match the pinned manifest", async (t) => {
  const sourceDirectory = await mkdtemp(path.join(os.tmpdir(), "pgpz-public-files-"));
  t.after(() => rm(sourceDirectory, { recursive: true, force: true }));
  const body = Buffer.from("%PDF-1.7\nchanged\n");
  await writeFile(path.join(sourceDirectory, "one.pdf"), body);
  await writeFile(path.join(sourceDirectory, "two.pdf"), body);
  const manifest = ["one.pdf", "two.pdf"].map((sourceFile) => ({
    sourceFile,
    path: `statements-for-the-record/${sourceFile}`,
    title: sourceFile,
    description: "",
    access: "public",
    contentType: "application/pdf",
    expectedSize: body.length,
    expectedSha256: "0".repeat(64),
  }));

  await assert.rejects(
    buildMigrationPlan({ sourceDirectory, manifest }),
    /Pinned checksum or size does not match/,
  );
});

test("defaults to a no-AWS dry run and guards apply with an exact confirmation", async (t) => {
  const plan = await fixturePlan(t);
  const options = parseArgs(["--profile", "zodldashboard", "--region", "us-east-1"]);
  const dependencies = new Proxy(
    {},
    {
      get() {
        throw new Error("Dry run attempted to use an AWS dependency");
      },
    },
  );

  const summary = await runMigration({ options, plan, dependencies });
  assert.deepEqual(summary, {
    mode: "dry-run",
    planned: 2,
    uploaded: 0,
    reused: 0,
    recordsWritten: 0,
  });
  assert.throws(
    () => parseArgs(["--apply", "--confirm", "yes"]),
    new RegExp(`--confirm ${APPLY_CONFIRMATION}`),
  );
  assert.throws(
    () => parseArgs(["--confirm", APPLY_CONFIRMATION]),
    /only valid with --apply/,
  );
});

test("uses AES256 conditional S3 puts and conditional DynamoDB records", async (t) => {
  const plan = await fixturePlan(t);
  const file = plan.files[0];
  const put = buildPutObjectInput(file, Buffer.from("body"));
  assert.equal(put.ServerSideEncryption, "AES256");
  assert.equal(put.IfNoneMatch, "*");
  assert.equal(put.Metadata.sha256, file.sha256);

  const record = buildPublicFileRecord(file, {
    createdAt: "2026-07-25T12:00:00.000Z",
    etag: '"abc123"',
  });
  assert.equal(record.pk, "PUBLIC_FILE_LIBRARY");
  assert.equal(record.sk, `FILE#${file.path}`);
  assert.equal(record.type, "PUBLIC_FILE");
  assert.equal(record.access, "public");
  assert.equal(record.etag, "abc123");
  assert.deepEqual(record.previousVersions, []);

  const transaction = buildConditionalRecordTransaction(
    COMMUNITY_PUBLIC_FILES_TARGET.tableName,
    [record],
  );
  assert.match(
    transaction.TransactItems[0].Put.ConditionExpression,
    /attribute_not_exists\(#pk\).*attribute_not_exists\(#sk\)/,
  );
});

test("apply verifies the pinned account, uploads objects, verifies them, then atomically writes records", async (t) => {
  const plan = await fixturePlan(t);
  const options = parseArgs([
    "--apply",
    "--confirm",
    APPLY_CONFIRMATION,
    "--profile",
    "zodldashboard",
  ]);
  const stored = new Map();
  const calls = { getRecord: 0, putObject: 0, putRecords: 0 };
  let records;
  const dependencies = {
    getCallerAccount: async () => COMMUNITY_PUBLIC_FILES_TARGET.accountId,
    getRecord: async () => {
      calls.getRecord += 1;
      return null;
    },
    headObject: async (file) => stored.get(file.s3Key) || null,
    putObject: async (file) => {
      calls.putObject += 1;
      stored.set(file.s3Key, {
        ContentLength: file.size,
        Metadata: { sha256: file.sha256 },
        ServerSideEncryption: "AES256",
        ETag: `"etag-${calls.putObject}"`,
      });
    },
    putRecords: async (input) => {
      calls.putRecords += 1;
      records = input;
    },
  };

  const summary = await runMigration({
    options,
    plan,
    dependencies,
    now: () => "2026-07-25T12:00:00.000Z",
  });

  assert.deepEqual(summary, {
    mode: "apply",
    planned: 2,
    uploaded: 2,
    reused: 0,
    recordsWritten: 2,
  });
  assert.deepEqual(calls, { getRecord: 2, putObject: 2, putRecords: 1 });
  assert.deepEqual(
    records.map((record) => ({ path: record.path, access: record.access })),
    plan.files.map((file) => ({ path: file.path, access: "public" })),
  );
});

test("apply fails before S3 writes when a managed path already exists", async (t) => {
  const plan = await fixturePlan(t);
  const options = parseArgs([
    "--apply",
    "--confirm",
    APPLY_CONFIRMATION,
  ]);
  let writes = 0;
  const dependencies = {
    getCallerAccount: async () => COMMUNITY_PUBLIC_FILES_TARGET.accountId,
    getRecord: async (publicPath) => ({ path: publicPath }),
    headObject: async () => null,
    putObject: async () => {
      writes += 1;
    },
    putRecords: async () => {
      writes += 1;
    },
  };

  await assert.rejects(
    runMigration({ options, plan, dependencies }),
    /managed public-file record already exists/,
  );
  assert.equal(writes, 0);
});
