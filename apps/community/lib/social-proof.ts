import "server-only";

import { createHash, randomBytes, randomUUID } from "crypto";
import { isAccountActive } from "@pgpz/core";
import { queueAdminSignupNotification } from "@/lib/admin/signup-notifications";
import { documentClient, TABLE_NAME } from "@/lib/dynamodb";
import { getZcashMeAccess } from "@/lib/zcashme-access";
import {
  MEMBERSHIP_PROOF_RETENTION_POLICY,
  SITE_URL,
  ZCASHME_API_TIMEOUT_MS,
  ZCASHME_DIRECTORY_URL,
  X_API_BASE_URL,
  X_API_TIMEOUT_MS,
  X_BEARER_TOKEN,
  X_PROOF_AUTOVERIFY_BATCH_SIZE,
  X_PROOF_AUTOVERIFY_GROUP_SIZE,
  X_PROOF_AUTOVERIFY_MAX_ATTEMPTS,
  X_PROOF_AUTOVERIFY_WINDOW_MINUTES,
  X_PROOF_CHALLENGE_RATE_LIMIT,
  X_PROOF_CHALLENGE_TTL_MINUTES,
  X_PROOF_RATE_LIMIT_WINDOW_MINUTES,
  X_PROOF_VERIFY_RATE_LIMIT,
} from "@/lib/config";

export type MembershipStatus = "active" | "none";
type MembershipActivationState = MembershipStatus | "deactivated";

export type SocialProofRecord = {
  userId: string;
  provider: "x" | "zcashme";
  status: "verified";
  profileUrl: string;
  challenge: string;
  verifiedAt: string;
  proofRetentionPolicy: string;
  handle?: string;
  postUrl?: string;
  postId?: string;
};

type ChallengeRecord = {
  pk: string;
  sk: string;
  type?: string;
  challengeId: string;
  challenge: string;
  userId: string;
  provider: "x" | "zcashme";
  status: "pending" | "verified" | "expired";
  createdAt: string;
  expiresAt: string;
  autoVerifyUntilAt?: string | null;
  autoVerifyNextCheckAt?: string | null;
  autoVerifyAttemptCount?: number | null;
  autoVerifyLastCheckedAt?: string | null;
  autoVerifyLastStatus?: string | null;
  autoVerifyLastMessage?: string | null;
};

type XTweet = {
  id: string;
  text: string;
  author_id: string;
  created_at: string;
  edit_history_tweet_ids?: string[];
};

type XAuthor = {
  id: string;
  name?: string | null;
  username: string;
  verified?: boolean | null;
};

type XSearchCandidate = {
  tweet: XTweet;
  author: XAuthor;
  matchedChallenges: string[];
};

type AutoVerifyStatus =
  | "verified"
  | "not_found"
  | "ambiguous"
  | "already_active"
  | "error";

export class SocialProofError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "SocialProofError";
    this.status = status;
  }
}

const userProofPk = (userId: string) => `SOCIAL_PROOF#USER#${userId}`;
const userKey = (userId: string) => ({ pk: `USER#${userId}`, sk: `USER#${userId}` });
const postClaimKey = (postId: string) => ({
  pk: `SOCIAL_PROOF#POST#${postId}`,
  sk: "CLAIM",
});
const authorClaimKey = (authorId: string) => ({
  pk: `SOCIAL_PROOF#X_AUTHOR#${authorId}`,
  sk: "CLAIM",
});
const zcashMeAddressClaimKey = (address: string) => ({
  pk: `SOCIAL_PROOF#ZCASHME_ADDRESS#${hashRateLimitValue(address)}`,
  sk: "CLAIM",
});
const currentChallengeKey = (userId: string) => ({
  pk: userProofPk(userId),
  sk: "CURRENT_CHALLENGE",
});

const hashRateLimitValue = (value: string) =>
  createHash("sha256").update(value).digest("hex").slice(0, 24);

const normalizeXHandle = (value: string | null | undefined) => {
  const cleaned = (value || "").trim().replace(/^@+/, "");
  return cleaned ? `@${cleaned}` : null;
};

const safeChallengeTerm = (value: string) => value.replace(/["\\]/g, "").trim();

const quoteSearchTerm = (value: string) => `"${safeChallengeTerm(value)}"`;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.floor(value)));

const retryDelayMinutes = (attemptCountAfter: number) => {
  if (attemptCountAfter <= 1) return 10;
  if (attemptCountAfter === 2) return 30;
  if (attemptCountAfter === 3) return 60;
  if (attemptCountAfter === 4) return 180;
  return 360;
};

const challengeDiscoveryWindowMs = () =>
  X_PROOF_AUTOVERIFY_WINDOW_MINUTES * 60 * 1000;

const challengeAutoVerifyUntilAt = (createdAt: Date) =>
  new Date(createdAt.getTime() + challengeDiscoveryWindowMs()).toISOString();

const challengeDiscoveryCutoffAt = (now: Date) =>
  new Date(now.getTime() - challengeDiscoveryWindowMs()).toISOString();

const challengeDiscoveryExpiresAt = (challenge: ChallengeRecord) => {
  if (challenge.autoVerifyUntilAt) return challenge.autoVerifyUntilAt;

  const createdAt = Date.parse(challenge.createdAt);
  if (Number.isFinite(createdAt)) {
    return new Date(createdAt + challengeDiscoveryWindowMs()).toISOString();
  }

  return challenge.expiresAt;
};

const isChallengeDiscoverable = (challenge: ChallengeRecord, now = Date.now()) => {
  const expiresAt = Date.parse(challengeDiscoveryExpiresAt(challenge));
  return Number.isFinite(expiresAt) && expiresAt >= now;
};

const parseXPostUrl = (value: string) => {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new SocialProofError("Enter a valid X post URL.");
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!["x.com", "twitter.com", "mobile.twitter.com"].includes(host)) {
    throw new SocialProofError("Proof URL must be from x.com or twitter.com.");
  }

  const parts = url.pathname.split("/").filter(Boolean);
  const statusIndex = parts.findIndex((part) => part.toLowerCase() === "status");
  const id = statusIndex >= 0 ? parts[statusIndex + 1] : null;
  if (!id || !/^\d{5,}$/.test(id)) {
    throw new SocialProofError("Could not find an X post ID in that URL.");
  }

  const urlHandle = statusIndex > 0 ? normalizeXHandle(parts[statusIndex - 1]) : null;
  return { postId: id, urlHandle };
};

