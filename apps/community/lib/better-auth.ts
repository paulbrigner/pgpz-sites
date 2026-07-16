import { betterAuth, type BetterAuthOptions, type BetterAuthPlugin } from "better-auth";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - nodemailer types are not installed in this app.
import nodemailer from "nodemailer";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import {
  BETTER_AUTH_SECRET,
  BETTER_AUTH_TRUSTED_ORIGINS,
  BETTER_AUTH_URL,
  EMAIL_FROM,
  EMAIL_SERVER,
  EMAIL_SERVER_HOST,
  EMAIL_SERVER_PASSWORD,
  EMAIL_SERVER_PORT,
  EMAIL_SERVER_SECURE,
  EMAIL_SERVER_USER,
  SITE_URL,
} from "@/lib/config";
import { betterAuthDynamoDBAdapter } from "@/lib/better-auth-dynamodb-adapter";
import { betterAuthDynamoDBRateLimitStorage } from "@/lib/better-auth-rate-limit";
import { BETTER_AUTH_CLIENT_IP_HEADER } from "@/lib/better-auth-client-ip";
import { BETTER_AUTH_BASE_PATH, BETTER_AUTH_EMAIL_PROVIDER_ID } from "@/lib/better-auth-constants";
import { assertLegalAcceptanceForAccountEmail } from "@/lib/account-signin-eligibility";
import { recordEmailEvent } from "@/lib/admin/email-log";
import { recordAccessEvent } from "@/lib/admin/access-log";
import { buildMagicLinkEmail } from "@/lib/system-email";
import { appSessionUserFromRecord, ensureAppUserForEmail, normalizeEmail } from "@/lib/app-users";

const trimValue = (value: string | undefined | null) => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || null;
};

const configuredBaseUrl = () =>
  trimValue(BETTER_AUTH_URL) || trimValue(SITE_URL) || undefined;

const configuredSecret = () =>
  trimValue(BETTER_AUTH_SECRET) || undefined;

const configuredTrustedOrigins = () => {
  const origins = new Set<string>();
  const baseUrl = configuredBaseUrl();
  if (baseUrl) origins.add(baseUrl);
  if (SITE_URL) origins.add(SITE_URL);
  for (const rawOrigin of (BETTER_AUTH_TRUSTED_ORIGINS || "").split(/[,\s]+/)) {
    const origin = rawOrigin.trim();
    if (origin) origins.add(origin);
  }
  return Array.from(origins);
};

const emailServerConfig = (() => {
  if (EMAIL_SERVER_HOST) {
    return {
      host: EMAIL_SERVER_HOST,
      port: EMAIL_SERVER_PORT ? Number(EMAIL_SERVER_PORT) : 587,
      secure: EMAIL_SERVER_SECURE === "true",
      auth:
        EMAIL_SERVER_USER && EMAIL_SERVER_PASSWORD
          ? { user: EMAIL_SERVER_USER, pass: EMAIL_SERVER_PASSWORD }
          : undefined,
    } as any;
  }

  if (EMAIL_SERVER && EMAIL_SERVER.includes("://")) return EMAIL_SERVER as any;

  if (EMAIL_SERVER) {
    return {
      host: EMAIL_SERVER,
      port: EMAIL_SERVER_PORT ? Number(EMAIL_SERVER_PORT) : 587,
      secure: EMAIL_SERVER_SECURE === "true",
      auth:
        EMAIL_SERVER_USER && EMAIL_SERVER_PASSWORD
          ? { user: EMAIL_SERVER_USER, pass: EMAIL_SERVER_PASSWORD }
          : undefined,
    } as any;
  }

  return undefined as any;
})();

