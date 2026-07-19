import { describe, expect, it } from "vitest";
import {
  accountCapabilitiesFor,
  canAccessAdminFeatures,
  canAccessMemberFeatures,
  canAccessProtectedContent,
  isAccountActive,
} from "./account-capabilities";

describe("account capabilities", () => {
  it.each([
    ["anonymous", null],
    ["explicitly deactivated", { accountStatus: "deactivated", membershipStatus: "active", isAdmin: true }],
    ["unknown account state", { accountStatus: "suspended", membershipStatus: "active", isAdmin: true }],
    ["deactivated by timestamp", { accountStatus: "active", deactivatedAt: "2026-07-19T00:00:00.000Z", membershipStatus: "active", isAdmin: true }],
  ])("denies every capability for %s subjects", (_label, subject) => {
    expect(isAccountActive(subject)).toBe(false);
    expect(canAccessMemberFeatures(subject)).toBe(false);
    expect(canAccessAdminFeatures(subject)).toBe(false);
    expect(canAccessProtectedContent(subject)).toBe(false);
  });

  it("grants member and administrator capabilities independently", () => {
    const member = { accountStatus: "active", membershipStatus: "active", isAdmin: false };
    const admin = { accountStatus: "active", membershipStatus: "none", isAdmin: true };

    expect(accountCapabilitiesFor(member)).toEqual({
      accountActive: true,
      member: true,
      admin: false,
      protectedContent: true,
    });
    expect(accountCapabilitiesFor(admin)).toEqual({
      accountActive: true,
      member: false,
      admin: true,
      protectedContent: true,
    });
  });

  it("keeps legacy records active unless a deactivation marker is present", () => {
    expect(isAccountActive({ membershipStatus: "none" })).toBe(true);
    expect(canAccessMemberFeatures({ membershipStatus: "active" })).toBe(true);
    expect(canAccessAdminFeatures({ isAdmin: true })).toBe(true);
  });
});