const buildSuggestedPost = (challenge: string) =>
  [
    "Joining the PGPZ community.",
    `Verification code: ${challenge}`,
    SITE_URL.replace(/\/$/, ""),
  ].join("\n");

export async function createXChallenge(userId: string) {
  const record = await startMembershipProof(userId, "x");

  return {
    challengeId: record.challengeId,
    challenge: record.challenge,
    expiresAt: record.expiresAt,
    suggestedPost: buildSuggestedPost(record.challenge),
  };
}

export async function createZcashMeChallenge(userId: string) {
  const record = await startMembershipProof(userId, "zcashme");

  return {
    challengeId: record.challengeId,
    challenge: record.challenge,
    expiresAt: record.expiresAt,
  };
}

export function createAdminZcashMeDryRunChallenge() {
  return {
    challenge: `PGPZ-${randomBytes(5).toString("hex").toUpperCase()}`,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  };
}

export async function enforceSocialProofRateLimit({
  action,
  userId,
  ipAddress,
}: {
  action: "challenge" | "verify";
  userId: string;
  ipAddress?: string | null;
}) {
  if (!userId) throw new SocialProofError("Unauthorized", 401);

  const limit = action === "challenge" ? X_PROOF_CHALLENGE_RATE_LIMIT : X_PROOF_VERIFY_RATE_LIMIT;
  const now = Date.now();
  const windowMs = X_PROOF_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000;
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const expires = Math.floor((windowStart + windowMs) / 1000) + 60 * 60;
  const nowIso = new Date(now).toISOString();
  const dimensions = [`USER#${userId}`];

  if (ipAddress) {
    dimensions.push(`IP#${hashRateLimitValue(ipAddress)}`);
  }

  try {
    await Promise.all(
      dimensions.map((dimension) =>
        documentClient.update({
          TableName: TABLE_NAME,
          Key: {
            pk: `RATE_LIMIT#SOCIAL_PROOF#${action}#${dimension}`,
            sk: `WINDOW#${windowStart}`,
          },
          UpdateExpression:
            "SET #count = if_not_exists(#count, :zero) + :one, expires = :expires, firstSeenAt = if_not_exists(firstSeenAt, :now), updatedAt = :now",
          ConditionExpression: "attribute_not_exists(#count) OR #count < :limit",
          ExpressionAttributeNames: { "#count": "count" },
          ExpressionAttributeValues: {
            ":zero": 0,
            ":one": 1,
            ":limit": limit,
            ":expires": expires,
            ":now": nowIso,
          },
        })
      )
    );
  } catch (err: any) {
    if (err?.name === "ConditionalCheckFailedException") {
      throw new SocialProofError("Too many membership proof attempts. Please wait and try again.", 429);
    }
    throw err;
  }
}

async function getCurrentPendingMembershipProof(userId: string): Promise<ChallengeRecord | null> {
  const res = await documentClient.query({
    TableName: TABLE_NAME,
    KeyConditionExpression: "#pk = :pk AND begins_with(#sk, :prefix)",
    ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
    ExpressionAttributeValues: {
      ":pk": userProofPk(userId),
      ":prefix": "CHALLENGE#",
    },
    ScanIndexForward: false,
    ConsistentRead: true,
    Limit: 20,
  });

  const now = Date.now();
  for (const item of res.Items || []) {
    if (item.status !== "pending") continue;
    if (!isChallengeDiscoverable(item as ChallengeRecord, now)) continue;
    return item as ChallengeRecord;
  }
  return null;
}

async function startMembershipProof(userId: string, provider: "x" | "zcashme") {
  if (!userId) throw new SocialProofError("Unauthorized", 401);
  await assertUserCanActivateMembership(userId);

  const existing = await getCurrentPendingMembershipProof(userId);
  if (existing) {
    if (existing.provider !== provider) {
      throw new SocialProofError(
        `You already have a pending ${existing.provider === "x" ? "X" : "ZcashMe"} verification. Complete it or wait for it to expire before starting ${provider === "x" ? "X" : "ZcashMe"} verification.`,
        409,
      );
    }
    return existing;
  }

  const now = new Date();
  const expires = new Date(now.getTime() + X_PROOF_CHALLENGE_TTL_MINUTES * 60 * 1000);
  const challenge = `PGPZ-${randomBytes(5).toString("hex").toUpperCase()}`;
  const challengeId = randomUUID();
  const nowIso = now.toISOString();
  const record: ChallengeRecord = {
    pk: userProofPk(userId),
    sk: `CHALLENGE#${nowIso}#${challengeId}`,
    type: "SOCIAL_PROOF_CHALLENGE",
    challengeId,
    challenge,
    userId,
    provider,
    status: "pending",
    createdAt: nowIso,
    expiresAt: expires.toISOString(),
    autoVerifyUntilAt: challengeAutoVerifyUntilAt(now),
    autoVerifyNextCheckAt: nowIso,
    autoVerifyAttemptCount: 0,
  } as ChallengeRecord & { type: string };

  try {
    await documentClient.transactWrite({
      TransactItems: [
        {
          Put: {
            TableName: TABLE_NAME,
            Item: record,
          },
        },
        {
          Put: {
            TableName: TABLE_NAME,
            Item: {
              ...currentChallengeKey(userId),
              type: "SOCIAL_PROOF_CURRENT_CHALLENGE",
              userId,
              provider,
              status: "pending",
              challengeId,
              challenge,
              createdAt: nowIso,
              expiresAt: record.autoVerifyUntilAt || record.expiresAt,
            },
            ConditionExpression:
              "attribute_not_exists(#pk) OR #expiresAt < :now OR #status <> :pending",
            ExpressionAttributeNames: {
              "#pk": "pk",
              "#expiresAt": "expiresAt",
              "#status": "status",
            },
            ExpressionAttributeValues: {
              ":now": nowIso,
              ":pending": "pending",
            },
          },
        },
      ],
    });
  } catch (error: any) {
    if (error?.name !== "TransactionCanceledException") throw error;
    const winner = await getCurrentPendingMembershipProof(userId);
    if (winner?.provider === provider) return winner;
    if (winner) {
      throw new SocialProofError(
        `You already have a pending ${winner.provider === "x" ? "X" : "ZcashMe"} verification. Complete it or wait for it to expire before starting ${provider === "x" ? "X" : "ZcashMe"} verification.`,
        409,
      );
    }
    throw new SocialProofError("Another membership verification was started at the same time. Please try again.", 409);
  }

  return record;
}

