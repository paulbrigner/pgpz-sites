/**
 * Reconcile active PGPZ Coalition members into the PGPZ Community member table.
 *
 * Dry-run is the default:
 *   REGION_AWS=us-east-1 NEXTAUTH_TABLE=PGPZCoalitionNextAuth npx tsx scripts/sync-coalition-members-to-community.ts
 *
 * Apply writes:
 *   REGION_AWS=us-east-1 NEXTAUTH_TABLE=PGPZCoalitionNextAuth PGPZ_COMMUNITY_NEXTAUTH_TABLE=PGPZCommunityNextAuth npx tsx scripts/sync-coalition-members-to-community.ts --apply
 */
import {
  listActiveCoalitionMembersForCommunitySync,
  syncCoalitionMemberToCommunityById,
  syncCoalitionMemberRecordToCommunity,
  type CommunitySyncStatus,
} from "../lib/community-sync";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const dryRun = !apply;
const json = args.includes("--json");
const limitArg = args.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : null;

const emptySummary = (): Record<CommunitySyncStatus, number> => ({
  created: 0,
  updated: 0,
  already_active: 0,
  skipped: 0,
  conflict: 0,
  failed: 0,
});

async function main() {
  const members = await listActiveCoalitionMembersForCommunitySync();
  const selected = Number.isFinite(limit) && limit && limit > 0 ? members.slice(0, limit) : members;
  const summary = emptySummary();
  const results = [];

  for (const member of selected) {
    const result = dryRun
      ? await syncCoalitionMemberRecordToCommunity(member, {
          dryRun,
          triggeredBy: "coalition_reconciliation",
        })
      : await syncCoalitionMemberToCommunityById({
          userId: member.id,
          triggeredBy: "coalition_reconciliation",
        });
    summary[result.status] += 1;
    results.push(result);
  }

  const payload = {
    mode: dryRun ? "dry-run" : "apply",
    scannedActiveCoalitionMembers: members.length,
    processed: selected.length,
    summary,
    results,
  };

  if (json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`Coalition -> Community sync ${dryRun ? "dry-run" : "apply"}`);
  console.log(`Scanned active coalition members: ${members.length}`);
  console.log(`Processed: ${selected.length}`);
  for (const [status, count] of Object.entries(summary)) {
    console.log(`  ${status}: ${count}`);
  }

  const noteworthy = results.filter((result) => result.status === "conflict" || result.status === "failed");
  if (noteworthy.length) {
    console.log("");
    console.log("Manual review needed:");
    for (const item of noteworthy) {
      console.log(`- ${item.email || item.coalitionUserId || "unknown"}: ${item.message}`);
    }
  }

  if (dryRun) {
    console.log("");
    console.log("No writes were made. Re-run with --apply to create or update community members.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
