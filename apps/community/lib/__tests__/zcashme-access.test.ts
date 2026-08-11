import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { evaluateZcashMeAccess, parseZcashMeAllowedEmails } from "@/lib/zcashme-access";

const user = {
  email: "Canary@Example.com",
  isAdmin: false,
  membershipStatus: "none",
  accountStatus: "active",
};

describe("ZcashMe rollout access", () => {
  it("normalizes allowlist separators and email casing", () => {
    expect(parseZcashMeAllowedEmails(" One@example.com, TWO@example.com;three@example.com "))
      .toEqual(new Set(["one@example.com", "two@example.com", "three@example.com"]));
  });

  it("fails closed when the canary allowlist is empty", () => {
    expect(evaluateZcashMeAccess(user, {
      verificationEnabled: true,
      allowedEmails: "",
      adminDryRunEnabled: false,
    })).toEqual({ canActivate: false, canAdminDryRun: false });
  });

  it("allows only an exact canary email when activation is enabled", () => {
    expect(evaluateZcashMeAccess(user, {
      verificationEnabled: true,
      allowedEmails: "other@example.com, canary@example.com",
      adminDryRunEnabled: false,
    }).canActivate).toBe(true);
  });

  it("allows an active administrator to dry run without allowing activation", () => {
    expect(evaluateZcashMeAccess({ ...user, isAdmin: true, membershipStatus: "active" }, {
      verificationEnabled: true,
      allowedEmails: "",
      adminDryRunEnabled: true,
    })).toEqual({ canActivate: false, canAdminDryRun: true });
  });

  it("denies both modes to a deactivated account", () => {
    expect(evaluateZcashMeAccess({ ...user, isAdmin: true, accountStatus: "deactivated" }, {
      verificationEnabled: true,
      allowedEmails: "canary@example.com",
      adminDryRunEnabled: true,
    })).toEqual({ canActivate: false, canAdminDryRun: false });
  });
});