async function requireCurrentMembershipProof(userId: string, provider: "x" | "zcashme") {
  if (!userId) throw new SocialProofError("Unauthorized", 401);

  const proof = await getCurrentPendingMembershipProof(userId);
  const requestedProvider = provider === "x" ? "X" : "ZcashMe";
  if (!proof) {
    throw new SocialProofError(`Start ${requestedProvider} verification before continuing.`);
  }
  if (proof.provider !== provider) {
    const currentProvider = proof.provider === "x" ? "X" : "ZcashMe";
    throw new SocialProofError(
      `Your current membership verification is ${currentProvider}. Complete it or wait for it to expire before starting ${requestedProvider} verification.`,
      409,
    );
  }

  return proof;
}

async function assertPostNotClaimed(postId: string, userId: string) {
  const claim = await documentClient.get({
    TableName: TABLE_NAME,
    Key: postClaimKey(postId),
  });

  if (claim.Item) {
    throw new SocialProofError("That X post has already been used for membership.", 409);
  }

  const res = await documentClient.query({
    TableName: TABLE_NAME,
    IndexName: "GSI1",
    KeyConditionExpression: "#gsi1pk = :pk",
    ExpressionAttributeNames: { "#gsi1pk": "GSI1PK" },
    ExpressionAttributeValues: { ":pk": `SOCIAL_PROOF#POST#${postId}` },
    Limit: 1,
  });

  const existing = res.Items?.[0];
  if (existing && existing.userId !== userId) {
    throw new SocialProofError("That X post has already been used for another membership.", 409);
  }
}

async function assertAuthorNotClaimed(authorId: string, userId: string) {
  const claim = await documentClient.get({
    TableName: TABLE_NAME,
    Key: authorClaimKey(authorId),
  });

  if (claim.Item && claim.Item.userId !== userId) {
    throw new SocialProofError("That X account has already been used for another membership.", 409);
  }
}

async function assertZcashMeAddressNotClaimed(address: string, userId: string) {
  const claim = await documentClient.get({
    TableName: TABLE_NAME,
    Key: zcashMeAddressClaimKey(address),
  });

  if (claim.Item && claim.Item.userId !== userId) {
    throw new SocialProofError("That ZcashMe profile has already been used for another membership.", 409);
  }
}

