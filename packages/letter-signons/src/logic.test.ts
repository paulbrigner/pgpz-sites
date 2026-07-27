import { describe, expect, it } from "vitest";
import {
  acceptanceCoversCurrentRevision,
  defaultLetterAcceptanceText,
  effectiveLetterCampaignStatus,
  normalizeLetterSlug,
  normalizeSignerIdentity,
} from "./index";

describe("letter sign-on contracts", () => {
  it("closes an open campaign at the server-enforced deadline", () => {
    expect(
      effectiveLetterCampaignStatus(
        { status: "open", deadlineAt: "2026-07-31T16:00:00.000Z" },
        new Date("2026-07-31T16:00:00.000Z"),
      ),
    ).toBe("closed");
  });

  it("keeps non-open lifecycle states explicit", () => {
    expect(
      effectiveLetterCampaignStatus(
        { status: "delivered", deadlineAt: "2026-07-01T00:00:00.000Z" },
        new Date("2026-08-01T00:00:00.000Z"),
      ),
    ).toBe("delivered");
  });

  it("requires reconfirmation only after a material revision", () => {
    const revisions = [
      { version: 1, changeType: "initial" as const },
      { version: 2, changeType: "minor" as const },
      { version: 3, changeType: "material" as const },
    ];
    expect(
      acceptanceCoversCurrentRevision({
        revisions,
        acceptedVersion: 1,
        currentVersion: 2,
      }),
    ).toBe(true);
    expect(
      acceptanceCoversCurrentRevision({
        revisions,
        acceptedVersion: 1,
        currentVersion: 3,
      }),
    ).toBe(false);
  });

  it("normalizes URLs and validates organization signers", () => {
    expect(normalizeLetterSlug(" CLARITY Act / Zcash Coalition ")).toBe(
      "clarity-act-zcash-coalition",
    );
    expect(() =>
      normalizeSignerIdentity({
        signerKind: "organization",
        displayName: "Authorized Person",
      }),
    ).toThrow(/organization/i);
  });

  it("builds an exact-version acceptance statement", () => {
    expect(
      defaultLetterAcceptanceText({
        title: "Support for H.R. 3633",
        documentVersion: 2,
      }),
    ).toContain("version 2");
  });
});
