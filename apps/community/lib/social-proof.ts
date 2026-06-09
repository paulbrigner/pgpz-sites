import "server-only";

import { createHash, randomBytes, randomUUID } from "crypto";
import { documentClient, TABLE_NAME } from "@/lib/dynamodb";
import {
  MEMBERSHIP_PROOF_RETENTION_POLICY,
  SITE_URL,
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

export type SocialProofRecord = {
  userId: string;
  provider: "x";
  status: "verified";
  handle: string;
  profileUrl: string;
  postUrl: string;
  postId: string;
  challenge: string;
  verifiedAt: string;
  proofRetentionPolicy: string;
};

type ChallengeRecord = {
  pk: string;
  sk: string;
  type?: string;
  challengeId: string;
  challenge: string;
  userId: string;
  provider: "x";
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
  if (!userId) throw new SocialProofError("Unauthorized", 401);

  const now = new Date();
  const existing = await getLatestPendingChallenge(userId);
  if (existing) {
    return {
      challengeId: existing.challengeId,
      challenge: existing.challenge,
      expiresAt: challengeDiscoveryExpiresAt(existing),
      suggestedPost: buildSuggestedPost(existing.challenge),
    };
  }

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
    provider: "x",
    status: "pending",
    createdAt: nowIso,
    expiresAt: expires.toISOString(),
    autoVerifyUntilAt: challengeAutoVerifyUntilAt(now),
    autoVerifyNextCheckAt: nowIso,
    autoVerifyAttemptCount: 0,
  } as ChallengeRecord & { type: string };

  await documentClient.put({
    TableName: TABLE_NAME,
    Item: record,
  });

  return {
    challengeId,
    challenge,
    expiresAt: record.expiresAt,
    suggestedPost: buildSuggestedPost(challenge),
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
      throw new SocialProofError("Too many X proof attempts. Please wait and try again.", 429);
    }
    throw err;
  }
}

async function getLatestPendingChallenge(userId: string): Promise<ChallengeRecord | null> {
  const res = await documentClient.query({
    TableName: TABLE_NAME,
    KeyConditionExpression: "#pk = :pk AND begins_with(#sk, :prefix)",
    ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
    ExpressionAttributeValues: {
      ":pk": userProofPk(userId),
      ":prefix": "CHALLENGE#",
    },
    ScanIndexForward: false,
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

async function getUserMembershipStatus(userId: string): Promise<MembershipStatus | null> {
  const user = await documentClient.get({
    TableName: TABLE_NAME,
    Key: userKey(userId),
    ProjectionExpression: "membershipStatus",
  });
  if (!user.Item) return null;
  return user.Item.membershipStatus === "active" ? "active" : "none";
}

async function assertUserCanActivateMembership(userId: string) {
  const membershipStatus = await getUserMembershipStatus(userId);
  if (membershipStatus === null) throw new SocialProofError("User not found.", 404);
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
          Update: {
            TableName: TABLE_NAME,
            Key: userKey(userId),
            UpdateExpression:
              "SET membershipStatus = :active, membershipProvider = :provider, membershipVerifiedAt = :verifiedAt, membershipProofPostUrl = :postUrl, membershipProofPostId = :postId, membershipProofHandle = :handle, xHandle = :handle, xProfileUrl = :profileUrl, proofRetentionPolicy = :policy, manualApprovalStatus = :manualNone, manualApprovalUpdatedAt = :verifiedAt",
            ConditionExpression:
              "attribute_not_exists(#membershipStatus) OR #membershipStatus <> :active",
            ExpressionAttributeNames: { "#membershipStatus": "membershipStatus" },
            ExpressionAttributeValues: {
              ":active": "active",
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
  if (!userId) throw new SocialProofError("Unauthorized", 401);
  const challenge = await getLatestPendingChallenge(userId);
  if (!challenge) {
    throw new SocialProofError("Generate a fresh proof code before verifying your X post.");
  }

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
  if (await getUserMembershipStatus(userId) === "active") {
    return { status: "already_active" as const, message: "Membership is already active." };
  }

  const challenge = await getLatestPendingChallenge(userId);
  if (!challenge) {
    throw new SocialProofError("Generate verification text before searching for your X post.");
  }

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
        "#type = :type AND #status = :pending AND ((attribute_exists(autoVerifyUntilAt) AND autoVerifyUntilAt >= :now) OR (attribute_not_exists(autoVerifyUntilAt) AND createdAt >= :legacyCreatedAtCutoff)) AND (attribute_not_exists(autoVerifyNextCheckAt) OR autoVerifyNextCheckAt <= :now) AND (attribute_not_exists(autoVerifyAttemptCount) OR autoVerifyAttemptCount < :maxAttempts)",
      ExpressionAttributeNames: {
        "#type": "type",
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":type": "SOCIAL_PROOF_CHALLENGE",
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
    if (membershipStatus === "active" || membershipStatus === null) {
      summary.alreadyActive += membershipStatus === "active" ? 1 : 0;
      const status = membershipStatus === "active" ? "already_active" : "error";
      const message = membershipStatus === "active" ? "Membership is already active." : "User record was not found.";
      if (membershipStatus === null) summary.errors += 1;
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
    xHandle: (user.Item?.xHandle as string | undefined) || null,
    proofRetentionPolicy: (user.Item?.proofRetentionPolicy as string | undefined) || null,
    manualApprovalStatus: (user.Item?.manualApprovalStatus as string | undefined) || "none",
    manualApprovalRequestedAt: (user.Item?.manualApprovalRequestedAt as string | undefined) || null,
    manualApprovalApprovedAt: (user.Item?.manualApprovalApprovedAt as string | undefined) || null,
    proofs: (proofs.Items || []).map((item) => ({
      provider: item.provider || null,
      status: item.status || null,
      handle: item.handle || null,
      postUrl: item.postUrl || null,
      postId: item.postId || null,
      verifiedAt: item.verifiedAt || null,
    })),
  };
}