async function fetchXJson(url: URL, failurePrefix: string) {
  if (!X_BEARER_TOKEN) {
    throw new SocialProofError("X proof verification is not configured yet.", 503);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), X_API_TIMEOUT_MS);
  let res: Response;
  let body: any = null;
  let text = "";
  try {
    res = await fetch(url, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${X_BEARER_TOKEN}`,
        "user-agent": "pgpz-community-social-proof/1.0",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    text = await res.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new SocialProofError("Timed out while verifying the X post.", 504);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const detail = body?.detail || body?.title || text.slice(0, 180) || `X API returned ${res.status}`;
    throw new SocialProofError(`${failurePrefix}: ${detail}`, res.status >= 500 ? 502 : 400);
  }

  return body;
}

function authorMapFromPayload(body: any) {
  const map = new Map<string, XAuthor>();
  if (!Array.isArray(body?.includes?.users)) return map;
  for (const user of body.includes.users) {
    if (!user?.id || !user?.username) continue;
    map.set(String(user.id), {
      id: String(user.id),
      name: typeof user.name === "string" ? user.name : null,
      username: String(user.username),
      verified: typeof user.verified === "boolean" ? user.verified : null,
    });
  }
  return map;
}

async function fetchXPost(postId: string): Promise<{ tweet: XTweet; author: XAuthor }> {
  const url = new URL(`${X_API_BASE_URL}/tweets/${postId}`);
  url.searchParams.set("tweet.fields", "author_id,created_at,text,edit_history_tweet_ids");
  url.searchParams.set("expansions", "author_id");
  url.searchParams.set("user.fields", "id,name,username,verified");

  const body = await fetchXJson(url, "Could not verify the X post");
  const tweet = body?.data;
  const author = authorMapFromPayload(body).get(String(tweet?.author_id || ""));

  if (!tweet?.id || !tweet?.text || !tweet?.created_at || !author?.username) {
    throw new SocialProofError("X did not return enough post details to verify membership.", 502);
  }

  return {
    tweet: {
      id: String(tweet.id),
      text: String(tweet.text),
      author_id: String(tweet.author_id),
      created_at: String(tweet.created_at),
      edit_history_tweet_ids: Array.isArray(tweet.edit_history_tweet_ids)
        ? tweet.edit_history_tweet_ids.map(String)
        : undefined,
    },
    author,
  };
}

function buildChallengeSearchQuery(challenges: string[]) {
  const terms = challenges.map(safeChallengeTerm).filter(Boolean);
  if (!terms.length) throw new SocialProofError("No proof codes are available to search.", 400);
  return `(${terms.map(quoteSearchTerm).join(" OR ")}) -is:retweet -is:quote`;
}

async function searchXPostsForChallenges(challenges: string[]): Promise<XSearchCandidate[]> {
  const terms = challenges.map(safeChallengeTerm).filter(Boolean);
  const url = new URL(`${X_API_BASE_URL}/tweets/search/recent`);
  url.searchParams.set("query", buildChallengeSearchQuery(terms));
  url.searchParams.set("max_results", String(clamp(terms.length * 2, 10, 100)));
  url.searchParams.set("tweet.fields", "author_id,created_at,text,edit_history_tweet_ids");
  url.searchParams.set("expansions", "author_id");
  url.searchParams.set("user.fields", "id,name,username,verified");

  const body = await fetchXJson(url, "Could not search X posts");
  const authors = authorMapFromPayload(body);
  if (!Array.isArray(body?.data)) return [];

  const normalizedTerms = terms.map((term) => ({ raw: term, lower: term.toLowerCase() }));
  const candidates: XSearchCandidate[] = [];
  for (const item of body.data) {
    const author = authors.get(String(item?.author_id || ""));
    const text = typeof item?.text === "string" ? item.text : "";
    const matchedChallenges = normalizedTerms
      .filter((term) => text.toLowerCase().includes(term.lower))
      .map((term) => term.raw);

    if (!item?.id || !item?.created_at || !item?.author_id || !author || !matchedChallenges.length) {
      continue;
    }

    candidates.push({
      tweet: {
        id: String(item.id),
        text,
        author_id: String(item.author_id),
        created_at: String(item.created_at),
        edit_history_tweet_ids: Array.isArray(item.edit_history_tweet_ids)
          ? item.edit_history_tweet_ids.map(String)
          : undefined,
      },
      author,
      matchedChallenges,
    });
  }

  return candidates;
}

async function getUserMembershipStatus(userId: string): Promise<MembershipActivationState | null> {
  const user = await documentClient.get({
    TableName: TABLE_NAME,
    Key: userKey(userId),
    ProjectionExpression: "membershipStatus, accountStatus, deactivatedAt",
  });
  if (!user.Item) return null;
  if (!isAccountActive(user.Item)) return "deactivated";
  return user.Item.membershipStatus === "active" ? "active" : "none";
}

async function assertUserCanActivateMembership(userId: string) {
  const membershipStatus = await getUserMembershipStatus(userId);
  if (membershipStatus === null) throw new SocialProofError("User not found.", 404);
  if (membershipStatus === "deactivated") {
    throw new SocialProofError("This account is deactivated.", 409);
  }
  if (membershipStatus === "active") {
    throw new SocialProofError("Membership is already active.", 409);
  }
}

async function verifyXProofCandidate({
  userId,
  challenge,
  tweet,
  author,
  urlHandle,
  verificationMethod,
}: {
  userId: string;
  challenge: ChallengeRecord;
  tweet: XTweet;
  author: XAuthor;
  urlHandle?: string | null;
  verificationMethod: "paste" | "search" | "background";
}): Promise<SocialProofRecord> {
  const postId = String(tweet.id || "");
  if (!postId) throw new SocialProofError("X did not return a post ID.", 502);

  await assertUserCanActivateMembership(userId);
  await assertPostNotClaimed(postId, userId);

  const authorId = String(author.id || "");
  if (!authorId) {
    throw new SocialProofError("X did not return the post author ID.", 502);
  }
  await assertAuthorNotClaimed(authorId, userId);

  const tweetText = String(tweet.text || "");
  if (!tweetText.toLowerCase().includes(challenge.challenge.toLowerCase())) {
    throw new SocialProofError("The X post does not include your current proof code.");
  }

  const challengeCreatedAt = Date.parse(challenge.createdAt);
  const tweetCreatedAt = Date.parse(tweet.created_at);
  if (Number.isFinite(challengeCreatedAt) && Number.isFinite(tweetCreatedAt) && tweetCreatedAt + 60_000 < challengeCreatedAt) {
    throw new SocialProofError("The X post must be created after the proof code is generated.");
  }

  const handle = normalizeXHandle(author.username) as string;
  if (urlHandle && urlHandle.toLowerCase() !== handle.toLowerCase()) {
    throw new SocialProofError("The X post URL handle does not match the post author returned by X.");
  }

  const verifiedAt = new Date().toISOString();
  const canonicalPostUrl = `https://x.com/${handle.replace(/^@/, "")}/status/${postId}`;
  const profileUrl = `https://x.com/${handle.replace(/^@/, "")}`;
  const proofRetentionPolicy = MEMBERSHIP_PROOF_RETENTION_POLICY;

  const proofRecord = {
    pk: userProofPk(userId),
    sk: `PROOF#x#${postId}`,
    type: "SOCIAL_PROOF",
    userId,
    provider: "x",
    status: "verified",
    handle,
    profileUrl,
    postUrl: canonicalPostUrl,
    postId,
    authorId,
    authorName: author.name || null,
    challenge: challenge.challenge,
    proofText: tweetText,
    postedAt: tweet.created_at,
    verifiedAt,
    verificationMethod,
    proofRetentionPolicy,
    GSI1PK: `SOCIAL_PROOF#POST#${postId}`,
    GSI1SK: `USER#${userId}`,
  };
  const claimRecord = {
    ...postClaimKey(postId),
    type: "SOCIAL_PROOF_POST_CLAIM",
    userId,
    provider: "x",
    postId,
    postUrl: canonicalPostUrl,
    claimedAt: verifiedAt,
  };
  const authorClaimRecord = {
    ...authorClaimKey(authorId),
    type: "SOCIAL_PROOF_X_AUTHOR_CLAIM",
    userId,
    provider: "x",
    authorId,
    handle,
    profileUrl,
    postId,
    postUrl: canonicalPostUrl,
    claimedAt: verifiedAt,
  };

  try {
    await documentClient.transactWrite({
      TransactItems: [
        {
          Put: {
            TableName: TABLE_NAME,
            Item: claimRecord,
            ConditionExpression: "attribute_not_exists(#pk)",
            ExpressionAttributeNames: { "#pk": "pk" },
          },
        },
        {
          Put: {
            TableName: TABLE_NAME,
            Item: authorClaimRecord,
            ConditionExpression: "attribute_not_exists(#pk) OR userId = :userId",
            ExpressionAttributeNames: { "#pk": "pk" },
            ExpressionAttributeValues: { ":userId": userId },
          },
        },
        {
          Put: {
            TableName: TABLE_NAME,
            Item: proofRecord,
          },
        },
        {
          Update: {
            TableName: TABLE_NAME,
            Key: { pk: challenge.pk, sk: challenge.sk },
            UpdateExpression:
              "SET #status = :status, verifiedProofPostId = :postId, verifiedAt = :verifiedAt, autoVerifyLastCheckedAt = :verifiedAt, autoVerifyLastStatus = :status",
            ExpressionAttributeNames: { "#status": "status" },
            ExpressionAttributeValues: {
              ":status": "verified",
              ":postId": postId,
              ":verifiedAt": verifiedAt,
            },
          },
        },
        {
          Delete: {
            TableName: TABLE_NAME,
            Key: currentChallengeKey(userId),
            ConditionExpression: "attribute_not_exists(#pk) OR challengeId = :challengeId",
            ExpressionAttributeNames: { "#pk": "pk" },
            ExpressionAttributeValues: { ":challengeId": challenge.challengeId },
          },
        },
        {
          Update: {
            TableName: TABLE_NAME,
            Key: userKey(userId),
            UpdateExpression:
              "SET membershipStatus = :active, membershipProvider = :provider, membershipVerifiedAt = :verifiedAt, membershipProofPostUrl = :postUrl, membershipProofPostId = :postId, membershipProofHandle = :handle, xHandle = :handle, xProfileUrl = :profileUrl, proofRetentionPolicy = :policy, manualApprovalStatus = :manualNone, manualApprovalUpdatedAt = :verifiedAt",
            ConditionExpression:
              "(attribute_not_exists(#membershipStatus) OR #membershipStatus <> :active) AND (attribute_not_exists(#accountStatus) OR #accountStatus <> :deactivated) AND attribute_not_exists(#deactivatedAt)",
            ExpressionAttributeNames: {
              "#membershipStatus": "membershipStatus",
              "#accountStatus": "accountStatus",
              "#deactivatedAt": "deactivatedAt",
            },
            ExpressionAttributeValues: {
              ":active": "active",
              ":deactivated": "deactivated",
              ":provider": "x",
              ":verifiedAt": verifiedAt,
              ":postUrl": canonicalPostUrl,
              ":postId": postId,
              ":handle": handle,
              ":profileUrl": profileUrl,
              ":policy": proofRetentionPolicy,
              ":manualNone": "none",
            },
          },
        },
      ],
    });
  } catch (err: any) {
    if (err?.name === "TransactionCanceledException") {
      throw new SocialProofError("That X post, X account, or member record has already been used for membership.", 409);
    }
    throw err;
  }

  try {
    await queueAdminSignupNotification({
      type: "successful_join",
      memberUserId: userId,
      occurredAt: verifiedAt,
      method: "self_verification",
      provider: "x",
      proofUrl: canonicalPostUrl,
    });
  } catch (error) {
    console.error("Failed to dispatch admin self-verification notification", {
      memberUserId: userId,
      proofPostId: postId,
      error,
    });
  }

  return {
    userId,
    provider: "x",
    status: "verified",
    handle,
    profileUrl,
    postUrl: canonicalPostUrl,
    postId,
    challenge: challenge.challenge,
    verifiedAt,
    proofRetentionPolicy,
  };
}

export async function verifyXProof(userId: string, postUrl: string): Promise<SocialProofRecord> {
  const challenge = await requireCurrentMembershipProof(userId, "x");

  const { postId, urlHandle } = parseXPostUrl(postUrl);
  const { tweet, author } = await fetchXPost(postId);
  return verifyXProofCandidate({
    userId,
    challenge,
    tweet,
    author,
    urlHandle,
    verificationMethod: "paste",
  });
}

type ZcashMeLookup = {
  username?: unknown;
  address?: unknown;
  links?: unknown;
};

async function fetchZcashMeProfile(username: string): Promise<{
  username: string;
  address: string;
  links: Array<{ platform: string; label: string; url: string }>;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ZCASHME_API_TIMEOUT_MS);
  let response: Response;
  let body: ZcashMeLookup | null = null;

  try {
    response = await fetch(
      `${ZCASHME_DIRECTORY_URL}/api/lookup/${encodeURIComponent(username)}`,
      { cache: "no-store", signal: controller.signal },
    );
    body = await response.json().catch(() => null);
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new SocialProofError("Timed out while checking your ZcashMe profile.", 504);
    }
    throw new SocialProofError("Could not reach ZcashMe to check your profile.", 502);
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 404) {
    throw new SocialProofError("The saved ZcashMe username does not have a public profile yet.", 404);
  }
  if (!response.ok || !body) {
    throw new SocialProofError("ZcashMe could not return your public profile.", 502);
  }

  const canonicalUsername = typeof body.username === "string" ? body.username.trim() : "";
  const address = typeof body.address === "string" ? body.address.trim() : "";
  if (!canonicalUsername || !address) {
    throw new SocialProofError("ZcashMe returned an incomplete public profile.", 502);
  }

  const links = Array.isArray(body.links)
    ? body.links.flatMap((link) => {
      if (!link || typeof link !== "object") return [];
      const value = link as Record<string, unknown>;
      const platform = typeof value.platform === "string" ? value.platform.trim() : "";
      const label = typeof value.label === "string" ? value.label.trim() : "";
      const url = typeof value.url === "string" ? value.url.trim() : "";
      return platform && label ? [{ platform, label, url }] : [];
    })
    : [];

  return { username: canonicalUsername, address, links };
}