async function sendBetterAuthMagicLink({ email, url }: { email: string; url: string }) {
  const identifier = normalizeEmail(email);
  const { host } = new URL(url);
  const built = buildMagicLinkEmail({ url, host });
  await assertLegalAcceptanceForAccountEmail(identifier, url);

  if (!emailServerConfig || !EMAIL_FROM) {
    throw new Error("Email delivery is not configured.");
  }

  const transporter = nodemailer.createTransport(emailServerConfig);
  let failureLogged = false;

  try {
    const result = await transporter.sendMail({
      to: identifier,
      from: EMAIL_FROM,
      subject: built.subject,
      text: built.text,
      html: built.html,
    });

    const rejected = (result.rejected || []).filter(Boolean).map(String);
    const pending = (result.pending || []).filter(Boolean).map(String);
    const failed = rejected.concat(pending);

    if (failed.length) {
      const error = `Email (${failed.join(", ")}) could not be sent`;
      try {
        await recordEmailEvent({
          email: identifier,
          type: "magic-link",
          subject: built.subject,
          status: "failed",
          providerMessageId: result?.messageId ? String(result.messageId) : null,
          error,
          metadata: { host, provider: "better-auth", rejected, pending },
        });
        failureLogged = true;
      } catch (logErr) {
        console.error("Better Auth magic-link email failure logging failed:", logErr);
      }
      throw new Error(error);
    }

    try {
      await recordEmailEvent({
        email: identifier,
        type: "magic-link",
        subject: built.subject,
        status: "sent",
        providerMessageId: result?.messageId ? String(result.messageId) : null,
        metadata: { host, provider: "better-auth" },
      });
    } catch (logErr) {
      console.error("Better Auth magic-link email sent logging failed:", logErr);
    }
  } catch (err: any) {
    if (!failureLogged) {
      try {
        await recordEmailEvent({
          email: identifier,
          type: "magic-link",
          subject: built.subject,
          status: "failed",
          error: typeof err?.message === "string" ? err.message : "Failed to send magic-link email",
          metadata: { host, provider: "better-auth" },
        });
      } catch (logErr) {
        console.error("Better Auth magic-link email exception logging failed:", logErr);
      }
    }
    throw err;
  }
}

function betterAuthPlugins(): BetterAuthPlugin[] {
  return [
    magicLink({
      expiresIn: 60 * 60 * 24,
      storeToken: "hashed",
      sendMagicLink: async ({ email, url }) => {
        await sendBetterAuthMagicLink({ email, url });
      },
    }),
    nextCookies(),
  ];
}

async function recordBetterAuthLogin(email: string, betterAuthUserId: string) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !betterAuthUserId) return;

  const user = await ensureAppUserForEmail({
    email: normalizedEmail,
    preferredUserId: betterAuthUserId,
  });
  const sessionUser = appSessionUserFromRecord(user);

  await recordAccessEvent({
    eventType: "login",
    authProvider: "better-auth",
    userId: user.id ? String(user.id) : betterAuthUserId,
    email: normalizedEmail,
    name: sessionUser.name,
    membershipStatus: sessionUser.membershipStatus,
  });
}

export const auth = betterAuth({
  appName: "PGPZ Community",
  baseURL: configuredBaseUrl(),
  basePath: BETTER_AUTH_BASE_PATH,
  secret: configuredSecret(),
  database: betterAuthDynamoDBAdapter,
  plugins: betterAuthPlugins(),
  trustedOrigins: configuredTrustedOrigins(),
  advanced: {
    ipAddress: {
      ipAddressHeaders: [BETTER_AUTH_CLIENT_IP_HEADER, "x-forwarded-for"],
      ipv6Subnet: 64,
    },
  },
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
  rateLimit: {
    enabled: true,
    customStorage: betterAuthDynamoDBRateLimitStorage,
  },
  databaseHooks: {
    session: {
      create: {
        after: async (session, context) => {
          const userId = typeof session.userId === "string" ? session.userId : "";
          const user = userId && context ? await context.context.internalAdapter.findUserById(userId) : null;
          const email = normalizeEmail(user?.email);
          if (!email) return;
          await recordBetterAuthLogin(email, userId);
        },
      },
    },
  },
  onAPIError: {
    errorURL: "/signin",
    onError(error) {
      console.warn("[better-auth] api error", error);
    },
  },
} satisfies BetterAuthOptions);

export { BETTER_AUTH_EMAIL_PROVIDER_ID };
