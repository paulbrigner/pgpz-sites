export type ZecShelfUser = {
  isAdmin?: boolean | null;
  membershipStatus?: string | null;
} | null | undefined;

export function canViewZecShelf(user: ZecShelfUser): boolean {
  return user?.isAdmin === true || user?.membershipStatus === "active";
}

export function canManageZecShelf(user: ZecShelfUser): boolean {
  return user?.isAdmin === true;
}