export async function verifyZcashMeProof(
  userId: string,
  options: { username?: string; expectedChallenge?: string } = {},
): Promise<SocialProofRecord> {
  const challenge = await requireCurrentMembershipProof(userId, "zcashme");
  if (options.expectedChallenge && options.expectedChallenge !== challenge.challenge) {
    throw new SocialProofError("This ZcashMe authorization does not match your current proof code.", 409);
  }
  let username = options.username?.trim() || "";

  if (!username) {
    const user = await documentClient.get({
      TableName: TABLE_NAME,
      Key: userKey(userId),
      ProjectionExpression: "zcashmeUsername",
    });
    username = typeof user.Item?.zcashmeUsername === "string"
      ? user.Item.zcashmeUsername.trim()
      : "";
  }

  if (!username) {
    throw new SocialProofError("Add your ZcashMe username to your PGPZ profile before verifying manually.");
  }

  const profile = await fetchZcashMeProfile(username);
  const proofLink = profile.links.find(
    (link) => link.platform.toLowerCase() === "pgpz" && link.label === challenge.challenge,
  );
  if (!proofLink) {
    throw new SocialProofError("Your ZcashMe profile does not contain the current PGPZ verification code yet.");
  }

  await assertUserCanActivateMembership(userId);
  await assertZcashMeAddressNotClaimed(profile.address, userId);

  const verifiedAt = new Date().toISOString();
  const profileUrl = `${ZCASHME_DIRECTORY_URL}/${encodeURIComponent(profile.username)}`;
  const proofRetentionPolicy = MEMBERSHIP_PROOF_RETENTION_POLICY;
  const proofRecord = {
    pk: userProofPk(userId),
    sk: `PROOF#zcashme#${challenge.challengeId}`,
    type: "SOCIAL_PROOF",
    userId,
    provider: "zcashme",
    status: "verified",
    handle: profile.username,
    profileUrl,
    linkUrl: proofLink.url || null,
    linkLabel: proofLink.label,
    challenge: challenge.challenge,
    verifiedAt,
    proofRetentionPolicy,
  };
  const claimRecord = {
    ...zcashMeAddressClaimKey(profile.address),
    type: "SOCIAL_PROOF_ZCASHME_ADDRESS_CLAIM",
    userId,
    provider: "zcashme",
    claimedAt: verifiedAt,
  };

  try {
    await documentClient.transactWrite({
      TransactItems: [
        {
          Put: {
            TableName: TABLE_NAME,
            Item: claimRecord,
            ConditionExpression: "attribute_not_exists(#pk) OR userId = :userId",
            ExpressionAttributeNames: { "#pk": "pk" },
            ExpressionAttributeValues: { ":userId": userId },
          },
        },
        {
          Put: {
            TableName: TABLE_NAME,
            Item: proofRecord,
          },
        },
        {
          Update: {
            TableName: TABLE_NAME,
            Key: { pk: challenge.pk, sk: challenge.sk },
            UpdateExpression:
              "SET #status = :status, verifiedProofProfileUrl = :profileUrl, verifiedAt = :verifiedAt",
            ExpressionAttributeNames: { "#status": "status" },
            ExpressionAttributeValues: {
              ":status": "verified",
              ":profileUrl": profileUrl,
              ":verifiedAt": verifiedAt,
            },
          },
        },
        {
          Delete: {
            TableName: TABLE_NAME,
            Key: currentChallengeKey(userId),
            ConditionExpression: "attribute_not_exists(#pk) OR challengeId = :challengeId",
            ExpressionAttributeNames: { "#pk": "pk" },
            ExpressionAttributeValues: { ":challengeId": challenge.challengeId },
          },
        },
        {
          Update: {
            TableName: TABLE_NAME,
            Key: userKey(userId),
            UpdateExpression:
              "SET membershipStatus = :active, membershipProvider = :provider, membershipVerifiedAt = :verifiedAt, membershipProofProfileUrl = :profileUrl, membershipProofProfileUsername = :username, zcashmeUsername = :username, proofRetentionPolicy = :policy, manualApprovalStatus = :manualNone, manualApprovalUpdatedAt = :verifiedAt",
            ConditionExpression:
              "(attribute_not_exists(#membershipStatus) OR #membershipStatus <> :active) AND (attribute_not_exists(#accountStatus) OR #accountStatus <> :deactivated) AND attribute_not_exists(#deactivatedAt)",
            ExpressionAttributeNames: {
              "#membershipStatus": "membershipStatus",
              "#accountStatus": "accountStatus",
              "#deactivatedAt": "deactivatedAt",
            },
            ExpressionAttributeValues: {
              ":active": "active",
              ":deactivated": "deactivated",
              ":provider": "zcashme",
              ":verifiedAt": verifiedAt,
              ":profileUrl": profileUrl,
              ":username": profile.username,
              ":policy": proofRetentionPolicy,
              ":manualNone": "none",
            },
          },
        },
      ],
    });
  } catch (err: any) {
    if (err?.name === "TransactionCanceledException") {
      throw new SocialProofError("That ZcashMe profile or member record has already been used for membership.", 409);
    }
    throw err;
  }

  try {
    await queueAdminSignupNotification({
      type: "successful_join",
      memberUserId: userId,
      occurredAt: verifiedAt,
      method: "self_verification",
      provider: "zcashme",
      proofUrl: profileUrl,
    });
  } catch (error) {
    console.error("Failed to dispatch admin self-verification notification", {
      memberUserId: userId,
      zcashmeUsername: profile.username,
      error,
    });
  }

  return {
    userId,
    provider: "zcashme",
    status: "verified",
    handle: profile.username,
    profileUrl,
    challenge: challenge.challenge,
    verifiedAt,
    proofRetentionPolicy,
  };
}

