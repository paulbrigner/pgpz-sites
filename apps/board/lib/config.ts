import { BOARD_CANONICAL_URL } from "@/config/site";

export const AWS_REGION = process.env.REGION_AWS || process.env.AWS_REGION || "us-east-1";
export const NEXTAUTH_TABLE = (process.env.NEXTAUTH_TABLE || "PGPZBoardNextAuth").trim();
export const BETTER_AUTH_URL = (process.env.BETTER_AUTH_URL || "").trim() || undefined;
export const BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET || undefined;
export const BETTER_AUTH_TRUSTED_ORIGINS = process.env.BETTER_AUTH_TRUSTED_ORIGINS || undefined;
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || BOARD_CANONICAL_URL).trim();

/** Passwordless is enabled by default. Password sign-in is retired unless a
 * deliberate emergency rollback explicitly opts back in. */
export const BOARD_PASSWORDLESS_AUTH_ENABLED =
  process.env.BOARD_PASSWORDLESS_AUTH_ENABLED?.trim().toLowerCase() !== "false";
export const BOARD_PASSWORD_AUTH_ENABLED =
  process.env.BOARD_PASSWORD_AUTH_ENABLED?.trim().toLowerCase() === "true";
export const BOARD_ACCESS_REGISTRY_ENABLED =
  process.env.BOARD_ACCESS_REGISTRY_ENABLED?.trim().toLowerCase() === "true";

export const EMAIL_FROM = (process.env.EMAIL_FROM || "").trim();
export const EMAIL_TRANSPORT = (process.env.EMAIL_TRANSPORT || "").trim();
export const EMAIL_SERVER = (process.env.EMAIL_SERVER || "").trim();
export const EMAIL_SERVER_HOST = (process.env.EMAIL_SERVER_HOST || "").trim();
export const EMAIL_SERVER_PORT = (process.env.EMAIL_SERVER_PORT || "").trim();
export const EMAIL_SERVER_SECURE = (process.env.EMAIL_SERVER_SECURE || "").trim();
export const EMAIL_SERVER_USER = (process.env.EMAIL_SERVER_USER || "").trim();
export const EMAIL_SERVER_PASSWORD = process.env.EMAIL_SERVER_PASSWORD || "";

export const BOARD_BASE_PATH = "/api/better-auth";

// Governance infrastructure (emitted by the PgpzBoardBackend stack outputs).
// The vault and audit ledger are fail-closed / no-ops while these are unset.
export const BOARD_DOCUMENTS_TABLE = (process.env.BOARD_DOCUMENTS_TABLE || "PGPZBoardDocuments").trim();
export const BOARD_AUDIT_TABLE = (process.env.BOARD_AUDIT_TABLE || "PGPZBoardAuditLog").trim();
export const BOARD_ACCESS_TABLE = (process.env.BOARD_ACCESS_TABLE || "PGPZBoardAccess").trim();
export const BOARD_MEETINGS_TABLE = (process.env.BOARD_MEETINGS_TABLE || "PGPZBoardMeetings").trim();
export const BOARD_DOCUMENTS_STAGING_BUCKET = (process.env.BOARD_DOCUMENTS_STAGING_BUCKET || "").trim();
export const BOARD_DOCUMENTS_RETAINED_BUCKET = (process.env.BOARD_DOCUMENTS_RETAINED_BUCKET || "").trim();
/** Local-only filesystem root for exercising governed document workflows.
 * Production deliberately ignores this setting and always uses S3. */
export const BOARD_DOCUMENTS_LOCAL_STORAGE_PATH =
  process.env.NODE_ENV === "production"
    ? ""
    : (process.env.BOARD_DOCUMENTS_LOCAL_STORAGE_PATH || "").trim();
export const BOARD_AUDIT_ARCHIVE_BUCKET = (process.env.BOARD_AUDIT_ARCHIVE_BUCKET || "").trim();
export const BOARD_KMS_KEY_ID = (process.env.BOARD_KMS_KEY_ID || "").trim();
