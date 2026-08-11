import "server-only";

import { createHash } from "node:crypto";
import { canAccessMemberFeatures } from "@pgpz/core";
import {
  assertMemberProfileSlug,
  MEMBER_DIRECTORY_INDEX_PK,
  MEMBER_PROFILE_CONSENT_VERSION,
  memberDirectorySortKey,
  memberProfileKey,
  memberProfileSlugKey,
  normalizeMemberProfileBase,
  suggestedMemberProfileSlug,
  type MemberDirectoryEntry,
} from "@pgpz/member-directory";
import { documentClient, TABLE_NAME } from "@/lib/dynamodb";
import { getAppUserById, userKey } from "@/lib/app-users";
import { normalizePolicyInterestGroups, type PolicyInterestGroupId } from "@/lib/policy-interest-groups";
import { getUserDisplayName } from "@/lib/user-display-name";

type RawRecord = Record<string, any>;

const safeLinkedInUrl = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || (url.hostname !== "linkedin.com" && !url.hostname.endsWith(".linkedin.com"))) return null;
    return url.toString();
  } catch { return null; }
};

const safeXHandle = (value: unknown) => {
  if (typeof value !== "string") return null;
  const handle = value.trim().replace(/^@/, "");
  return /^[A-Za-z0-9_]{1,15}$/.test(handle) ? `@${handle}` : null;
};

export type CoalitionMemberProfile = MemberDirectoryEntry<{
  email: string;
  policyInterestGroups: PolicyInterestGroupId[];
}>;

export type OwnerMemberProfile = {
  eligible: boolean;
  published: boolean;
  slug: string;
  suggestedSlug: string;
  profilePath: string | null;
  version: number;
};

const isEffectivelyVisible = (user: RawRecord | null, profile: RawRecord | null) =>
  !!user &&
  !!profile &&
  canAccessMemberFeatures(user) &&
  user.memberDirectoryOptIn === true &&
  user.memberProfileSlug === profile.slug &&
  profile.status === "published" &&
  !profile.adminHiddenAt;

const profileFromUser = (user: RawRecord, slug: string): CoalitionMemberProfile => ({
  ...normalizeMemberProfileBase({
    slug,
    name: getUserDisplayName(user) || "Coalition member",
    headline: null,
    bio: null,
    company: user.company,
    jobTitle: user.jobTitle,
    linkedinUrl: safeLinkedInUrl(user.linkedinUrl),
    xHandle: safeXHandle(user.xHandle),
  }),
  email: typeof user.email === "string" ? user.email : "",
  policyInterestGroups: normalizePolicyInterestGroups(user.policyInterestGroups),
});

const toMemberProfile = (item: RawRecord): CoalitionMemberProfile => ({
  ...normalizeMemberProfileBase(item),
  email: typeof item.email === "string" ? item.email : "",
  policyInterestGroups: normalizePolicyInterestGroups(item.policyInterestGroups),
});

export async function getOwnerMemberProfile(userId: string): Promise<OwnerMemberProfile> {
  const [user, profileResult] = await Promise.all([
    getAppUserById(userId, { consistentRead: true }),
    documentClient.get({ TableName: TABLE_NAME, Key: memberProfileKey(userId), ConsistentRead: true }),
  ]);
  const profile = (profileResult.Item as RawRecord | undefined) || null;
  const suggestedSlug = suggestedMemberProfileSlug(
    getUserDisplayName(user || {}),
    String(user?.id || userId).replace(/[^a-zA-Z0-9]/g, "").slice(-12),
  );
  const slug = typeof profile?.slug === "string"
    ? profile.slug
    : typeof user?.memberProfileSlug === "string"
      ? user.memberProfileSlug
      : suggestedSlug;
  return {
    eligible: canAccessMemberFeatures(user as RawRecord | null),
    published: user?.memberDirectoryOptIn === true,
    slug,
    suggestedSlug,
    profilePath: isEffectivelyVisible(user, profile) ? `/members/${slug}` : null,
    version: typeof profile?.version === "number" ? profile.version : 0,
  };
}