export async function verifyZcashMeDryRun({
  username,
  challenge,
}: {
  username: string;
  challenge: string;
}) {
  const profile = await fetchZcashMeProfile(username.trim());
  const proofLink = profile.links.find(
    (link) => link.platform.toLowerCase() === "pgpz" && link.label === challenge,
  );
  if (!proofLink) {
    throw new SocialProofError("The authenticated ZcashMe profile does not contain the dry-run proof code.");
  }

  return {
    ok: true as const,
    username: profile.username,
    profileUrl: `${ZCASHME_DIRECTORY_URL}/${encodeURIComponent(profile.username)}`,
    challenge,
  };
}

async function recordChallengeAutoVerifyAttempt({
  challenge,
  status,
  message,
  checkedAt,
  nextCheckAt,
  incrementAttempt = true,
}: {
  challenge: ChallengeRecord;
  status: AutoVerifyStatus;
  message?: string | null;
  checkedAt: string;
  nextCheckAt?: string | null;
  incrementAttempt?: boolean;
}) {
  const expressionParts = [
    "autoVerifyLastCheckedAt = :checkedAt",
    "autoVerifyLastStatus = :autoStatus",
    "autoVerifyLastMessage = :message",
  ];
  const values: Record<string, any> = {
    ":checkedAt": checkedAt,
    ":autoStatus": status,
    ":message": message || null,
  };

  if (nextCheckAt) {
    expressionParts.push("autoVerifyNextCheckAt = :nextCheckAt");
    values[":nextCheckAt"] = nextCheckAt;
  }
  if (incrementAttempt) {
    expressionParts.push("autoVerifyAttemptCount = if_not_exists(autoVerifyAttemptCount, :zero) + :one");
    values[":zero"] = 0;
    values[":one"] = 1;
  }

  await documentClient.update({
    TableName: TABLE_NAME,
    Key: { pk: challenge.pk, sk: challenge.sk },
    UpdateExpression: `SET ${expressionParts.join(", ")}`,
    ExpressionAttributeValues: values,
  });
}

