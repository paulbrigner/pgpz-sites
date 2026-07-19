"use client";

import {
  createContext,
  createElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { signOut as betterAuthSignOut } from "@/lib/better-auth-client";
import type { AppSession } from "@/lib/app-session";

type SessionStatus = "loading" | "authenticated" | "unauthenticated";

type AppSessionContextValue = {
  data: AppSession | null;
  status: SessionStatus;
  update: (_data?: unknown) => Promise<AppSession | null>;
  signOut: (options?: { callbackUrl?: string }) => Promise<void>;
};

const AppSessionContext = createContext<AppSessionContextValue | null>(null);

export function AppSessionProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppSession | null>(null);
  const [status, setStatus] = useState<SessionStatus>("loading");
  const inFlight = useRef<Promise<AppSession | null> | null>(null);
  const queuedRefresh = useRef<Promise<AppSession | null> | null>(null);

  const load = useCallback(() => {
    if (inFlight.current) return inFlight.current;

    setStatus((current) => (current === "authenticated" ? current : "loading"));
    const request = (async () => {
      try {
        const res = await fetch("/api/auth/session/app", { cache: "no-store" });
        if (!res.ok) {
          setData(null);
          setStatus("unauthenticated");
          return null;
        }

        const body = (await res.json().catch(() => null)) as AppSession | null;
        const next = body?.user?.id ? body : null;
        setData(next);
        setStatus(next ? "authenticated" : "unauthenticated");
        return next;
      } catch {
        setData(null);
        setStatus("unauthenticated");
        return null;
      } finally {
        inFlight.current = null;
      }
    })();

    inFlight.current = request;
    return request;
  }, []);

  const update = useCallback((_data?: unknown) => {
    const activeRequest = inFlight.current;
    if (!activeRequest) return load();
    if (queuedRefresh.current) return queuedRefresh.current;

    const refreshAfterActiveRequest = () => {
      queuedRefresh.current = null;
      return load();
    };
    const refresh = activeRequest.then(
      refreshAfterActiveRequest,
      refreshAfterActiveRequest,
    );
    queuedRefresh.current = refresh;
    return refresh;
  }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  const signOut = useCallback(async ({ callbackUrl = "/" }: { callbackUrl?: string } = {}) => {
    try {
      await betterAuthSignOut();
    } finally {
      await fetch("/api/auth/session/legacy", { method: "DELETE" }).catch(() => undefined);
      setData(null);
      setStatus("unauthenticated");
      window.location.assign(callbackUrl);
    }
  }, []);

  const value = useMemo(
    () => ({ data, status, update, signOut }),
    [data, signOut, status, update],
  );

  return createElement(AppSessionContext.Provider, { value }, children);
}

export function useAppSession() {
  const context = useContext(AppSessionContext);
  if (!context) {
    throw new Error("useAppSession must be used within AppSessionProvider");
  }
  return context;
}
