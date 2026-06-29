import "server-only";

import { createHash } from "crypto";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { documentClient, TABLE_NAME } from "@/lib/dynamodb";
import { SITE_URL } from "@/lib/config";
import { normalizeEmail } from "@/lib/app-users";
import { getUserDisplayName } from "@/lib/user-display-name";
import { normalizeReferralCode } from "@/lib/referral-code";

type RawUser = Record<string, any> & {
  id?: string;
  email?: string | null;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  membershipStatus?: "active" | "none" | null;
  accountStatus?: "active" | "deactivated" | null;
  createdAt?: string | null;
  referralCode?: string | null;
  referredByUserId?: string | null;
  referralCreditedAt?: string | null;
};

type ReferralCodeRecord = {
  code: string;
  userId: string;
  email: string | null;
  name: string | null;
  createdAt: string;
};

type ReferralCreditRecord = {
  type: "REFERRAL_CREDIT";
  referralCode: string;
  referrerUserId: string;
  referrerEmail: string | null;
  referrerName: string | null;
  referredUserId: string;
  referredEmail: string | null;
  referredName: string | null;
  signupProfileId: string | null;
  creditedAt: string;
  pendingSignupCreatedAt: string | null;
};

export type ReferralCreditPreview = {
  referredUserId: string;
  referredEmail: string | null;
  referredName: string | null;
  membershipStatus: "active" | "none";
  creditedAt: string;
};

export type ReferralMemberSummary = {
  referralCode: string;
  referralUrl: string;
  creditedSignupCount: number;
  activeRecruitCount: number;
  recentCredits: ReferralCreditPreview[];
};

export type ReferralLeaderboardEntry = {
  referrerUserId: string;
  referrerEmail: string | null;
  referrerName: string | null;
  referralCode: string | null;
  referralUrl: string | null;
  creditedSignupCount: number;
  activeRecruitCount: number;
  lastCreditAt: string | null;
};

export type ReferralAdminReport = {
  leaderboard: ReferralLeaderboardEntry[];
  credits: Array<ReferralCreditPreview & {
    referralCode: string;
    referrerUserId: string;
    referrerEmail: string | null;
    referrerName: string | null;
  }>;
  meta: {
    totalCredits: number;
    activeRecruitCount: number;
    uniqueReferrers: number;
  };
};

const userKey = (userId: string) => ({ pk: `USER#${userId}`, sk: `USER#${userId}` });
const referralCodeKey = (code: string) => ({
  pk: `REFERRAL_CODE#${code}`,
  sk: `REFERRAL_CODE#${code}`,
});
const referralCreditKey = (referredUserId: string) => ({
  pk: `REFERRAL_CREDIT#${referredUserId}`,
  sk: `REFERRAL_CREDIT#${referredUserId}`,
});

const textOrNull = (value: unknown) => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || null;
};

const isConditionalFailure = (err: unknown) =>
  err instanceof ConditionalCheckFailedException ||
  (err as any)?.name === "ConditionalCheckFailedException";

const referralUrlForCode = (code: string) => {
  const url = new URL("/", SITE_URL || "https://community.pgpz.org");
  url.searchParams.set("ref", code);
  return url.toString();
};

const generateReferralCode = (userId: string, attempt: number) =>
  createHash("sha256")
    .update(`pgpz-community-referral:${userId}:${attempt}`)
    .digest("hex")
    .slice(0, 12);

async function getUser(userId: string, projection?: string): Promise<RawUser | null> {
  const trimmedUserId = typeof userId === "string" ? userId.trim() : "";
  if (!trimmedUserId) return null;
  const res = await documentClient.get({
    TableName: TABLE_NAME,
    Key: userKey(trimmedUserId),
    ...(projection ? { ProjectionExpression: projection } : {}),
    ...(projection?.includes("#name") ? { ExpressionAttributeNames: { "#name": "name" } } : {}),
  });
  return (res.Item as RawUser | undefined) || null;
}