function nextAutoVerifyCheckAt(attemptCountAfter: number) {
  const delay = retryDelayMinutes(attemptCountAfter);
  return new Date(Date.now() + delay * 60 * 1000).toISOString();
}

function candidatesForChallenge(challenge: ChallengeRecord, candidates: XSearchCandidate[]) {
  const needle = challenge.challenge.toLowerCase();
  return candidates.filter((candidate) =>
    candidate.matchedChallenges.some((matched) => matched.toLowerCase() === needle)
  );
}

async function verifyChallengeFromSearch({
  challenge,
  candidates,
  verificationMethod,
  updateOnNoMatch = true,
}: {
  challenge: ChallengeRecord;
  candidates: XSearchCandidate[];
  verificationMethod: "search" | "background";
  updateOnNoMatch?: boolean;
}) {
  const checkedAt = new Date().toISOString();
  const matching = candidatesForChallenge(challenge, candidates);
  const attemptCountAfter = Number(challenge.autoVerifyAttemptCount || 0) + 1;

  if (!matching.length) {
    if (updateOnNoMatch) {
      await recordChallengeAutoVerifyAttempt({
        challenge,
        status: "not_found",
        message: "No public X post with this proof code was found yet.",
        checkedAt,
        nextCheckAt: nextAutoVerifyCheckAt(attemptCountAfter),
      });
    }
    return {
      status: "not_found" as const,
      message: "No public X post with this proof code was found yet.",
    };
  }

  const uniquePostIds = new Set(matching.map((candidate) => candidate.tweet.id));
  if (uniquePostIds.size !== 1) {
    await recordChallengeAutoVerifyAttempt({
      challenge,
      status: "ambiguous",
      message: "Multiple public X posts matched this proof code.",
      checkedAt,
      nextCheckAt: nextAutoVerifyCheckAt(attemptCountAfter),
    });
    return {
      status: "ambiguous" as const,
      message: "Multiple public X posts matched this proof code. Paste the intended post URL to complete verification.",
    };
  }

  try {
    const candidate = matching[0];
    const proof = await verifyXProofCandidate({
      userId: challenge.userId,
      challenge,
      tweet: candidate.tweet,
      author: candidate.author,
      verificationMethod,
    });
    return { status: "verified" as const, proof };
  } catch (err: any) {
    if (err instanceof SocialProofError && err.status === 409 && /already active/i.test(err.message)) {
      await recordChallengeAutoVerifyAttempt({
        challenge,
        status: "already_active",
        message: err.message,
        checkedAt,
        nextCheckAt: nextAutoVerifyCheckAt(attemptCountAfter),
      });
      return { status: "already_active" as const, message: err.message };
    }

    await recordChallengeAutoVerifyAttempt({
      challenge,
      status: "error",
      message: err?.message || "Unable to verify the discovered X post.",
      checkedAt,
      nextCheckAt: nextAutoVerifyCheckAt(attemptCountAfter),
    });
    throw err;
  }
}

export async function findAndVerifyXProof(userId: string) {
  if (!userId) throw new SocialProofError("Unauthorized", 401);
  const membershipStatus = await getUserMembershipStatus(userId);
  if (membershipStatus === "deactivated") {
    throw new SocialProofError("This account is deactivated.", 409);
  }
  if (membershipStatus === "active") {
    return { status: "already_active" as const, message: "Membership is already active." };
  }

  const challenge = await requireCurrentMembershipProof(userId, "x");

  const candidates = await searchXPostsForChallenges([challenge.challenge]);
  return verifyChallengeFromSearch({
    challenge,
    candidates,
    verificationMethod: "search",
  });
}

async function closeChallengeAutoVerify({
  challenge,
  status,
  message,
}: {
  challenge: ChallengeRecord;
  status: AutoVerifyStatus;
  message: string;
}) {
  const checkedAt = new Date().toISOString();
  await documentClient.update({
    TableName: TABLE_NAME,
    Key: { pk: challenge.pk, sk: challenge.sk },
    UpdateExpression:
      "SET #status = :expired, autoVerifyLastCheckedAt = :checkedAt, autoVerifyLastStatus = :autoStatus, autoVerifyLastMessage = :message",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: {
      ":expired": "expired",
      ":checkedAt": checkedAt,
      ":autoStatus": status,
      ":message": message,
    },
  });
}

async function scanAutoVerifyChallenges(limit: number): Promise<ChallengeRecord[]> {
  const challenges: ChallengeRecord[] = [];
  let ExclusiveStartKey: Record<string, any> | undefined;
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const legacyCreatedAtCutoff = challengeDiscoveryCutoffAt(nowDate);
  const maxEvaluatedPerPage = Math.max(25, limit * 4);

  do {
    const res = await documentClient.scan({
      TableName: TABLE_NAME,
      Limit: maxEvaluatedPerPage,
      ProjectionExpression:
        "pk, sk, #type, challengeId, challenge, userId, provider, #status, createdAt, expiresAt, autoVerifyUntilAt, autoVerifyNextCheckAt, autoVerifyAttemptCount",
      FilterExpression:
        "#type = :type AND #provider = :provider AND #status = :pending AND ((attribute_exists(autoVerifyUntilAt) AND autoVerifyUntilAt >= :now) OR (attribute_not_exists(autoVerifyUntilAt) AND createdAt >= :legacyCreatedAtCutoff)) AND (attribute_not_exists(autoVerifyNextCheckAt) OR autoVerifyNextCheckAt <= :now) AND (attribute_not_exists(autoVerifyAttemptCount) OR autoVerifyAttemptCount < :maxAttempts)",
      ExpressionAttributeNames: {
        "#type": "type",
        "#provider": "provider",
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":type": "SOCIAL_PROOF_CHALLENGE",
        ":provider": "x",
        ":pending": "pending",
        ":now": now,
        ":legacyCreatedAtCutoff": legacyCreatedAtCutoff,
        ":maxAttempts": X_PROOF_AUTOVERIFY_MAX_ATTEMPTS,
      },
      ExclusiveStartKey,
    });

    for (const item of res.Items || []) {
      if (!item.challenge || !item.userId) continue;
      challenges.push(item as ChallengeRecord);
      if (challenges.length >= limit) break;
    }
    ExclusiveStartKey = res.LastEvaluatedKey as any;
  } while (ExclusiveStartKey && challenges.length < limit);

  return challenges;
}

