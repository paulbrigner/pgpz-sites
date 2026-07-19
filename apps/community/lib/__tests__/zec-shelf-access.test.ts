import { describe, expect, it } from "vitest";
import { canManageZecShelf, canViewZecShelf } from "@/lib/zec-shelf-access";

describe("ZEC Shelf access", () => {
  it("allows active members to view without granting management access", () => {
    const user = { membershipStatus: "active", isAdmin: false };
    expect(canViewZecShelf(user)).toBe(true);
    expect(canManageZecShelf(user)).toBe(false);
  });

  it("allows administrators to view and manage", () => {
    const user = { membershipStatus: "none", isAdmin: true };
    expect(canViewZecShelf(user)).toBe(true);
    expect(canManageZecShelf(user)).toBe(true);
  });

  it("rejects anonymous and inactive users", () => {
    expect(canViewZecShelf(null)).toBe(false);
    expect(canViewZecShelf({ membershipStatus: "none", isAdmin: false })).toBe(false);
  });

  it.each([
    { accountStatus: "deactivated", membershipStatus: "active", isAdmin: false },
    { accountStatus: "deactivated", membershipStatus: "none", isAdmin: true },
    {
      accountStatus: "active",
      deactivatedAt: "2026-07-19T00:00:00.000Z",
      membershipStatus: "active",
      isAdmin: true,
    },
  ])("rejects stale member and admin flags on deactivated accounts", (user) => {
    expect(canViewZecShelf(user)).toBe(false);
    expect(canManageZecShelf(user)).toBe(false);
  });
});