export async function saveOwnerMemberProfile({
  userId,
  slug: rawSlug,
  publish,
  expectedVersion,
  source = "member_selected",
}: {
  userId: string;
  slug: unknown;
  publish: boolean;
  expectedVersion: number;
  source?: "member_selected" | "generated" | "migrated";
}) {
  const user = await getAppUserById(userId, { consistentRead: true });
  if (!user?.id) throw new Error("Account not found.");
  if (publish && !canAccessMemberFeatures(user as RawRecord)) {
    throw new Error("Active membership is required to publish a member profile.");
  }
  const currentResult = await documentClient.get({
    TableName: TABLE_NAME,
    Key: memberProfileKey(userId),
    ConsistentRead: true,
  });
  const current = (currentResult.Item as RawRecord | undefined) || null;
  if (!publish && !current && !user.memberProfileSlug) {
    await documentClient.update({
      TableName: TABLE_NAME,
      Key: userKey(userId),
      UpdateExpression: "SET memberDirectoryOptIn = :hidden, memberDirectoryPreferenceUpdatedAt = :now",
      ExpressionAttributeValues: { ":hidden": false, ":now": new Date().toISOString() },
    });
    return getOwnerMemberProfile(userId);
  }

  const slug = publish
    ? assertMemberProfileSlug(rawSlug || current?.slug || user.memberProfileSlug)
    : assertMemberProfileSlug(current?.slug || user.memberProfileSlug);
  const profile = profileFromUser(user, slug);
  if (!profile.email) throw new Error("An email address is required for the Coalition directory.");
  const now = new Date().toISOString();
  const nextVersion = (typeof current?.version === "number" ? current.version : 0) + 1;
  const previousSlug = typeof current?.slug === "string" ? current.slug : null;
  const item: RawRecord = {
    ...memberProfileKey(userId),
    type: "MEMBER_PROFILE",
    ownerUserId: userId,
    ...profile,
    status: publish ? "published" : "hidden",
    version: nextVersion,
    consentVersion: MEMBER_PROFILE_CONSENT_VERSION,
    consentedAt: publish ? now : current?.consentedAt || null,
    createdAt: current?.createdAt || now,
    updatedAt: now,
    retiredSlugs: previousSlug && previousSlug !== slug
      ? [...new Set([...(Array.isArray(current?.retiredSlugs) ? current.retiredSlugs : []), previousSlug])]
      : Array.isArray(current?.retiredSlugs) ? current.retiredSlugs : [],
    ...(publish ? {
      GSI1PK: MEMBER_DIRECTORY_INDEX_PK,
      GSI1SK: memberDirectorySortKey(profile.name, slug),
    } : {}),
  };
  const transactItems: RawRecord[] = [
    {
      Put: {
        TableName: TABLE_NAME,
        Item: {
          ...memberProfileSlugKey(slug),
          type: "MEMBER_PROFILE_SLUG",
          slug,
          ownerUserId: userId,
          status: publish ? "active" : "reserved",
          createdAt: now,
          updatedAt: now,
        },
        ConditionExpression: "attribute_not_exists(#pk) OR ownerUserId = :ownerUserId",
        ExpressionAttributeNames: { "#pk": "pk" },
        ExpressionAttributeValues: { ":ownerUserId": userId },
      },
    },
    {
      Put: {
        TableName: TABLE_NAME,
        Item: item,
        ConditionExpression: "attribute_not_exists(#pk) OR #version = :expectedVersion",
        ExpressionAttributeNames: { "#pk": "pk", "#version": "version" },
        ExpressionAttributeValues: { ":expectedVersion": expectedVersion },
      },
    },
    {
      Update: {
        TableName: TABLE_NAME,
        Key: userKey(userId),
        UpdateExpression: "SET memberDirectoryOptIn = :publish, memberProfileSlug = :slug, memberProfileSlugSource = :source, memberProfileConsentVersion = :consentVersion, memberDirectoryPreferenceUpdatedAt = :now",
        ConditionExpression: publish
          ? "attribute_exists(#pk) AND membershipStatus = :active AND attribute_not_exists(deactivatedAt)"
          : "attribute_exists(#pk)",
        ExpressionAttributeNames: { "#pk": "pk" },
        ExpressionAttributeValues: {
          ":publish": publish,
          ":slug": slug,
          ":source": source,
          ":consentVersion": MEMBER_PROFILE_CONSENT_VERSION,
          ":now": now,
          ...(publish ? { ":active": "active" } : {}),
        },
      },
    },
  ];
  if (previousSlug && previousSlug !== slug) {
    transactItems.push({
      Update: {
        TableName: TABLE_NAME,
        Key: memberProfileSlugKey(previousSlug),
        UpdateExpression: "SET #status = :retired, updatedAt = :now",
        ConditionExpression: "ownerUserId = :ownerUserId",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":retired": "retired", ":now": now, ":ownerUserId": userId },
      },
    });
  }
  await documentClient.transactWrite({ TransactItems: transactItems });
  return getOwnerMemberProfile(userId);
}

