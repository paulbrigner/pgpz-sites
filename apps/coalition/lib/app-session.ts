import "server-only";

import { accountCapabilitiesFor, type AccountCapabilities } from "@pgpz/core";
import { headers } from "next/headers";
import { auth } from "@/lib/better-auth";
import { withTrustedBetterAuthClientIp } from "@/lib/better-auth-client-ip";
import {
  appSessionUserFromRecord,
  ensureAppUserForEmail,
  normalizeEmail,
} from "@/lib/app-users";

export type AuthSessionProvider = "better-auth";

export type AppSession = {
  user: ReturnType<typeof appSessionUserFromRecord>;
  capabilities: AccountCapabilities;
  authUserId: string;
  authProvider: AuthSessionProvider;
};

export async function resolveAppSession(requestHeaders?: Headers): Promise<AppSession | null> {
  const headerSource = requestHeaders || ((await headers()) as unknown as Headers);
  const betterAuthSession = await auth.api.getSession({
    headers: withTrustedBetterAuthClientIp(headerSource),
    query: { disableRefresh: true },
  });
  const betterAuthEmail = normalizeEmail(betterAuthSession?.user?.email);
  const betterAuthUserId = typeof betterAuthSession?.user?.id === "string" ? betterAuthSession.user.id : "";
  if (!betterAuthEmail || !betterAuthUserId) return null;

  const appUser = await ensureAppUserForEmail({
    email: betterAuthEmail,
    preferredUserId: betterAuthUserId,
    name: typeof betterAuthSession?.user?.name === "string" ? betterAuthSession.user.name : null,
  });
  const user = appSessionUserFromRecord(appUser);
  const capabilities = accountCapabilitiesFor(user);
  if (!capabilities.accountActive) return null;

  return {
    user,
    capabilities,
    authUserId: betterAuthUserId,
    authProvider: "better-auth",
  };
}

export async function requireAppSession(requestHeaders?: Headers): Promise<AppSession> {
  const session = await resolveAppSession(requestHeaders);
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  return session;
}
