export const MEMBER_PROFILE_SLUG_MIN_LENGTH = 3;
export const MEMBER_PROFILE_SLUG_MAX_LENGTH = 48;

const DEFAULT_RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "auth",
  "help",
  "home",
  "join",
  "members",
  "new",
  "privacy",
  "profile",
  "resources",
  "settings",
  "signin",
  "signup",
  "support",
  "terms",
  "updates",
]);

export class MemberProfileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MemberProfileValidationError";
  }
}

export function normalizeMemberProfileSlug(value: unknown) {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function assertMemberProfileSlug(
  value: unknown,
  additionalReserved: Iterable<string> = [],
) {
  const slug = normalizeMemberProfileSlug(value);
  if (slug.length < MEMBER_PROFILE_SLUG_MIN_LENGTH || slug.length > MEMBER_PROFILE_SLUG_MAX_LENGTH) {
    throw new MemberProfileValidationError(
      `Profile URLs must be ${MEMBER_PROFILE_SLUG_MIN_LENGTH}-${MEMBER_PROFILE_SLUG_MAX_LENGTH} characters.`,
    );
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new MemberProfileValidationError("Use letters, numbers, and single hyphens only.");
  }
  const reserved = new Set([
    ...DEFAULT_RESERVED_SLUGS,
    ...Array.from(additionalReserved, (entry) => normalizeMemberProfileSlug(entry)),
  ]);
  if (reserved.has(slug)) {
    throw new MemberProfileValidationError("That profile URL is reserved.");
  }
  return slug;
}

export function memberProfileSlugKey(slug: string) {
  const value = `MEMBER_PROFILE_SLUG#${slug}`;
  return { pk: value, sk: value };
}

export function memberProfileKey(userId: string) {
  return { pk: `USER#${userId}`, sk: "MEMBER_PROFILE" };
}

export function suggestedMemberProfileSlug(displayName: unknown, fallback: string) {
  const candidate = normalizeMemberProfileSlug(displayName);
  if (candidate.length >= MEMBER_PROFILE_SLUG_MIN_LENGTH && !DEFAULT_RESERVED_SLUGS.has(candidate)) {
    return candidate.slice(0, MEMBER_PROFILE_SLUG_MAX_LENGTH).replace(/-+$/g, "");
  }
  const suffix = normalizeMemberProfileSlug(fallback).slice(0, 16) || "member";
  return `member-${suffix}`.slice(0, MEMBER_PROFILE_SLUG_MAX_LENGTH);
}
