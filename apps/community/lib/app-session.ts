import "server-only";

import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { auth } from "@/lib/better-auth";
import {
  appSessionUserFromRecord,
  ensureAppUserForEmail,
  findAppUserByEmail,
  getAppUserById,
  normalizeEmail,
} from "@/lib/app-users";

export type AuthSessionProvider = "next-auth" | "better-auth";

export type AppSession = {
  user: ReturnType<typeof appSessionUserFromRecord>;
  authProvider: AuthSessionProvider;
};

export async function resolveAppSession(requestHeaders?: Headers): Promise<AppSession | null> {
  const nextAuthSession = (await getServerSession(authOptions as any)) as any;
  const nextAuthUser = (nextAuthSession?.user || {}) as any;
  const nextAuthUserId = typeof nextAuthUser.id === "string" ? nextAuthUser.id : "";
  const nextAuthEmail = normalizeEmail(nextAuthUser.email);
  if (nextAuthUserId || nextAuthEmail) {
    const user =
      (nextAuthUserId ? await getAppUserById(nextAuthUserId) : null) ||
      (nextAuthEmail ? await findAppUserByEmail(nextAuthEmail) : null);
    if (user?.id) {
      return { user: appSessionUserFromRecord(user), authProvider: "next-auth" };
    }
  }

  const headerSource = requestHeaders || ((await headers()) as unknown as Headers);
  const betterAuthSession = await auth.api.getSession({
    headers: headerSource,
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

  return { user: appSessionUserFromRecord(appUser), authProvider: "better-auth" };
}

export async function requireAppSession(requestHeaders?: Headers): Promise<AppSession> {
  const session = await resolveAppSession(requestHeaders);
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  return session;
}
