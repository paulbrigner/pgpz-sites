import { canAccessAdminFeatures, canAccessProtectedContent } from "@pgpz/core";

export type ZecShelfUser = {
  accountStatus?: string | null;
  deactivatedAt?: string | null;
  isAdmin?: boolean | null;
  membershipStatus?: string | null;
} | null | undefined;

export function canViewZecShelf(user: ZecShelfUser): boolean {
  return canAccessProtectedContent(user);
}

export function canManageZecShelf(user: ZecShelfUser): boolean {
  return canAccessAdminFeatures(user);
}
