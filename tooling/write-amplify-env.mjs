#!/usr/bin/env node

import {
  chmodSync,
  existsSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const sharedKeys = [
  "NEXT_PUBLIC_SITE_URL",
  "NEXTAUTH_URL",
  "NEXTAUTH_TABLE",
  "NEXTAUTH_SECRET",
  "BETTER_AUTH_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_TRUSTED_ORIGINS",
  "EMAIL_TRACKING_SECRET",
  "REGION_AWS",
  "AWS_REGION",
  "PGPZ_AWS_ACCESS_KEY_ID",
  "PGPZ_AWS_SECRET_ACCESS_KEY",
  "EMAIL_SERVER",
  "EMAIL_SERVER_HOST",
  "EMAIL_SERVER_PORT",
  "EMAIL_SERVER_USER",
  "EMAIL_SERVER_PASSWORD",
  "EMAIL_SERVER_SECURE",
  "EMAIL_FROM",
  "CLOUDFRONT_DOMAIN",
  "KEY_PAIR_ID",
  "PRIVATE_KEY_SECRET",
  "POLICY_UPDATE_UPLOAD_BUCKET",
  "POLICY_UPDATE_UPLOAD_PREFIX",
  "CONTENT_UPLOAD_BUCKET",
  "PGPZ_CONTENT_BUCKET",
];

const applications = {
  community: {
    output: "apps/community/.env.production",
    required: ["NEXTAUTH_TABLE", "REGION_AWS", "X_BEARER_TOKEN", "EMAIL_FROM"],
    keys: [
      ...sharedKeys,
      "X_BEARER_TOKEN",
      "XMON_X_API_BEARER_TOKEN",
      "X_API_BASE_URL",
      "XMON_X_API_BASE_URL",
      "X_API_TIMEOUT_MS",
      "X_PROOF_CHALLENGE_TTL_MINUTES",
      "X_PROOF_RATE_LIMIT_WINDOW_MINUTES",
      "X_PROOF_CHALLENGE_RATE_LIMIT",
      "X_PROOF_VERIFY_RATE_LIMIT",
      "X_PROOF_AUTOVERIFY_WINDOW_MINUTES",
      "X_PROOF_AUTOVERIFY_BATCH_SIZE",
      "X_PROOF_AUTOVERIFY_GROUP_SIZE",
      "X_PROOF_AUTOVERIFY_MAX_ATTEMPTS",
      "SOCIAL_PROOF_AUTOVERIFY_SECRET",
      "AUTOVERIFY_URL",
      "MEMBERSHIP_PROOF_RETENTION_POLICY",
      "MICROLINK_API_KEY",
    ],
  },
  coalition: {
    output: "apps/coalition/.env.production",
    required: ["NEXTAUTH_TABLE", "REGION_AWS", "EMAIL_FROM"],
    keys: [
      ...sharedKeys,
      "PGPZ_COMMUNITY_NEXTAUTH_TABLE",
      "COMMUNITY_NEXTAUTH_TABLE",
    ],
  },
};

const applicationName = process.argv[2];
const application = applications[applicationName];

if (!application) {
  console.error(
    `Usage: node tooling/write-amplify-env.mjs <${Object.keys(applications).join("|")}>`,
  );
  process.exit(2);
}

const missing = application.required.filter((key) => process.env[key] === undefined);
if (missing.length > 0) {
  console.error(
    `Missing required ${applicationName} environment variables: ${missing.join(", ")}`,
  );
  process.exit(1);
}

const values = application.keys.flatMap((key) => {
  const value = process.env[key];
  return value === undefined ? [] : [[key, value]];
});

// Next.js expands dollar-prefixed expressions after parsing dotenv files. Escape
// literal dollar signs, then choose a dotenv quote delimiter that does not occur
// in the value. Refuse ambiguous values rather than silently altering a secret.
const serialize = (key, value) => {
  const escaped = value.replaceAll("$", "\\$");
  if (!value.includes("'")) return `'${escaped}'`;
  if (!value.includes("`")) return `\`${escaped}\``;
  throw new Error(
    `Cannot safely serialize ${key}: its value contains both a single quote and a backtick.`,
  );
};
const contents = `${values.map(([key, value]) => `${key}=${serialize(key, value)}`).join("\n")}\n`;
const output = resolve(repositoryRoot, application.output);
const temporaryOutput = `${output}.${process.pid}.tmp`;

try {
  writeFileSync(temporaryOutput, contents, { encoding: "utf8", mode: 0o600 });
  renameSync(temporaryOutput, output);
  chmodSync(output, 0o600);
} finally {
  if (existsSync(temporaryOutput)) rmSync(temporaryOutput, { force: true });
}

console.log(
  `Wrote ${values.length} allowlisted variables to ${application.output} for ${applicationName}.`,
);
