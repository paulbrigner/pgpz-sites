"use client";

import { useCallback, useEffect, useState } from "react";
import { signOut as betterAuthSignOut } from "@/lib/better-auth-client";
import type { AppSession } from "@/lib/app-session";

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

  const signOut = useCallback(async ({ callbackUrl = "/" }: { callbackUrl?: string } = {}) => {
    try {
      await betterAuthSignOut();
    } finally {
      await fetch("/api/auth/session/legacy", { method: "DELETE" }).catch(() => undefined);
      window.location.assign(callbackUrl);
    }
  }, []);

  return { data, status, update, signOut };
}
