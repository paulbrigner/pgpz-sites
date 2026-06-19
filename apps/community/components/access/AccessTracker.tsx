"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";

export function AccessTracker() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const lastTracked = useRef("");
  const userId = (session?.user as any)?.id || "";

  useEffect(() => {
    if (status !== "authenticated" || !userId || !pathname) return;

    const search = window.location.search || "";
    const path = `${pathname}${search}`.slice(0, 2048);
    if (path.startsWith("/api/")) return;

    const trackingKey = `${userId}:${path}`;
    if (lastTracked.current === trackingKey) return;
    lastTracked.current = trackingKey;

    const payload = JSON.stringify({
      path,
      title: document.title || "",
      referrer: document.referrer || "",
    });

    if (navigator.sendBeacon) {
      const queued = navigator.sendBeacon(
        "/api/access-log/page-view",
        new Blob([payload], { type: "application/json" }),
      );
      if (queued) return;
    }

    void fetch("/api/access-log/page-view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => undefined);
  }, [pathname, status, userId]);

  return null;
}
