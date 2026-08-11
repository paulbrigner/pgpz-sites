import { describe, expect, it } from "vitest";
import {
  emailPreferencesFromUser,
  memberAcceptsEmailCategory,
  preferenceField,
} from "./preferences";

describe("email preferences", () => {
  it("defaults optional categories on and respects explicit opt-outs", () => {
    expect(emailPreferencesFromUser({})).toEqual({
      newsletter: true,
      policyUpdates: true,
      globallySuppressed: false,
      suppressionReason: null,
      canSelfResubscribe: true,
    });
    expect(
      memberAcceptsEmailCategory({ emailNewsletterOptIn: false }, "newsletter"),
    ).toBe(false);
    expect(
      memberAcceptsEmailCategory(
        { emailPolicyUpdateOptIn: false },
        "policy_update",
      ),
    ).toBe(false);
  });

  it("treats global suppression as stronger than category preferences", () => {
    expect(
      emailPreferencesFromUser({
        emailSuppressed: true,
        emailSuppressedReason: "bounce",
        emailNewsletterOptIn: true,
      }),
    ).toMatchObject({
      newsletter: false,
      policyUpdates: false,
      globallySuppressed: true,
      canSelfResubscribe: false,
    });
    expect(
      memberAcceptsEmailCategory({ emailSuppressed: true }, "newsletter"),
    ).toBe(false);
  });

  it("allows self-service recovery only for the legacy newsletter suppression", () => {
    expect(
      emailPreferencesFromUser({
        emailSuppressed: true,
        emailSuppressedReason: "newsletter_unsubscribe",
      }).canSelfResubscribe,
    ).toBe(true);
    expect(preferenceField("policy_update")).toBe("emailPolicyUpdateOptIn");
  });
});
