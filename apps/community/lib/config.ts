const parseNumber = (value: string | undefined): number | null => {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const trimBaseUrl = (value: string | undefined, fallback: string) => {
  const trimmed = (value || "").trim();
  return (trimmed || fallback).replace(/\/+$/, "");
};

export const AWS_REGION = process.env.REGION_AWS || process.env.AWS_REGION || "us-east-1";
export const PGPZ_AWS_ACCESS_KEY_ID = process.env.PGPZ_AWS_ACCESS_KEY_ID as string | undefined;
export const PGPZ_AWS_SECRET_ACCESS_KEY = process.env.PGPZ_AWS_SECRET_ACCESS_KEY as string | undefined;
export const NEXTAUTH_URL = process.env.NEXTAUTH_URL as string;
export const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET as string;
export const NEXTAUTH_TABLE = process.env.NEXTAUTH_TABLE as string;

export const EMAIL_SERVER = process.env.EMAIL_SERVER as string;
export const EMAIL_FROM = process.env.EMAIL_FROM as string;
export const EMAIL_SERVER_HOST = process.env.EMAIL_SERVER_HOST as string | undefined;
export const EMAIL_SERVER_PORT = process.env.EMAIL_SERVER_PORT as string | undefined;
export const EMAIL_SERVER_USER = process.env.EMAIL_SERVER_USER as string | undefined;
export const EMAIL_SERVER_PASSWORD = process.env.EMAIL_SERVER_PASSWORD as string | undefined;
export const EMAIL_SERVER_SECURE = process.env.EMAIL_SERVER_SECURE as string | undefined;

export const CLOUDFRONT_DOMAIN = process.env.CLOUDFRONT_DOMAIN as string;
export const KEY_PAIR_ID = process.env.KEY_PAIR_ID as string;
export const PRIVATE_KEY_SECRET = (process.env.PRIVATE_KEY_SECRET || "").replace(/\\n/g, "\n") as string;
export const POLICY_UPDATE_UPLOAD_BUCKET =
  (process.env.POLICY_UPDATE_UPLOAD_BUCKET ||
    process.env.CONTENT_UPLOAD_BUCKET ||
    process.env.PGPZ_CONTENT_BUCKET) as string | undefined;
export const POLICY_UPDATE_UPLOAD_PREFIX =
  (process.env.POLICY_UPDATE_UPLOAD_PREFIX || "policy-updates/uploads").replace(/^\/+|\/+$/g, "");

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXTAUTH_URL ||
  "https://community.pgpz.org";

export const X_BEARER_TOKEN =
  (process.env.X_BEARER_TOKEN || process.env.XMON_X_API_BEARER_TOKEN) as string | undefined;
export const X_API_BASE_URL = trimBaseUrl(process.env.X_API_BASE_URL || process.env.XMON_X_API_BASE_URL, "https://api.x.com/2");
export const X_API_TIMEOUT_MS = parseNumber(process.env.X_API_TIMEOUT_MS) || 15000;
export const X_PROOF_CHALLENGE_TTL_MINUTES =
  parseNumber(process.env.X_PROOF_CHALLENGE_TTL_MINUTES) || 1440;
export const X_PROOF_RATE_LIMIT_WINDOW_MINUTES =
  parseNumber(process.env.X_PROOF_RATE_LIMIT_WINDOW_MINUTES) || 15;
export const X_PROOF_CHALLENGE_RATE_LIMIT =
  parseNumber(process.env.X_PROOF_CHALLENGE_RATE_LIMIT) || 10;
export const X_PROOF_VERIFY_RATE_LIMIT =
  parseNumber(process.env.X_PROOF_VERIFY_RATE_LIMIT) || 6;
export const X_PROOF_AUTOVERIFY_WINDOW_MINUTES =
  parseNumber(process.env.X_PROOF_AUTOVERIFY_WINDOW_MINUTES) || 1440;
export const X_PROOF_AUTOVERIFY_BATCH_SIZE =
  parseNumber(process.env.X_PROOF_AUTOVERIFY_BATCH_SIZE) || 25;
export const X_PROOF_AUTOVERIFY_GROUP_SIZE =
  parseNumber(process.env.X_PROOF_AUTOVERIFY_GROUP_SIZE) || 5;
export const X_PROOF_AUTOVERIFY_MAX_ATTEMPTS =
  parseNumber(process.env.X_PROOF_AUTOVERIFY_MAX_ATTEMPTS) || 8;
export const SOCIAL_PROOF_AUTOVERIFY_SECRET =
  process.env.SOCIAL_PROOF_AUTOVERIFY_SECRET as string | undefined;

export const MEMBERSHIP_PROOF_RETENTION_POLICY =
  process.env.MEMBERSHIP_PROOF_RETENTION_POLICY || "valid_if_deleted";
