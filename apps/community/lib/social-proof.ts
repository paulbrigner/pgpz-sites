import "server-only";

import { createHash, randomBytes, randomUUID } from "crypto";
import { documentClient, TABLE_NAME } from "@/lib/dynamodb";
import {
  MEMBERSHIP_PROOF_RETENTION_POLICY,
  SITE_URL,
  X_API_BASE_URL,
  X_API_TIMEOUT_MS,
  X_BEARER_TOKEN,
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
  challengeId: string;
  challenge: string;
  userId: string;
  provider: "x";
  status: "pending" | "verified" | "expired";
  createdAt: string;
  expiresAt: string;
};

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
      expiresAt: existing.expiresAt,
      suggestedPost: buildSuggestedPost(existing.challenge),
    };
  }

  const expires = new Date(now.getTime() + X_PROOF_CHALLENGE_TTL_MINUTES * 60 * 1000);
  const challenge = `PGPZ-${randomBytes(5).toString("hex").toUpperCase()}`;
  const challengeId = randomUUID();
  const record: ChallengeRecord = {
    pk: userProofPk(userId),
    sk: `CHALLENGE#${now.toISOString()}#${challengeId}`,
    type: "SOCIAL_PROOF_CHALLENGE",
    challengeId,
    challenge,
    userId,
    provider: "x",
    status: "pending",
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
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
    const expiresAt = typeof item.expiresAt === "string" ? Date.parse(item.expiresAt) : 0;
    if (!Number.isFinite(expiresAt) || expiresAt < now) continue;
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

async function fetchXPost(postId: string) {
  if (!X_BEARER_TOKEN) {
    throw new SocialProofError("X proof verification is not configured yet.", 503);
  }

  const url = new URL(`${X_API_BASE_URL}/tweets/${postId}`);
  url.searchParams.set("tweet.fields", "author_id,created_at,text,edit_history_tweet_ids");
  url.searchParams.set("expansions", "author_id");
  url.searchParams.set("user.fields", "id,name,username,verified");

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
    throw new SocialProofError(`Could not verify the X post: ${detail}`, res.status >= 500 ? 502 : 400);
  }

  const tweet = body?.data;
  const author = Array.isArray(body?.includes?.users)
    ? body.includes.users.find((user: any) => user?.id === tweet?.author_id)
    : null;

  if (!tweet?.id || !tweet?.text || !tweet?.created_at || !author?.username) {
    throw new SocialProofError("X did not return enough post details to verify membership.", 502);
  }

  return { tweet, author };
}

export async function verifyXProof(userId: string, postUrl: string): Promise<SocialProofRecord> {
  if (!userId) throw new SocialProofError("Unauthorized", 401);
  const challenge = await getLatestPendingChallenge(userId);
  if (!challenge) {
    throw new SocialProofError("Generate a fresh proof code before verifying your X post.");
  }

  const { postId, urlHandle } = parseXPostUrl(postUrl);
  await assertPostNotClaimed(postId, userId);

  const { tweet, author } = await fetchXPost(postId);
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
            UpdateExpression: "SET #status = :status, verifiedProofPostId = :postId, verifiedAt = :verifiedAt",
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
              "SET membershipStatus = :active, membershipProvider = :provider, membershipVerifiedAt = :verifiedAt, membershipProofPostUrl = :postUrl, membershipProofPostId = :postId, membershipProofHandle = :handle, xHandle = :handle, xProfileUrl = :profileUrl, proofRetentionPolicy = :policy",
            ExpressionAttributeValues: {
              ":active": "active",
              ":provider": "x",
              ":verifiedAt": verifiedAt,
              ":postUrl": canonicalPostUrl,
              ":postId": postId,
              ":handle": handle,
              ":profileUrl": profileUrl,
              ":policy": proofRetentionPolicy,
            },
          },
        },
      ],
    });
  } catch (err: any) {
    if (err?.name === "TransactionCanceledException") {
      throw new SocialProofError("That X post or X account has already been used for membership.", 409);
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
