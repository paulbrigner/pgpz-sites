import { BOARD_CANONICAL_URL } from "@/config/site";

export const AWS_REGION = process.env.REGION_AWS || process.env.AWS_REGION || "us-east-1";
export const NEXTAUTH_TABLE = (process.env.NEXTAUTH_TABLE || "PGPZBoardNextAuth").trim();
export const BETTER_AUTH_URL = (process.env.BETTER_AUTH_URL || "").trim() || undefined;
export const BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET || undefined;
export const BETTER_AUTH_TRUSTED_ORIGINS = process.env.BETTER_AUTH_TRUSTED_ORIGINS || undefined;
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || BOARD_CANONICAL_URL).trim();

export const BOARD_BASE_PATH = "/api/better-auth";

// Governance infrastructure (emitted by the PgpzBoardBackend stack outputs).
// The vault and audit ledger are fail-closed / no-ops while these are unset.
export const BOARD_DOCUMENTS_TABLE = (process.env.BOARD_DOCUMENTS_TABLE || "PGPZBoardDocuments").trim();
export const BOARD_AUDIT_TABLE = (process.env.BOARD_AUDIT_TABLE || "PGPZBoardAuditLog").trim();
export const BOARD_DOCUMENTS_STAGING_BUCKET = (process.env.BOARD_DOCUMENTS_STAGING_BUCKET || "").trim();
export const BOARD_DOCUMENTS_RETAINED_BUCKET = (process.env.BOARD_DOCUMENTS_RETAINED_BUCKET || "").trim();
export const BOARD_AUDIT_ARCHIVE_BUCKET = (process.env.BOARD_AUDIT_ARCHIVE_BUCKET || "").trim();
export const BOARD_KMS_KEY_ID = (process.env.BOARD_KMS_KEY_ID || "").trim();
