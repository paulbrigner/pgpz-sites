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
});
