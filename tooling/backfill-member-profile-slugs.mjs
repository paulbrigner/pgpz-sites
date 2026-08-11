#!/usr/bin/env node

import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

const TARGETS = Object.freeze({
  coalition: Object.freeze({ tableName: "PGPZCoalitionNextAuth", region: "us-east-1" }),
});
const CONFIRMATION = "BACKFILL-COALITION-MEMBER-PROFILE-SLUGS";
const RESERVED = new Set(["admin", "api", "auth", "help", "home", "join", "members", "new", "privacy", "profile", "resources", "settings", "signin", "signup", "support", "terms", "updates"]);

const readValue = (argv, index, option) => {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${option} requires a value.`);
  return value;
};

export function usage() {
  return [
    "Backfill protected vanity profiles for existing opted-in Coalition members.",
    "",
    "Dry-run (default):",
    "  node tooling/backfill-member-profile-slugs.mjs --app coalition [--profile PROFILE]",
    "",
    "Apply after reviewing the dry-run:",
    `  node tooling/backfill-member-profile-slugs.mjs --app coalition --apply --confirm ${CONFIRMATION} [--profile PROFILE]`,
  ].join("\n");
}

export function parseArgs(argv) {
  const options = { app: null, tableName: null, region: null, profile: null, apply: false, confirm: null, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--apply") options.apply = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else if (["--app", "--profile", "--confirm"].includes(argument)) {
      const value = readValue(argv, index, argument); index += 1;
      if (argument === "--app") options.app = value.toLowerCase();
      if (argument === "--profile") options.profile = value;
      if (argument === "--confirm") options.confirm = value;
    } else throw new Error(`Unknown argument: ${argument}`);
  }
  if (options.help) return options;
  const target = options.app ? TARGETS[options.app] : null;
  if (!target) throw new Error("--app coalition is required.");
  options.tableName = target.tableName;
  options.region = target.region;
  if (options.apply && options.confirm !== CONFIRMATION) {
    throw new Error(`Apply mode requires --confirm ${CONFIRMATION}.`);
  }
  return options;
}

export function normalizeSlug(value) {
  return typeof value === "string" ? value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/[\s_]+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48).replace(/-+$/g, "") : "";
}

const displayName = (user) => {
  const direct = typeof user.name === "string" ? user.name.trim() : "";
  if (direct) return direct;
  return [user.firstName, user.lastName].filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()).join(" ");
};

const safeLinkedInUrl = (value) => {
  if (typeof value !== "string" || !value.trim()) return null;
  try { const url = new URL(value.trim()); return url.protocol === "https:" && (url.hostname === "linkedin.com" || url.hostname.endsWith(".linkedin.com")) ? url.toString() : null; } catch { return null; }
};

const safeXHandle = (value) => {
  if (typeof value !== "string") return null;
  const handle = value.trim().replace(/^@/, "");
  return /^[A-Za-z0-9_]{1,15}$/.test(handle) ? `@${handle}` : null;
};

export function candidateSlug(user) {
  const candidate = normalizeSlug(displayName(user));
  if (candidate.length >= 3 && !RESERVED.has(candidate)) return candidate;
  const digest = createHash("sha256").update(String(user.id || "missing")).digest("hex").slice(0, 8);
  return `member-${digest}`;
}

export function planUser(user) {
  if (!user || typeof user.id !== "string" || !user.id) return { status: "invalid" };
  if (user.memberDirectoryOptIn !== true) return { status: "not-opted-in" };
  if (user.membershipStatus !== "active" || user.accountStatus === "deactivated" || user.deactivatedAt) return { status: "not-active" };
  if (typeof user.memberProfileSlug === "string" && user.memberProfileSlug) return { status: "already-assigned", slug: user.memberProfileSlug };
  if (typeof user.email !== "string" || !user.email) return { status: "invalid" };
  return { status: "planned", slug: candidateSlug(user) };
}

const profileItem = ({ user, slug, now }) => ({
  pk: `USER#${user.id}`,
  sk: "MEMBER_PROFILE",
  type: "MEMBER_PROFILE",
  ownerUserId: user.id,
  slug,
  name: displayName(user) || "Coalition member",
  headline: null,
  bio: null,
  company: typeof user.company === "string" ? user.company : null,
  jobTitle: typeof user.jobTitle === "string" ? user.jobTitle : null,
  linkedinUrl: safeLinkedInUrl(user.linkedinUrl),
  xHandle: safeXHandle(user.xHandle),
  email: user.email,
  policyInterestGroups: Array.isArray(user.policyInterestGroups) ? user.policyInterestGroups.filter((value) => typeof value === "string") : [],
  status: "published",
  version: 1,
  consentVersion: "member-directory-v1",
  consentedAt: now,
  createdAt: now,
  updatedAt: now,
  retiredSlugs: [],
  GSI1PK: "MEMBER_DIRECTORY#VISIBLE",
  GSI1SK: `${(displayName(user) || "Coalition member").toLowerCase().replace(/\s+/g, " ")}#${slug}`,
});

