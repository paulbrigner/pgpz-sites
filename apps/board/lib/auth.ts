import "server-only";

import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import {
  createBetterAuthDynamoDBAdapter,
  createBetterAuthDynamoDBRateLimitStorage,
} from "@pgpz/auth-dynamodb";
import { resolveSigningSecret } from "@pgpz/core";
import { resolveActiveMembership } from "@pgpz/core/server";
import {
  BETTER_AUTH_SECRET,
  BETTER_AUTH_TRUSTED_ORIGINS,
  BETTER_AUTH_URL,
  BOARD_BASE_PATH,
  SITE_URL,
} from "@/lib/config";
import { documentClient, TABLE_NAME } from "@/lib/dynamodb";
import { boardMembershipAdapter } from "@/config/server";
import { auditBestEffort, authenticatedActor } from "@/lib/audit";

const database = createBetterAuthDynamoDBAdapter({
  documentClient,
  tableName: TABLE_NAME,
});

const rateLimitStorage = createBetterAuthDynamoDBRateLimitStorage({
  documentClient,
  tableName: TABLE_NAME,
});

function configuredBaseUrl() {
  return BETTER_AUTH_URL || SITE_URL;
}

function configuredSecret() {
  return (
    resolveSigningSecret({
      name: "BETTER_AUTH_SECRET",
      value: BETTER_AUTH_SECRET,
      nodeEnv: process.env.NODE_ENV,
    }) ||
    // Development and test fallback only; production requires a real secret.
    "board-development-secret-never-use-in-production-0001"
  );
}

function configuredTrustedOrigins() {
  const origins = new Set<string>();
  const baseUrl = configuredBaseUrl();
  if (baseUrl) origins.add(new URL(baseUrl).origin);
  for (const rawOrigin of (BETTER_AUTH_TRUSTED_ORIGINS || "").split(/[\s,]+/)) {
    const origin = rawOrigin.trim();
    if (origin) origins.add(origin);
  }
  return Array.from(origins);
}

export const auth = betterAuth({
  appName: "PGPZ Board",
  baseURL: configuredBaseUrl(),
  basePath: BOARD_BASE_PATH,
  secret: configuredSecret(),
  database,
  trustedOrigins: configuredTrustedOrigins(),
  user: {
    modelName: "better_auth_users",
  },
  session: {
    modelName: "better_auth_sessions",
  },
  account: {
    modelName: "better_auth_accounts",
  },
  verification: {
    modelName: "better_auth_verifications",
    storeIdentifier: "hashed",
    disableCleanup: true,
  },
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
  },
  plugins: [nextCookies()],
  rateLimit: {
    enabled: true,
    customStorage: rateLimitStorage,
  },
  databaseHooks: {
    session: {
      create: {
        after: async (session, context) => {
          const userId = typeof session.userId === "string" ? session.userId : "";
          if (!userId || !context) return;
          const user = await context.context.internalAdapter
            .findUserById(userId)
            .catch(() => null);
          const email =
            typeof user?.email === "string" ? user.email.trim().toLowerCase() : "";
          if (!email) return;
          const membership = await resolveActiveMembership(boardMembershipAdapter, {
            email,
          }).catch(() => null);
          const role =
            typeof membership?.attributes?.role === "string"
              ? membership.attributes.role
              : "member";
          const isAdmin = membership?.attributes?.isAdmin === true;
          // Best-effort: audit failures must never break an otherwise
          // successful sign-in or leave a half-open session.
          await auditBestEffort({
            category: "authentication",
            action: "sign_in",
            outcome: "success",
            actor: authenticatedActor({ id: userId, email, role, isAdmin }),
          });
        },
      },
    },
  },
});
