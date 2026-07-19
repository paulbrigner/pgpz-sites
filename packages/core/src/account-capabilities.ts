export type AccountCapabilitySubject = Readonly<{
  accountStatus?: unknown;
  deactivatedAt?: unknown;
  membershipStatus?: unknown;
  isAdmin?: unknown;
}> | null | undefined;

export type AccountCapabilities = Readonly<{
  accountActive: boolean;
  member: boolean;
  admin: boolean;
  protectedContent: boolean;
}>;

/**
 * Treat legacy records without accountStatus as active, while making either
 * deactivation marker authoritative. This keeps the predicate safe during the
 * accountStatus backfill and prevents a stale membership/admin flag from
 * restoring access.
 */
export function isAccountActive(subject: AccountCapabilitySubject): boolean {
  if (!subject || subject.deactivatedAt) return false;
  return (
    subject.accountStatus === "active" ||
    subject.accountStatus === undefined ||
    subject.accountStatus === null ||
    subject.accountStatus === ""
  );
}

export function canAccessMemberFeatures(subject: AccountCapabilitySubject): boolean {
  return isAccountActive(subject) && subject?.membershipStatus === "active";
}

export function canAccessAdminFeatures(subject: AccountCapabilitySubject): boolean {
  return isAccountActive(subject) && subject?.isAdmin === true;
}

export function canAccessProtectedContent(subject: AccountCapabilitySubject): boolean {
  return canAccessMemberFeatures(subject) || canAccessAdminFeatures(subject);
}

export function accountCapabilitiesFor(subject: AccountCapabilitySubject): AccountCapabilities {
  const accountActive = isAccountActive(subject);
  const member = accountActive && subject?.membershipStatus === "active";
  const admin = accountActive && subject?.isAdmin === true;

  return {
    accountActive,
    member,
    admin,
    protectedContent: member || admin,
  };
}
