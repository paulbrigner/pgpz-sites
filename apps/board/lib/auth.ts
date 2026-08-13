import "server-only";

import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import nodemailer from "nodemailer";
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
  BOARD_ACCESS_REGISTRY_ENABLED,
  BOARD_BASE_PATH,
  BOARD_PASSWORDLESS_AUTH_ENABLED,
  BOARD_PASSWORD_AUTH_ENABLED,
  SITE_URL,
} from "@/lib/config";
import { documentClient, TABLE_NAME } from "@/lib/dynamodb";
import { boardMembershipAdapter } from "@/config/server";
import { auditBestEffort, authenticatedActor } from "@/lib/audit";
import { assertBoardEmailReady } from "@/lib/email-transport";
import { buildBoardMagicLinkEmail } from "@/lib/magic-link-email";
import { createBoardPasskeyPlugin } from "@/lib/passkey-config";
import { boardAccessRepository } from "@/lib/board-access-repository";

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

async function sendBoardMagicLink({ email, url }: { email: string; url: string }) {
  const normalizedEmail = email.trim().toLowerCase();
  const registryAccess = BOARD_ACCESS_REGISTRY_ENABLED
    ? await boardAccessRepository.getByEmail(normalizedEmail).catch(() => null)
    : null;
  const legacyAccess = BOARD_ACCESS_REGISTRY_ENABLED
    ? null
    : await resolveActiveMembership(boardMembershipAdapter, { email: normalizedEmail }).catch(() => null);
  const authorized = registryAccess
    ? registryAccess.status === "active" || registryAccess.status === "invited"
    : legacyAccess?.active === true;
  if (!authorized) throw new Error("Board access is not active.");
  try {
    const { transport, from } = assertBoardEmailReady();
    const message = buildBoardMagicLinkEmail(url);
    const transporter = nodemailer.createTransport(transport as never);
    await transporter.sendMail({ from, to: normalizedEmail, ...message });
    await auditBestEffort({
      category: "authentication",
      action: "magic_link_sent",
      outcome: "success",
      actor: { type: "anonymous-claimed", userId: null, email: normalizedEmail, role: null, capabilities: [] },
    });
  } catch (error) {
    await auditBestEffort({
      category: "authentication",
      action: "magic_link_sent",
      outcome: "failure",
      reason: "delivery_failed",
      actor: { type: "anonymous-claimed", userId: null, email: normalizedEmail, role: null, capabilities: [] },
    });
    throw error;
  }
}

function passwordlessPlugins() {
  if (!BOARD_PASSWORDLESS_AUTH_ENABLED) return [];
  return [
    magicLink({
      expiresIn: 10 * 60,
      storeToken: "hashed",
      disableSignUp: true,
      sendMagicLink: sendBoardMagicLink,
    }),
    createBoardPasskeyPlugin(configuredBaseUrl()),
  ];
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
    enabled: BOARD_PASSWORD_AUTH_ENABLED,
    disableSignUp: true,
    minPasswordLength: 12,
  },
  plugins: [...passwordlessPlugins(), nextCookies()],
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
