import { BOARD_CANONICAL_URL } from "@/config/site";

export const AWS_REGION = process.env.REGION_AWS || process.env.AWS_REGION || "us-east-1";
export const NEXTAUTH_TABLE = (process.env.NEXTAUTH_TABLE || "PGPZBoardNextAuth").trim();
export const BETTER_AUTH_URL = (process.env.BETTER_AUTH_URL || "").trim() || undefined;
export const BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET || undefined;
export const BETTER_AUTH_TRUSTED_ORIGINS = process.env.BETTER_AUTH_TRUSTED_ORIGINS || undefined;
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || BOARD_CANONICAL_URL).trim();

export const BOARD_BASE_PATH = "/api/better-auth";
