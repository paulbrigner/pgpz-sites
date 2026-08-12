/**
 * Idempotently imports the finalized PGPZ brand packages into the Board vault.
 * Dry-run is the default. A live import requires both --apply and the exact
 * confirmation phrase so an exploratory invocation cannot write retained data.
 *
 * Required environment: BOARD_DOCUMENTS_STAGING_BUCKET,
 * BOARD_DOCUMENTS_RETAINED_BUCKET, BOARD_DOCUMENTS_TABLE, BOARD_AUDIT_TABLE.
 * Optional: REGION_AWS/AWS_REGION and NEXTAUTH_TABLE.
 *
 * Live example:
 *   NODE_OPTIONS=--conditions=react-server AWS_PROFILE=zodldashboard \
 *   npx tsx apps/board/scripts/import-brand-library.ts \
 *     --actor-email div@pgpz.org --apply --confirm IMPORT_PGPZ_BRAND_LIBRARY
 */
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { buildStagingKey } from "@pgpz/document-vault";
import { BRAND_DOCUMENT_CATEGORY, BRAND_LIBRARY_ENTRIES } from "@/lib/brand-library";

const CONFIRMATION = "IMPORT_PGPZ_BRAND_LIBRARY";
const USER_TYPE = "BETTER_AUTH#better_auth_users";
const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

type SourceRecord = Readonly<{
  key: string;
  relativePath: string;
  mimeType: string;
}>;

const SOURCES: ReadonlyArray<SourceRecord> = [
  { key: "identity-guidelines-v4", relativePath: "output/pgpz-brand-package-symbol-as-z-v4/guidelines/PGPZ-Brand-Guidelines-Symbol-as-Z-v4.pdf", mimeType: "application/pdf" },
  { key: "identity-package-v4", relativePath: "output/PGPZ-Brand-Package-Symbol-as-Z-v4.zip", mimeType: "application/zip" },
  { key: "social-guidelines-v4-companion-v1", relativePath: "output/pgpz-social-brand-package-v4-companion-v1/08-guidelines/PGPZ-Social-Media-Brand-Guidelines-v4-Companion-v1.pdf", mimeType: "application/pdf" },
  { key: "social-package-v4-companion-v1", relativePath: "output/PGPZ-Social-Brand-Package-v4-Companion-v1.zip", mimeType: "application/zip" },
  { key: "trademark-use-conditions-v4", relativePath: "output/pgpz-brand-package-symbol-as-z-v4/TRADEMARK_USE_CONDITIONS.md", mimeType: "text/markdown" },
  { key: "trademark-use-checklist-social-v1", relativePath: "output/pgpz-social-brand-package-v4-companion-v1/TRADEMARK-USE-CHECKLIST.md", mimeType: "text/markdown" },
  { key: "identity-manifest-v4", relativePath: "output/pgpz-brand-package-symbol-as-z-v4/manifest.json", mimeType: "application/json" },
  { key: "identity-checksums-v4", relativePath: "output/pgpz-brand-package-symbol-as-z-v4/SHA256SUMS.txt", mimeType: "text/plain" },
  { key: "social-manifest-v4-companion-v1", relativePath: "output/pgpz-social-brand-package-v4-companion-v1/manifest.json", mimeType: "application/json" },
  { key: "social-checksums-v4-companion-v1", relativePath: "output/pgpz-social-brand-package-v4-companion-v1/SHA256SUMS.txt", mimeType: "text/plain" },
] as const;

function option(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : undefined;
}

function requireEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function resolveActorId(email: string, region: string): Promise<string> {
  const tableName = process.env.NEXTAUTH_TABLE?.trim() || "PGPZBoardNextAuth";
  const client = DynamoDBDocument.from(new DynamoDBClient({ region }));
  const result = await client.query({
    TableName: tableName,
    IndexName: "GSI1",
    KeyConditionExpression: "#pk = :pk",
    ExpressionAttributeNames: { "#pk": "GSI1PK" },
    ExpressionAttributeValues: { ":pk": `${USER_TYPE}#email#${email}` },
    Limit: 5,
  });
  const actor = (result.Items || []).find((item) => item.email === email);
  const id = typeof actor?.id === "string" ? actor.id : "";
  if (!id) throw new Error(`No Better Auth user exists for ${email}.`);
  return id;
}

