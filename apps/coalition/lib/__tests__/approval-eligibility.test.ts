import { describe, expect, it } from "vitest";
import { getAdminApprovalEligibility } from "@/lib/admin/approval-eligibility";

describe("Coalition admin approval eligibility", () => {
  it("distinguishes requested applications from guarded admin overrides", () => {
    expect(
      getAdminApprovalEligibility({
        accountStatus: "active",
        membershipStatus: "none",
        manualApprovalStatus: "pending",
        applicationStatus: "requested",
      }),
    ).toBe("requested");

    expect(
      getAdminApprovalEligibility({
        accountStatus: "active",
        membershipStatus: "none",
        manualApprovalStatus: "none",
        applicationStatus: "none",
      }),
    ).toBe("unsubmitted_override");
  });

  it.each([
    { accountStatus: "deactivated", membershipStatus: "none" },
    { deactivatedAt: "2026-07-27T00:00:00.000Z", membershipStatus: "none" },
    { membershipStatus: "active", applicationStatus: "requested" },
    { membershipStatus: "invited", applicationStatus: "requested" },
    { membershipStatus: "none", applicationStatus: "declined" },
    { membershipStatus: "none", applicationStatus: "withdrawn" },
  ])("keeps ineligible lifecycle states out of both approval paths", (state) => {
    expect(getAdminApprovalEligibility(state)).toBe("ineligible");
  });
});
