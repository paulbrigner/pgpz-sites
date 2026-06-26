import { describe, expect, it } from "vitest";

import { policyUpdateEmailSubjectForTitle } from "@/lib/policy-update-subject";

describe("policyUpdateEmailSubjectForTitle", () => {
  it("does not duplicate category labels already present in parsed titles", () => {
    expect(policyUpdateEmailSubjectForTitle("weekly", "Weekly Policy Memo: Week of June 22, 2026")).toBe(
      "PGPZ Weekly Policy Memo: Week of June 22, 2026",
    );
    expect(policyUpdateEmailSubjectForTitle("special", "Special Update: FinCEN/OFAC Stablecoin NPRM")).toBe(
      "PGPZ Special Update: FinCEN/OFAC Stablecoin NPRM",
    );
  });
});
