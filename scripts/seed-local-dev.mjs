#!/usr/bin/env node
/**
 * Seed local DynamoDB Local so paul@paulbrigner.com can sign in as an admin.
 *
 * Requires the Docker Compose stack to be running first:
 *   docker compose up -d
 *
 * Then run (from the repo root):
 *   npm run seed:local
 *
 * What this does per app:
 *   board     - creates PGPZBoardNextAuth table and provisions paul@paulbrigner.com
 *               as an email+password account. Admin is decided by the env
 *               allowlists BOARD_MEMBER_EMAILS + BOARD_ADMIN_EMAILS (see
 *               apps/board/.env.local.example), so make sure his address is on
 *               both before `npm run dev:board`.
 *   community - creates PGPZCommunityNextAuth table only. Community uses email
 *               magic-link auth; Better Auth mints its own user record on first
 *               successful sign-in, so the account cannot be pre-created here.
 *               After paul signs in once via a MailHog link, run:
 *                 npm run admin:community -- paul@paulbrigner.com
 *   coalition - same as community (PGPZCoalitionNextAuth table).
 *
 * Usage:
 *   node scripts/seed-local-dev.mjs [--app board|community|coalition] [--password SECRET]
 *
 * Options:
 *   --app <name>     Seed only one app instead of all three.
 *   --password <s>   Board account password (default: a generated value printed
 *                    to stdout). Must be >= 12 chars.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DDB_ENDPOINT = process.env.AWS_ENDPOINT_URL_DYNAMODB || "http://localhost:8000";
const REGION = process.env.REGION_AWS || "us-east-1";

// DynamoDB Local ignores the credential values but still requires them to be
// present, otherwise the AWS SDK's default provider chain fails with
// CredentialsProviderError instead of reaching the emulator. The `dummy`
// pair is the widely-used local key; some emulator versions reject IAM-shaped
// keys and validate against a real account.
const DDB_LOCAL_ACCESS_KEY = "dummy";
const DDB_LOCAL_SECRET_KEY = "dummy";

// Shared env for every child AWS call so the SDK clients hit DynamoDB Local
// with self-contained dummy credentials.
function awsEnv() {
  return {
    ...process.env,
    AWS_ENDPOINT_URL_DYNAMODB: DDB_ENDPOINT,
    REGION_AWS: REGION,
    AWS_REGION: REGION,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID || DDB_LOCAL_ACCESS_KEY,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY || DDB_LOCAL_SECRET_KEY,
  };
}

const APPS = [
  { name: "community", table: "PGPZCommunityNextAuth" },
  { name: "coalition", table: "PGPZCoalitionNextAuth" },
];

// Board's auth table uses the same better-auth schema (pk/sk + GSI1/GSI2) as
// community/coalition, so it is created with the identical script.
const BOARD = { name: "board", table: "PGPZBoardNextAuth" };

function run(cmd, args) {
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    env: awsEnv(),
    stdio: "inherit",
  });
  if (result.status !== 0) {
    console.error(`[seed] Command failed (${cmd} ${args.join(" ")})`);
    process.exit(result.status ?? 1);
  }
}

function createTables(appName, tableName) {
  const script = resolve(ROOT, `apps/${appName}/scripts/setup/create-dynamodb-tables.mjs`);
  if (!existsSync(script)) {
    console.error(`[seed] Missing table setup script: ${script}`);
    process.exit(1);
  }
  run("node", [script, "--region", REGION, "--nextauth-table", tableName]);
}

function provisionBoard(email, password) {
  const script = resolve(ROOT, "apps/board/scripts/provision-board-member.ts");
  if (!existsSync(script)) {
    console.error(`[seed] Missing board provisioner: ${script}`);
    process.exit(1);
  }
  const args = [script, email];
  if (password) {
    args.push("--name", "Paul Brigner", "--password", password, "--show-password");
  } else {
    // Without a pinned password the script generates one and prints it once.
    args.push("--name", "Paul Brigner", "--show-password");
  }
  run("npx", ["tsx", ...args]);
}

function createBoardAccessTable() {
  const script = resolve(ROOT, "apps/board/scripts/setup/create-access-table.mjs");
  run("node", [script, "--region", REGION, "--access-table", "PGPZBoardAccess"]);
}

function parseArgs(argv) {
  const out = { app: null, password: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--app" && argv[i + 1]) {
      out.app = argv[i + 1];
      i += 1;
    } else if (argv[i] === "--password" && argv[i + 1]) {
      out.password = argv[i + 1];
      i += 1;
    }
  }
  return out;
}

function main() {
  const { app, password } = parseArgs(process.argv.slice(2));
  const email = "paul@paulbrigner.com";
  if (app && !["board", "community", "coalition"].includes(app)) {
    console.error("[seed] Unknown --app. Expected board | community | coalition.");
    process.exit(2);
  }

  const targets = app ? [app, BOARD.name] : ["board", ...APPS.map((a) => a.name)];
  for (const name of targets) {
    if (!["community", "coalition"].includes(name)) continue; // board handled below
    const meta = APPS.find((a) => a.name === name);
    console.log(`\n[seed] Creating ${meta.table} table...`);
    createTables(name, meta.table);
  }

  if (!app || app === "board") {
    // Always ensure the board auth table exists before provisioning.
    console.log(`\n[seed] Creating ${BOARD.table} table...`);
    createTables("community", BOARD.table);
    console.log("\n[seed] Creating PGPZBoardAccess table...");
    createBoardAccessTable();
    console.log("\n[seed] Provisioning board account for paul@paulbrigner.com...");
    provisionBoard(email, password);
  } else {
    // Only one non-board app was requested; skip the board step entirely.
    console.log(
      `\n[seed] Skipped board provisioning (--app ${app}). Run without --app to seed it too.`,
    );
  }

  console.log("\n[seed] Done.");
}

main();