async function upsertReferralCodeRecord(user: RawUser, code: string) {
  const now = new Date().toISOString();
  await documentClient.put({
    TableName: TABLE_NAME,
    Item: {
      ...referralCodeKey(code),
      type: "REFERRAL_CODE",
      code,
      userId: user.id,
      email: normalizeEmail(user.email) || null,
      name: getUserDisplayName(user),
      createdAt: now,
    },
    ConditionExpression: "attribute_not_exists(#pk) OR userId = :userId",
    ExpressionAttributeNames: { "#pk": "pk" },
    ExpressionAttributeValues: { ":userId": user.id },
  });
}

export async function ensureReferralCodeForUser(userId: string) {
  const user = await getUser(
    userId,
    "id, email, #name, firstName, lastName, referralCode",
  );
  if (!user?.id) throw new Error("User not found.");

  const existingCode = normalizeReferralCode(user.referralCode || "");
  if (existingCode) {
    await upsertReferralCodeRecord(user, existingCode);
    return {
      referralCode: existingCode,
      referralUrl: referralUrlForCode(existingCode),
    };
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generateReferralCode(user.id, attempt);
    try {
      await upsertReferralCodeRecord(user, code);
      await documentClient.update({
        TableName: TABLE_NAME,
        Key: userKey(user.id),
        UpdateExpression:
          "SET referralCode = if_not_exists(referralCode, :code), referralCodeAssignedAt = if_not_exists(referralCodeAssignedAt, :now)",
        ExpressionAttributeValues: {
          ":code": code,
          ":now": new Date().toISOString(),
        },
      });
      return {
        referralCode: code,
        referralUrl: referralUrlForCode(code),
      };
    } catch (err) {
      if (!isConditionalFailure(err)) throw err;
    }
  }

  throw new Error("Could not assign a referral code.");
}

export async function findReferralOwnerByCode(code: string): Promise<ReferralCodeRecord | null> {
  const normalizedCode = normalizeReferralCode(code);
  if (!normalizedCode) return null;
  const res = await documentClient.get({
    TableName: TABLE_NAME,
    Key: referralCodeKey(normalizedCode),
  });
  const item = res.Item as any;
  if (!item || item.type !== "REFERRAL_CODE" || !item.userId) return null;
  return {
    code: normalizedCode,
    userId: String(item.userId),
    email: textOrNull(item.email),
    name: textOrNull(item.name),
    createdAt: textOrNull(item.createdAt) || new Date().toISOString(),
  };
}

const eligibleNewSignup = (user: RawUser | null, pendingSignupCreatedAt?: string | null) => {
  if (!user?.id) return false;
  if (user.referredByUserId || user.referralCreditedAt) return false;
  if (!pendingSignupCreatedAt || !user.createdAt) return true;

  const userCreatedAt = Date.parse(user.createdAt);
  const pendingCreatedAt = Date.parse(pendingSignupCreatedAt);
  if (!Number.isFinite(userCreatedAt) || !Number.isFinite(pendingCreatedAt)) return true;

  return userCreatedAt >= pendingCreatedAt - 5 * 60 * 1000;
};