export async function runBackfill({ options, dependencies, log = () => {} }) {
  const users = await dependencies.listUsers();
  const summary = { scanned: users.length, optedIn: 0, alreadyAssigned: 0, planned: 0, applied: 0, notActive: 0, conflicts: 0, invalid: 0, conditionalRaces: 0 };
  const plannedSlugs = new Set();
  for (const user of users) {
    const plan = planUser(user);
    if (user?.memberDirectoryOptIn === true) summary.optedIn += 1;
    if (plan.status === "not-active") { summary.notActive += 1; continue; }
    if (plan.status === "already-assigned") { summary.alreadyAssigned += 1; continue; }
    if (plan.status !== "planned") { if (plan.status === "invalid") summary.invalid += 1; continue; }
    let slug = plan.slug;
    if (plannedSlugs.has(slug)) {
      slug = `${slug.slice(0, 39)}-${createHash("sha256").update(user.id).digest("hex").slice(0, 8)}`;
    }
    plannedSlugs.add(slug);
    const existing = await dependencies.getClaim(slug);
    if (existing && existing.ownerUserId !== user.id) { summary.conflicts += 1; log({ level: "warn", user: createHash("sha256").update(user.id).digest("hex").slice(0, 12), reason: "slug-conflict" }); continue; }
    summary.planned += 1;
    if (!options.apply) continue;
    try {
      await dependencies.apply({ user, slug, profile: profileItem({ user, slug, now: dependencies.now() }) });
      summary.applied += 1;
    } catch (error) {
      if (error?.name === "TransactionCanceledException" || error?.name === "ConditionalCheckFailedException") summary.conditionalRaces += 1;
      else throw error;
    }
  }
  return summary;
}

export async function createAwsDependencies(options) {
  if (options.profile) process.env.AWS_PROFILE = options.profile;
  const [{ DynamoDBClient }, dynamo] = await Promise.all([import("@aws-sdk/client-dynamodb"), import("@aws-sdk/lib-dynamodb")]);
  const client = dynamo.DynamoDBDocumentClient.from(new DynamoDBClient({ region: options.region }));
  return {
    now: () => new Date().toISOString(),
    async listUsers() {
      const users = []; let ExclusiveStartKey;
      do {
        const result = await client.send(new dynamo.ScanCommand({ TableName: options.tableName, FilterExpression: "#type = :user", ExpressionAttributeNames: { "#type": "type" }, ExpressionAttributeValues: { ":user": "USER" }, ConsistentRead: true, ExclusiveStartKey }));
        users.push(...(result.Items || [])); ExclusiveStartKey = result.LastEvaluatedKey;
      } while (ExclusiveStartKey);
      return users;
    },
    async getClaim(slug) {
      const value = `MEMBER_PROFILE_SLUG#${slug}`;
      const result = await client.send(new dynamo.GetCommand({ TableName: options.tableName, Key: { pk: value, sk: value }, ConsistentRead: true }));
      return result.Item || null;
    },
    async apply({ user, slug, profile }) {
      const now = profile.updatedAt; const claimKey = `MEMBER_PROFILE_SLUG#${slug}`;
      await client.send(new dynamo.TransactWriteCommand({ TransactItems: [
        { Put: { TableName: options.tableName, Item: { pk: claimKey, sk: claimKey, type: "MEMBER_PROFILE_SLUG", slug, ownerUserId: user.id, status: "active", createdAt: now, updatedAt: now }, ConditionExpression: "attribute_not_exists(pk)" } },
        { Put: { TableName: options.tableName, Item: profile, ConditionExpression: "attribute_not_exists(pk)" } },
        { Update: { TableName: options.tableName, Key: { pk: `USER#${user.id}`, sk: `USER#${user.id}` }, UpdateExpression: "SET memberProfileSlug = :slug, memberProfileSlugSource = :source, memberProfileConsentVersion = :consent, memberDirectoryPreferenceUpdatedAt = :now", ConditionExpression: "memberDirectoryOptIn = :yes AND membershipStatus = :active AND attribute_not_exists(memberProfileSlug)", ExpressionAttributeValues: { ":slug": slug, ":source": "migrated", ":consent": "member-directory-v1", ":now": now, ":yes": true, ":active": "active" } } },
      ] }));
    },
  };
}

export async function main(argv = process.argv.slice(2)) {
  let options;
  try { options = parseArgs(argv); } catch (error) { console.error(error.message); console.error(usage()); return 1; }
  if (options.help) { console.log(usage()); return 0; }
  const summary = await runBackfill({ options, dependencies: await createAwsDependencies(options) });
  console.log(JSON.stringify({ mode: options.apply ? "apply" : "dry-run", target: options.app, region: options.region, ...summary }));
  if (!options.apply) console.log("Dry-run only. No DynamoDB writes were attempted.");
  return summary.conflicts || summary.invalid || summary.conditionalRaces ? 2 : 0;
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath === import.meta.url) main().then((code) => { process.exitCode = code; }, (error) => { console.error(`Backfill failed: ${error?.name || "Error"}`); process.exitCode = 1; });
