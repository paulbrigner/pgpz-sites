import type {
  MemberEmailCategory,
  MemberEmailPreferences,
  RawEmailPreferenceUser,
} from "./contracts";

export const preferenceField = (category: MemberEmailCategory) =>
  category === "newsletter" ? "emailNewsletterOptIn" : "emailPolicyUpdateOptIn";

export function memberAcceptsEmailCategory(
  user: RawEmailPreferenceUser,
  category: MemberEmailCategory,
) {
  if (user.emailSuppressed === true) return false;
  return user[preferenceField(category)] !== false;
}

export function emailPreferencesFromUser(
  user: RawEmailPreferenceUser,
): MemberEmailPreferences {
  const globallySuppressed = user.emailSuppressed === true;
  const suppressionReason =
    typeof user.emailSuppressedReason === "string"
      ? user.emailSuppressedReason
      : null;

  return {
    newsletter: !globallySuppressed && user.emailNewsletterOptIn !== false,
    policyUpdates: !globallySuppressed && user.emailPolicyUpdateOptIn !== false,
    globallySuppressed,
    suppressionReason,
    canSelfResubscribe:
      !globallySuppressed || suppressionReason === "newsletter_unsubscribe",
  };
}