export async function creditReferralSignup({
  referralCode,
  referredUserId,
  referredEmail,
  referredName,
  signupProfileId,
  pendingSignupCreatedAt,
}: {
  referralCode?: string | null;
  referredUserId: string;
  referredEmail?: string | null;
  referredName?: string | null;
  signupProfileId?: string | null;
  pendingSignupCreatedAt?: string | null;
}) {
  const normalizedCode = normalizeReferralCode(referralCode || "");
  if (!normalizedCode || !referredUserId) return { credited: false as const, reason: "missing_referral_code" };

  const owner = await findReferralOwnerByCode(normalizedCode);
  if (!owner?.userId) return { credited: false as const, reason: "unknown_referral_code" };
  if (owner.userId === referredUserId) return { credited: false as const, reason: "self_referral" };

  const normalizedReferredEmail = normalizeEmail(referredEmail);
  if (owner.email && normalizedReferredEmail && normalizeEmail(owner.email) === normalizedReferredEmail) {
    return { credited: false as const, reason: "self_referral_email" };
  }

  const referredUser = await getUser(
    referredUserId,
    "id, email, createdAt, referredByUserId, referralCreditedAt",
  );
  if (!eligibleNewSignup(referredUser, pendingSignupCreatedAt)) {
    return { credited: false as const, reason: "not_new_signup" };
  }

  const now = new Date().toISOString();
  const credit: ReferralCreditRecord = {
    type: "REFERRAL_CREDIT",
    referralCode: normalizedCode,
    referrerUserId: owner.userId,
    referrerEmail: owner.email,
    referrerName: owner.name,
    referredUserId,
    referredEmail: normalizedReferredEmail || normalizeEmail(referredUser?.email) || null,
    referredName: textOrNull(referredName),
    signupProfileId: textOrNull(signupProfileId),
    creditedAt: now,
    pendingSignupCreatedAt: textOrNull(pendingSignupCreatedAt),
  };

  try {
    await documentClient.put({
      TableName: TABLE_NAME,
      Item: {
        ...referralCreditKey(referredUserId),
        ...credit,
        GSI1PK: `REFERRER#${owner.userId}`,
        GSI1SK: `REFERRAL_CREDIT#${now}#${referredUserId}`,
      },
      ConditionExpression: "attribute_not_exists(#pk)",
      ExpressionAttributeNames: { "#pk": "pk" },
    });
  } catch (err) {
    if (isConditionalFailure(err)) return { credited: false as const, reason: "already_credited" };
    throw err;
  }

  await documentClient.update({
    TableName: TABLE_NAME,
    Key: userKey(referredUserId),
    UpdateExpression:
      "SET referredByUserId = :referrerUserId, referredByCode = :code, referralCreditedAt = :now, updatedAt = :now",
    ExpressionAttributeValues: {
      ":referrerUserId": owner.userId,
      ":code": normalizedCode,
      ":now": now,
    },
  });

  await documentClient.update({
    TableName: TABLE_NAME,
    Key: userKey(owner.userId),
    UpdateExpression:
      "SET referralLastCreditAt = :now ADD referralCreditCount :one",
    ExpressionAttributeValues: {
      ":now": now,
      ":one": 1,
    },
  });

  return { credited: true as const, credit };
}

async function scanReferralCredits(): Promise<ReferralCreditRecord[]> {
  const items: ReferralCreditRecord[] = [];
  let ExclusiveStartKey: Record<string, any> | undefined;

  do {
    const res = await documentClient.scan({
      TableName: TABLE_NAME,
      FilterExpression: "#type = :type",
      ExpressionAttributeNames: { "#type": "type" },
      ExpressionAttributeValues: { ":type": "REFERRAL_CREDIT" },
      ExclusiveStartKey,
    });
    for (const item of res.Items || []) items.push(item as ReferralCreditRecord);
    ExclusiveStartKey = res.LastEvaluatedKey as any;
  } while (ExclusiveStartKey);

  return items;
}

async function queryReferralCreditsForReferrer(userId: string): Promise<ReferralCreditRecord[]> {
  const items: ReferralCreditRecord[] = [];
  let ExclusiveStartKey: Record<string, any> | undefined;

  do {
    const res = await documentClient.query({
      TableName: TABLE_NAME,
      IndexName: "GSI1",
      KeyConditionExpression: "#gsi1pk = :pk",
      ExpressionAttributeNames: { "#gsi1pk": "GSI1PK" },
      ExpressionAttributeValues: { ":pk": `REFERRER#${userId}` },
      ExclusiveStartKey,
    });
    for (const item of res.Items || []) items.push(item as ReferralCreditRecord);
    ExclusiveStartKey = res.LastEvaluatedKey as any;
  } while (ExclusiveStartKey);

  return items;
}

async function scanUsersForReferralReport(): Promise<RawUser[]> {
  const items: RawUser[] = [];
  let ExclusiveStartKey: Record<string, any> | undefined;

  do {
    const res = await documentClient.scan({
      TableName: TABLE_NAME,
      FilterExpression: "#type = :user",
      ProjectionExpression:
        "id, email, #name, firstName, lastName, membershipStatus, accountStatus, referralCode",
      ExpressionAttributeNames: { "#type": "type", "#name": "name" },
      ExpressionAttributeValues: { ":user": "USER" },
      ExclusiveStartKey,
    });
    for (const item of res.Items || []) items.push(item as RawUser);
    ExclusiveStartKey = res.LastEvaluatedKey as any;
  } while (ExclusiveStartKey);

  return items;
}

