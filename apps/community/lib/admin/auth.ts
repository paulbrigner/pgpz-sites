import 'server-only';

import { resolveAppSession, type AppSession } from "@/lib/app-session";

export class AdminAccessError extends Error {
  constructor(message = "Admin access required") {
    super(message);
    this.name = "AdminAccessError";
  }
}

export async function getAdminSession(): Promise<AppSession | null> {
  const session = await resolveAppSession();
  if (!session?.user?.isAdmin) return null;
  return session;
}

export async function requireAdminSession(): Promise<AppSession> {
  const session = await getAdminSession();
  if (!session) {
    throw new AdminAccessError();
  }
  return session;
}

export function isAdminSession(session: AppSession | null | undefined): boolean {
  return !!session?.user?.isAdmin;
}
