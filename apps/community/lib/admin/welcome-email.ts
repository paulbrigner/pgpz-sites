export const WELCOME_EMAIL_ACTIVE_MEMBERS_ONLY_ERROR =
  "Welcome emails can only be sent to active members";

export function canSendWelcomeEmail(
  member: { membershipStatus?: unknown } | null | undefined,
): boolean {
  return member?.membershipStatus === "active";
}
