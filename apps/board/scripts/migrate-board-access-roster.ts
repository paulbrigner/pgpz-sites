import { pathToFileURL } from "node:url";
import { boardAccessRepository } from "../lib/board-access-repository";
import { buildBoardRosterMigrationPlan, parseLegacyBoardRosters } from "../lib/board-access-migration";
import { boardAuditLedger } from "../lib/audit";

export const APPLY_CONFIRMATION = "MIGRATE_BOARD_ACCESS_ROSTER";

function valueAfter(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function listAll() {
  const records = [];
  let cursor: Record<string, unknown> | undefined;
  do {
    const page = await boardAccessRepository.list({ cursor, limit: 250 });
    records.push(...page.records);
    cursor = page.cursor || undefined;
  } while (cursor);
  return records;
}

export async function main(args = process.argv.slice(2), env = process.env) {
  const apply = args.includes("--apply");
  const confirmation = valueAfter(args, "--confirm");
  const actorEmail = valueAfter(args, "--actor-email")?.trim().toLowerCase();
  if (!actorEmail) throw new Error("--actor-email is required for a traceable migration plan");
  if (apply && confirmation !== APPLY_CONFIRMATION) {
    throw new Error(`Apply requires --confirm ${APPLY_CONFIRMATION}`);
  }

  const candidates = parseLegacyBoardRosters(env);
  const plan = buildBoardRosterMigrationPlan(candidates, await listAll());
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", ...plan }, null, 2));
  if (!apply) return plan;
  if (plan.conflicts.length) throw new Error("Migration has divergent access records; resolve conflicts before apply");

  for (const candidate of plan.creates) {
    const occurredAt = new Date().toISOString();
    const mutation = boardAccessRepository.buildCreateItems({
      ...candidate,
      status: "active",
      actorEmail,
      reason: "Legacy Board environment roster migration",
      occurredAt,
    });
    const audit = await boardAuditLedger.buildAppendItems({
      category: "account",
      action: "board_access_migrated",
      outcome: "success",
      actor: { type: "authenticated", userId: null, email: actorEmail, role: "migration-operator", capabilities: ["manageBoardUsers"] },
      target: { type: "board_access", id: candidate.id, version: "1" },
      metadata: new Map([["email", candidate.email], ["role", candidate.role]]),
      idempotencyKey: `board-access-roster-migration:${candidate.email}`,
      occurredAt,
    });
    await boardAccessRepository.execute(mutation, { additionalTransactItems: audit.TransactItems as Record<string, unknown>[] });
  }
  return plan;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
