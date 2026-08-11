import "server-only";

import { canAccessAdminFeatures, isAccountActive } from "@pgpz/core";
import {
  ZCASHME_ADMIN_DRY_RUN_ENABLED,
  ZCASHME_VERIFICATION_ALLOWED_EMAILS,
  ZCASHME_VERIFICATION_ENABLED,
} from "@/lib/config";

type AccessUser = Record<string, unknown> & {
  email?: string | null;
  membershipStatus?: string | null;
};

export type ZcashMeAccess = {
  canActivate: boolean;
  canAdminDryRun: boolean;
};

export type ZcashMeAccessConfig = {
  verificationEnabled: boolean;
  allowedEmails: string;
  adminDryRunEnabled: boolean;
};

export function parseZcashMeAllowedEmails(value: string): Set<string> {
  return new Set(
    value
      .split(/[\s,;]+/)
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function evaluateZcashMeAccess(
  user: AccessUser | null | undefined,
  config: ZcashMeAccessConfig,
): ZcashMeAccess {
  const normalizedEmail = typeof user?.email === "string" ? user.email.trim().toLowerCase() : "";
  const allowedEmails = parseZcashMeAllowedEmails(config.allowedEmails);
  const activationOpenToAll = allowedEmails.has("*");
  const activeAccount = Boolean(user && isAccountActive(user));

  return {
    canActivate:
      activeAccount &&
      user?.membershipStatus !== "active" &&
      config.verificationEnabled &&
      Boolean(normalizedEmail) &&
      (activationOpenToAll || allowedEmails.has(normalizedEmail)),
    canAdminDryRun:
      activeAccount &&
      config.adminDryRunEnabled &&
      canAccessAdminFeatures(user),
  };
}

export function getZcashMeAccess(user: AccessUser | null | undefined): ZcashMeAccess {
  return evaluateZcashMeAccess(user, {
    verificationEnabled: ZCASHME_VERIFICATION_ENABLED,
    allowedEmails: ZCASHME_VERIFICATION_ALLOWED_EMAILS,
    adminDryRunEnabled: ZCASHME_ADMIN_DRY_RUN_ENABLED,
  });
}
