import { describe, expect, it } from "vitest";
import { buildBoardRosterMigrationPlan, parseLegacyBoardRosters } from "./board-access-migration";

describe("Board access roster migration", () => {
  it("normalizes four exclusive legacy rosters into stable role records", () => {
    const candidates = parseLegacyBoardRosters({
      BOARD_MEMBER_EMAILS: " Director@pgpz.org admin@pgpz.org ",
      BOARD_ADMIN_EMAILS: "ADMIN@PGPZ.ORG",
      BOARD_EXECUTIVE_DIRECTOR_EMAILS: "div@pgpz.org",
      BOARD_LEGAL_COUNSEL_EMAILS: "legal@pgpz.org",
    });
    expect(candidates.map(({ email, role }) => ({ email, role }))).toEqual([
      { email: "admin@pgpz.org", role: "admin" },
      { email: "director@pgpz.org", role: "member" },
      { email: "div@pgpz.org", role: "executive-director" },
      { email: "legal@pgpz.org", role: "legal-counsel" },
    ]);
    expect(candidates[0].id).toMatch(/^access_[a-f0-9]{24}$/);
  });

  it("rejects overlapping or orphaned roles", () => {
    expect(() => parseLegacyBoardRosters({ BOARD_MEMBER_EMAILS: "a@pgpz.org", BOARD_ADMIN_EMAILS: "b@pgpz.org" })).toThrow(/not a member subset/);
    expect(() => parseLegacyBoardRosters({ BOARD_MEMBER_EMAILS: "a@pgpz.org", BOARD_EXECUTIVE_DIRECTOR_EMAILS: "a@pgpz.org" })).toThrow(/both member and executive-director/);
  });

  it("is idempotent and refuses to silently overwrite divergent records", () => {
    const [candidate] = parseLegacyBoardRosters({ BOARD_MEMBER_EMAILS: "a@pgpz.org" });
    const common = {
      id: candidate.id, email: candidate.email, name: candidate.name, role: candidate.role,
      version: 1, createdAt: "2026-01-01T00:00:00Z", createdBy: "admin@pgpz.org",
      updatedAt: "2026-01-01T00:00:00Z", updatedBy: "admin@pgpz.org",
      activatedAt: "2026-01-01T00:00:00Z", deactivatedAt: null, sessionsRevokedAt: null,
    } as const;
    expect(buildBoardRosterMigrationPlan([candidate], [{ ...common, status: "active" }]).unchanged).toHaveLength(1);
    expect(buildBoardRosterMigrationPlan([candidate], [{ ...common, status: "deactivated" }]).conflicts).toHaveLength(1);
  });
});