export async function importBrandLibrary(argv = process.argv.slice(2)) {
  const apply = argv.includes("--apply");
  if (apply && option(argv, "confirm") !== CONFIRMATION) {
    throw new Error(`Live import requires --confirm ${CONFIRMATION}.`);
  }

  const actorEmail = (option(argv, "actor-email") || "div@pgpz.org").trim().toLowerCase();
  const region = process.env.REGION_AWS || process.env.AWS_REGION || "us-east-1";
  const stagingBucket = requireEnvironment("BOARD_DOCUMENTS_STAGING_BUCKET");
  requireEnvironment("BOARD_DOCUMENTS_RETAINED_BUCKET");
  requireEnvironment("BOARD_DOCUMENTS_TABLE");
  requireEnvironment("BOARD_AUDIT_TABLE");

  const actorId = await resolveActorId(actorEmail, region);
  const member = { id: actorId, name: "Board brand library import", email: actorEmail, role: "executive-director" as const, isAdmin: true };
  const { boardDocumentRepository, createDocument, addVersion, updateMetadata } = await import("@/lib/vault");

  const existing = await boardDocumentRepository.listDocuments({ category: BRAND_DOCUMENT_CATEGORY });
  const byTitle = new Map(existing.map((document) => [document.title, document]));
  const s3 = new S3Client({ region });
  const plan: Array<{ title: string; action: "create" | "add-version" | "update-metadata" | "skip"; sha256: string; bytes: number }> = [];

  for (const source of SOURCES) {
    const entry = BRAND_LIBRARY_ENTRIES.find((candidate) => candidate.key === source.key);
    if (!entry) throw new Error(`No brand-library entry exists for ${source.key}.`);
    const absolutePath = path.resolve(REPOSITORY_ROOT, source.relativePath);
    const bytes = await readFile(absolutePath);
    const digest = sha256(bytes);
    const current = byTitle.get(entry.title);
    const metadataChanged = current !== undefined &&
      (current.description !== entry.description || current.category !== BRAND_DOCUMENT_CATEGORY || current.visibility !== "members");
    const action = current?.currentVersion.sha256 === digest
      ? metadataChanged ? "update-metadata" : "skip"
      : current ? "add-version" : "create";
    plan.push({ title: entry.title, action, sha256: digest, bytes: bytes.byteLength });

    if (!apply || action === "skip") continue;
    if (action === "update-metadata" && current) {
      await updateMetadata({
        member,
        documentId: current.documentId,
        title: entry.title,
        description: entry.description,
        category: BRAND_DOCUMENT_CATEGORY,
        visibility: "members",
      });
      continue;
    }
    const stagingKey = buildStagingKey("board", randomUUID());
    await s3.send(new PutObjectCommand({
      Bucket: stagingBucket,
      Key: stagingKey,
      Body: bytes,
      ContentType: source.mimeType,
      Metadata: { sha256: digest },
    }));

    const fileName = path.basename(absolutePath);
    const result = current
      ? await addVersion({ member, documentId: current.documentId, stagedKey: stagingKey, fileName })
      : await createDocument({
          member,
          stagedKey: stagingKey,
          fileName,
          title: entry.title,
          description: entry.description,
          category: BRAND_DOCUMENT_CATEGORY,
        });

    if (result.description !== entry.description || result.category !== BRAND_DOCUMENT_CATEGORY || result.visibility !== "members") {
      await updateMetadata({
        member,
        documentId: result.documentId,
        title: entry.title,
        description: entry.description,
        category: BRAND_DOCUMENT_CATEGORY,
        visibility: "members",
      });
    }
  }

  console.table(plan.map((item) => ({ title: item.title, action: item.action, bytes: item.bytes, sha256: item.sha256.slice(0, 16) })));
  console.log(apply ? `[board] Brand library import completed as ${actorEmail}.` : `[board] Dry run only. Re-run with --apply --confirm ${CONFIRMATION} to write.`);
  return plan;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  importBrandLibrary().catch((error) => {
    console.error(`[board] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
