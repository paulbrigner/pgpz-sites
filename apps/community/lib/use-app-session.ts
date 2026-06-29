"use client";

import { useCallback, useEffect, useState } from "react";
import { signOut as nextAuthSignOut } from "next-auth/react";
import { signOut as betterAuthSignOut } from "@/lib/better-auth-client";
import type { AppSession, AuthSessionProvider } from "@/lib/app-session";

type SessionStatus = "loading" | "authenticated" | "unauthenticated";

export function useAppSession() {
  const [data, setData] = useState<AppSession | null>(null);
  const [status, setStatus] = useState<SessionStatus>("loading");

  const update = useCallback(async (_data?: unknown) => {
    setStatus((current) => (current === "authenticated" ? current : "loading"));
    const res = await fetch("/api/auth/session/app", { cache: "no-store" });
    if (!res.ok) {
      setData(null);
      setStatus("unauthenticated");
      return null;
    }
    const body = (await res.json().catch(() => null)) as AppSession | null;
    setData(body?.user?.id ? body : null);
    setStatus(body?.user?.id ? "authenticated" : "unauthenticated");
    return body;
  }, []);

  useEffect(() => {
    void update();
  }, [update]);

  const signOut = useCallback(
    async ({ callbackUrl = "/" }: { callbackUrl?: string } = {}) => {
      const provider = data?.authProvider as AuthSessionProvider | undefined;
      if (provider === "better-auth") {
        try {
          await betterAuthSignOut();
        } finally {
          window.location.assign(callbackUrl);
        }
        return;
      }
      await nextAuthSignOut({ callbackUrl });
    },
    [data?.authProvider],
  );

  return { data, status, update, signOut };
}
