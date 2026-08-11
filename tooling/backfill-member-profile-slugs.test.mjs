import assert from "node:assert/strict";
import test from "node:test";
import { candidateSlug, parseArgs, planUser, runBackfill } from "./backfill-member-profile-slugs.mjs";

const member = (overrides = {}) => ({ id: "user-1", type: "USER", name: "Ada Lovelace", email: "ada@example.com", accountStatus: "active", membershipStatus: "active", memberDirectoryOptIn: true, ...overrides });

test("defaults to a read-only Coalition dry-run", async () => {
  const options = parseArgs(["--app", "coalition"]); let writes = 0;
  const summary = await runBackfill({ options, dependencies: { listUsers: async () => [member()], getClaim: async () => null, apply: async () => { writes += 1; }, now: () => "2026-08-11T00:00:00.000Z" } });
  assert.equal(options.apply, false); assert.equal(summary.planned, 1); assert.equal(writes, 0);
});

test("requires the exact confirmation phrase in apply mode", () => {
  assert.throws(() => parseArgs(["--app", "coalition", "--apply"]), /requires --confirm/);
  assert.equal(parseArgs(["--app", "coalition", "--apply", "--confirm", "BACKFILL-COALITION-MEMBER-PROFILE-SLUGS"]).apply, true);
});

test("plans only active opted-in members and never derives a fallback from email", () => {
  assert.equal(planUser(member({ memberDirectoryOptIn: false })).status, "not-opted-in");
  assert.equal(planUser(member({ membershipStatus: "none" })).status, "not-active");
  assert.equal(candidateSlug(member({ name: "", firstName: "", lastName: "", email: "secret@example.com" })).startsWith("member-"), true);
  assert.equal(candidateSlug(member()).includes("example"), false);
});

test("applies a safe projection transaction through injected dependencies", async () => {
  const options = parseArgs(["--app", "coalition", "--apply", "--confirm", "BACKFILL-COALITION-MEMBER-PROFILE-SLUGS"]); const applied = [];
  const summary = await runBackfill({ options, dependencies: { listUsers: async () => [member()], getClaim: async () => null, apply: async (value) => applied.push(value), now: () => "2026-08-11T00:00:00.000Z" } });
  assert.equal(summary.applied, 1); assert.equal(applied[0].slug, "ada-lovelace"); assert.equal(applied[0].profile.membershipProofPostUrl, undefined);
});