const creditPreview = (credit: ReferralCreditRecord, referredUser?: RawUser): ReferralCreditPreview => ({
  referredUserId: credit.referredUserId,
  referredEmail: textOrNull(referredUser?.email) || textOrNull(credit.referredEmail),
  referredName: referredUser ? getUserDisplayName(referredUser) : textOrNull(credit.referredName),
  membershipStatus: referredUser?.membershipStatus === "active" ? "active" : "none",
  creditedAt: credit.creditedAt,
});

export async function getReferralSummaryForUser(userId: string): Promise<ReferralMemberSummary> {
  const { referralCode, referralUrl } = await ensureReferralCodeForUser(userId);
  const credits = (await queryReferralCreditsForReferrer(userId))
    .sort((a, b) => b.creditedAt.localeCompare(a.creditedAt));

  const referredUsers = new Map<string, RawUser>();
  await Promise.all(
    credits.map(async (credit) => {
      const user = await getUser(
        credit.referredUserId,
        "id, email, #name, firstName, lastName, membershipStatus",
      );
      if (user?.id) referredUsers.set(user.id, user);
    }),
  );

  const recentCredits = credits.slice(0, 5).map((credit) =>
    creditPreview(credit, referredUsers.get(credit.referredUserId)),
  );
  const activeRecruitCount = credits.filter((credit) =>
    referredUsers.get(credit.referredUserId)?.membershipStatus === "active"
  ).length;

  return {
    referralCode,
    referralUrl,
    creditedSignupCount: credits.length,
    activeRecruitCount,
    recentCredits,
  };
}

export async function buildReferralAdminReport(): Promise<ReferralAdminReport> {
  const [credits, users] = await Promise.all([scanReferralCredits(), scanUsersForReferralReport()]);
  const userById = new Map(users.filter((user) => user.id).map((user) => [user.id as string, user]));
  const leaderboard = new Map<string, ReferralLeaderboardEntry>();

  for (const credit of credits) {
    const referrer = userById.get(credit.referrerUserId);
    const referred = userById.get(credit.referredUserId);
    const current = leaderboard.get(credit.referrerUserId) || {
      referrerUserId: credit.referrerUserId,
      referrerEmail: textOrNull(referrer?.email) || textOrNull(credit.referrerEmail),
      referrerName: referrer ? getUserDisplayName(referrer) : textOrNull(credit.referrerName),
      referralCode: normalizeReferralCode(referrer?.referralCode || credit.referralCode) || null,
      referralUrl: normalizeReferralCode(referrer?.referralCode || credit.referralCode)
        ? referralUrlForCode(normalizeReferralCode(referrer?.referralCode || credit.referralCode))
        : null,
      creditedSignupCount: 0,
      activeRecruitCount: 0,
      lastCreditAt: null,
    };

    current.creditedSignupCount += 1;
    if (referred?.membershipStatus === "active") current.activeRecruitCount += 1;
    if (!current.lastCreditAt || credit.creditedAt > current.lastCreditAt) current.lastCreditAt = credit.creditedAt;
    leaderboard.set(credit.referrerUserId, current);
  }

  const creditRows = credits
    .map((credit) => {
      const referrer = userById.get(credit.referrerUserId);
      return {
        ...creditPreview(credit, userById.get(credit.referredUserId)),
        referralCode: credit.referralCode,
        referrerUserId: credit.referrerUserId,
        referrerEmail: textOrNull(referrer?.email) || textOrNull(credit.referrerEmail),
        referrerName: referrer ? getUserDisplayName(referrer) : textOrNull(credit.referrerName),
      };
    })
    .sort((a, b) => b.creditedAt.localeCompare(a.creditedAt));

  const leaderboardRows = Array.from(leaderboard.values()).sort((a, b) => {
    return (
      b.creditedSignupCount - a.creditedSignupCount ||
      b.activeRecruitCount - a.activeRecruitCount ||
      (b.lastCreditAt || "").localeCompare(a.lastCreditAt || "")
    );
  });

  return {
    leaderboard: leaderboardRows,
    credits: creditRows,
    meta: {
      totalCredits: credits.length,
      activeRecruitCount: creditRows.filter((credit) => credit.membershipStatus === "active").length,
      uniqueReferrers: leaderboardRows.length,
    },
  };
}
