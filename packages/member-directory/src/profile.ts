export const MEMBER_DIRECTORY_INDEX_PK = "MEMBER_DIRECTORY#VISIBLE";
export const MEMBER_PROFILE_CONSENT_VERSION = "member-directory-v1";

export type MemberProfileStatus = "published" | "hidden";

export type MemberProfileBase = {
  slug: string;
  name: string;
  headline: string | null;
  bio: string | null;
  company: string | null;
  jobTitle: string | null;
  linkedinUrl: string | null;
  xHandle: string | null;
};

export type MemberDirectoryEntry<TExtra extends object = Record<never, never>> =
  MemberProfileBase & TExtra;

const cleanText = (value: unknown, maximum: number) => {
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/\s+/g, " ");
  return text ? text.slice(0, maximum) : null;
};

export function normalizeMemberProfileBase(input: Record<string, unknown>): MemberProfileBase {
  const name = cleanText(input.name, 120);
  if (!name) throw new Error("A display name is required.");
  return {
    slug: String(input.slug || ""),
    name,
    headline: cleanText(input.headline, 160),
    bio: cleanText(input.bio, 500),
    company: cleanText(input.company, 180),
    jobTitle: cleanText(input.jobTitle, 180),
    linkedinUrl: normalizeMemberProfileUrl(input.linkedinUrl, "linkedin.com"),
    xHandle: normalizeXHandle(input.xHandle),
  };
}

export function normalizeMemberProfileUrl(value: unknown, requiredHost?: string) {
  if (typeof value !== "string" || !value.trim()) return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new MemberProfileValidationError("Enter a valid HTTPS URL.");
  }
  if (url.protocol !== "https:") {
    throw new MemberProfileValidationError("Profile links must use HTTPS.");
  }
  if (requiredHost && url.hostname !== requiredHost && !url.hostname.endsWith(`.${requiredHost}`)) {
    throw new MemberProfileValidationError(`Use a ${requiredHost} URL.`);
  }
  return url.toString();
}

export function normalizeXHandle(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const handle = value.trim().replace(/^@/, "");
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) {
    throw new MemberProfileValidationError("Enter a valid X handle.");
  }
  return `@${handle}`;
}

export function memberDirectorySortKey(name: string, slug: string) {
  const normalizedName = name.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
  return `${normalizedName}#${slug}`;
}

// Kept here to avoid callers needing to import validation errors from two modules.
import { MemberProfileValidationError } from "./slug";