export async function autoVerifyPendingXProofs(options: {
  batchSize?: number;
  groupSize?: number;
} = {}) {
  const batchSize = clamp(options.batchSize || X_PROOF_AUTOVERIFY_BATCH_SIZE, 1, 100);
  const groupSize = clamp(options.groupSize || X_PROOF_AUTOVERIFY_GROUP_SIZE, 1, 10);
  const challenges = await scanAutoVerifyChallenges(batchSize);
  const summary = {
    scanned: challenges.length,
    searchRequests: 0,
    verified: 0,
    notFound: 0,
    ambiguous: 0,
    alreadyActive: 0,
    errors: 0,
    results: [] as Array<{
      userId: string;
      challengeId: string;
      status: string;
      message?: string | null;
      postUrl?: string | null;
    }>,
  };

  const eligibleChallenges: ChallengeRecord[] = [];
  for (const challenge of challenges) {
    const membershipStatus = await getUserMembershipStatus(challenge.userId);
    if (membershipStatus === "active" || membershipStatus === "deactivated" || membershipStatus === null) {
      summary.alreadyActive += membershipStatus === "active" ? 1 : 0;
      const status = membershipStatus === "active" ? "already_active" : "error";
      const message = membershipStatus === "active"
        ? "Membership is already active."
        : membershipStatus === "deactivated"
          ? "Account is deactivated."
          : "User record was not found.";
      if (membershipStatus !== "active") summary.errors += 1;
      await closeChallengeAutoVerify({ challenge, status, message });
      summary.results.push({
        userId: challenge.userId,
        challengeId: challenge.challengeId,
        status,
        message,
      });
      continue;
    }
    eligibleChallenges.push(challenge);
  }

  for (let i = 0; i < eligibleChallenges.length; i += groupSize) {
    const group = eligibleChallenges.slice(i, i + groupSize);
    let candidates: XSearchCandidate[] = [];
    try {
      candidates = await searchXPostsForChallenges(group.map((challenge) => challenge.challenge));
      summary.searchRequests += 1;
    } catch (err: any) {
      summary.errors += group.length;
      const checkedAt = new Date().toISOString();
      await Promise.all(
        group.map((challenge) =>
          recordChallengeAutoVerifyAttempt({
            challenge,
            status: "error",
            message: err?.message || "Unable to search X posts.",
            checkedAt,
            nextCheckAt: nextAutoVerifyCheckAt(Number(challenge.autoVerifyAttemptCount || 0) + 1),
          })
        )
      );
      continue;
    }

    for (const challenge of group) {
      try {
        const result = await verifyChallengeFromSearch({
          challenge,
          candidates,
          verificationMethod: "background",
        });
        if (result.status === "verified") summary.verified += 1;
        if (result.status === "not_found") summary.notFound += 1;
        if (result.status === "ambiguous") summary.ambiguous += 1;
        if (result.status === "already_active") summary.alreadyActive += 1;
        summary.results.push({
          userId: challenge.userId,
          challengeId: challenge.challengeId,
          status: result.status,
          message: "message" in result ? result.message || null : null,
          postUrl: result.status === "verified" ? result.proof.postUrl : null,
        });
      } catch (err: any) {
        summary.errors += 1;
        summary.results.push({
          userId: challenge.userId,
          challengeId: challenge.challengeId,
          status: "error",
          message: err?.message || "Unable to verify discovered X post.",
        });
      }
    }
  }

  return summary;
}

export async function getUserProofStatus(userId: string) {
  if (!userId) throw new SocialProofError("Unauthorized", 401);

  const user = await documentClient.get({
    TableName: TABLE_NAME,
    Key: userKey(userId),
  });

  const proofs = await documentClient.query({
    TableName: TABLE_NAME,
    KeyConditionExpression: "#pk = :pk AND begins_with(#sk, :prefix)",
    ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
    ExpressionAttributeValues: {
      ":pk": userProofPk(userId),
      ":prefix": "PROOF#",
    },
    ScanIndexForward: false,
    Limit: 10,
  });

  return {
    membershipStatus: (user.Item?.membershipStatus as MembershipStatus | undefined) || "none",
    membershipProvider: (user.Item?.membershipProvider as string | undefined) || null,
    membershipVerifiedAt: (user.Item?.membershipVerifiedAt as string | undefined) || null,
    membershipProofPostUrl: (user.Item?.membershipProofPostUrl as string | undefined) || null,
    membershipProofPostId: (user.Item?.membershipProofPostId as string | undefined) || null,
    membershipProofHandle: (user.Item?.membershipProofHandle as string | undefined) || null,
    membershipProofProfileUrl: (user.Item?.membershipProofProfileUrl as string | undefined) || null,
    membershipProofProfileUsername:
      (user.Item?.membershipProofProfileUsername as string | undefined) || null,
    zcashmeUsername: (user.Item?.zcashmeUsername as string | undefined) || null,
    xHandle: (user.Item?.xHandle as string | undefined) || null,
    proofRetentionPolicy: (user.Item?.proofRetentionPolicy as string | undefined) || null,
    manualApprovalStatus: (user.Item?.manualApprovalStatus as string | undefined) || "none",
    manualApprovalRequestedAt: (user.Item?.manualApprovalRequestedAt as string | undefined) || null,
    manualApprovalApprovedAt: (user.Item?.manualApprovalApprovedAt as string | undefined) || null,
    zcashMeAccess: getZcashMeAccess(user.Item),
    proofs: (proofs.Items || []).map((item) => ({
      provider: item.provider || null,
      status: item.status || null,
      handle: item.handle || null,
      profileUrl: item.profileUrl || null,
      postUrl: item.postUrl || null,
      postId: item.postId || null,
      verifiedAt: item.verifiedAt || null,
    })),
  };
}
