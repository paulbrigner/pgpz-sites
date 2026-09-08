import { pathToFileURL } from "node:url";
import { DescribeTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { documentClient } from "../lib/dynamodb";
import { AWS_REGION, BOARD_ACCESS_TABLE } from "../lib/config";
import { boardAuditLedger } from "../lib/audit";
import { directorRosterInitializationItem, planDirectorRosterInitialization } from "../lib/director-roster-initialization";

export const APPLY_CONFIRMATION = "INITIALIZE_BOARD_DIRECTOR_ROSTER";
const value = (args: string[], name: string) => args[args.indexOf(name) + 1];
export async function main(args = process.argv.slice(2)) {
  const apply = args.includes("--apply");
  const expectedAccount = args.includes("--expected-account") ? value(args, "--expected-account") : "";
  const expectedTable = args.includes("--expected-table") ? value(args, "--expected-table") : "";
  const actorEmail = args.includes("--actor-email") ? value(args, "--actor-email") : "";
  if (!/^\d{12}$/.test(expectedAccount) || expectedTable !== BOARD_ACCESS_TABLE || !actorEmail?.includes("@")) throw new Error("Supply --expected-account, --expected-table matching BOARD_ACCESS_TABLE, and --actor-email.");
  if (apply && (!args.includes("--confirm") || value(args, "--confirm") !== APPLY_CONFIRMATION)) throw new Error(`Apply requires --confirm ${APPLY_CONFIRMATION}`);
  const metadata = await new DynamoDBClient({ region: AWS_REGION }).send(new DescribeTableCommand({ TableName: BOARD_ACCESS_TABLE }));
  if (metadata.Table?.TableArn !== `arn:aws:dynamodb:${AWS_REGION}:${expectedAccount}:table/${expectedTable}`) throw new Error("The live table ARN does not match the expected account, region, and table.");
  const plan = await planDirectorRosterInitialization(documentClient, BOARD_ACCESS_TABLE);
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", tableArn: metadata.Table.TableArn, alreadyInitialized: plan.alreadyInitialized, directors: plan.roster.directors, previousRevision: plan.previous?.revision || null }, null, 2));
  if (!apply || plan.alreadyInitialized) return;
  const audit = await boardAuditLedger.buildAppendItems({
    category: "account", action: "director_roster_initialized", outcome: "success",
    actor: { type: "authenticated", userId: null, email: actorEmail, role: "migration-operator", capabilities: ["manageBoardUsers"] },
    target: { type: "director-roster", id: "DIRECTOR_ROSTER", version: plan.roster.revision },
    metadata: new Map([["directorCount", plan.roster.directors.length]]), idempotencyKey: `director-roster-initialized:${plan.roster.revision}`, occurredAt: new Date().toISOString(),
  });
  await documentClient.transactWrite({ TransactItems: [directorRosterInitializationItem(BOARD_ACCESS_TABLE, plan), ...audit.TransactItems] as Parameters<typeof documentClient.transactWrite>[0]["TransactItems"] });
  console.log("Director roster initialized. The transaction rejects concurrent director changes; no consent or signature was created.");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { console.error(error instanceof Error ? error.message : "Initialization failed"); process.exitCode = 1; });