export async function resolveVisibleMemberProfile(slugValue: unknown) {
  const slug = assertMemberProfileSlug(slugValue);
  const claimResult = await documentClient.get({
    TableName: TABLE_NAME,
    Key: memberProfileSlugKey(slug),
    ConsistentRead: true,
  });
  const claim = (claimResult.Item as RawRecord | undefined) || null;
  if (!claim || claim.status !== "active" || typeof claim.ownerUserId !== "string") return null;
  const [profileResult, user] = await Promise.all([
    documentClient.get({ TableName: TABLE_NAME, Key: memberProfileKey(claim.ownerUserId), ConsistentRead: true }),
    getAppUserById(claim.ownerUserId, { consistentRead: true }),
  ]);
  const profile = (profileResult.Item as RawRecord | undefined) || null;
  return isEffectivelyVisible(user, profile) ? toMemberProfile(profile as RawRecord) : null;
}

export async function refreshMemberProfileProjection(userId: string) {
  const [user, profileResult] = await Promise.all([
    getAppUserById(userId, { consistentRead: true }),
    documentClient.get({ TableName: TABLE_NAME, Key: memberProfileKey(userId), ConsistentRead: true }),
  ]);
  const current = (profileResult.Item as RawRecord | undefined) || null;
  if (!user || !current || !isEffectivelyVisible(user, current)) return;
  const profile = profileFromUser(user, current.slug);
  await documentClient.update({
    TableName: TABLE_NAME,
    Key: memberProfileKey(userId),
    UpdateExpression: "SET #name = :name, email = :email, company = :company, jobTitle = :jobTitle, linkedinUrl = :linkedinUrl, xHandle = :xHandle, policyInterestGroups = :groups, GSI1SK = :sortKey, updatedAt = :now",
    ExpressionAttributeNames: { "#name": "name" },
    ExpressionAttributeValues: {
      ":name": profile.name,
      ":email": profile.email,
      ":company": profile.company,
      ":jobTitle": profile.jobTitle,
      ":linkedinUrl": profile.linkedinUrl,
      ":xHandle": profile.xHandle,
      ":groups": profile.policyInterestGroups,
      ":sortKey": memberDirectorySortKey(profile.name, profile.slug),
      ":now": new Date().toISOString(),
    },
  });
}

export async function hideMemberProfileForUser(userId: string, preserveConsent = true) {
  const now = new Date().toISOString();
  await documentClient.update({
    TableName: TABLE_NAME,
    Key: memberProfileKey(userId),
    UpdateExpression: "SET #status = :hidden, updatedAt = :now REMOVE GSI1PK, GSI1SK",
    ConditionExpression: "attribute_exists(#pk)",
    ExpressionAttributeNames: { "#pk": "pk", "#status": "status" },
    ExpressionAttributeValues: { ":hidden": "hidden", ":now": now },
  }).catch(() => undefined);
  if (!preserveConsent) {
    await documentClient.update({
      TableName: TABLE_NAME,
      Key: userKey(userId),
      UpdateExpression: "SET memberDirectoryOptIn = :hidden, memberDirectoryPreferenceUpdatedAt = :now",
      ExpressionAttributeValues: { ":hidden": false, ":now": now },
    });
  }
}

export async function deleteMemberProfileArtifacts(userId: string) {
  const result = await documentClient.get({ TableName: TABLE_NAME, Key: memberProfileKey(userId), ConsistentRead: true });
  const profile = (result.Item as RawRecord | undefined) || null;
  const slugs = new Set<string>([
    ...(typeof profile?.slug === "string" ? [profile.slug] : []),
    ...(Array.isArray(profile?.retiredSlugs) ? profile.retiredSlugs.filter((value: unknown): value is string => typeof value === "string") : []),
  ]);
  await Promise.all([...slugs].map((slug) => documentClient.delete({
    TableName: TABLE_NAME,
    Key: memberProfileSlugKey(slug),
    ConditionExpression: "ownerUserId = :ownerUserId",
    ExpressionAttributeValues: { ":ownerUserId": userId },
  }).catch(() => undefined)));
}

export async function ensureMemberProfileForActiveOptIn(userId: string) {
  const user = await getAppUserById(userId, { consistentRead: true });
  if (!user || !canAccessMemberFeatures(user as RawRecord) || user.memberDirectoryOptIn !== true) return null;
  const owner = await getOwnerMemberProfile(userId);
  if (owner.profilePath) return owner;
  try {
    return await saveOwnerMemberProfile({
      userId,
      slug: owner.slug,
      publish: true,
      expectedVersion: owner.version,
      source: "generated",
    });
  } catch (error: any) {
    if (error?.name !== "TransactionCanceledException" && error?.name !== "ConditionalCheckFailedException") throw error;
    const digest = createHash("sha256").update(userId).digest("hex").slice(0, 8);
    return saveOwnerMemberProfile({
      userId,
      slug: `${owner.suggestedSlug.slice(0, 39).replace(/-+$/g, "")}-${digest}`,
      publish: true,
      expectedVersion: owner.version,
      source: "generated",
    });
  }
}
