export const ADMIN_MEMBER_PREVIEW_COOKIE = "pgpz_member_preview";

export function isEffectiveAdmin(actualIsAdmin: boolean, viewAsMember: boolean): boolean {
  return actualIsAdmin && !viewAsMember;
}

export function isMemberPreviewCookieValue(value: string | null | undefined): boolean {
  return value === "1";
}
