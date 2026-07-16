"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Eye, LogIn, RefreshCcw, Search } from "lucide-react";
import { SensitiveDataText } from "@/components/admin/sensitive-data";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AccessEventType = "login" | "page_view";
type AccessAuthProvider = "better-auth" | "next-auth";

type AccessLogEvent = {
  id: string;
  eventType: AccessEventType;
  createdAt: string;
  userId: string | null;
  email: string | null;
  name: string | null;
  membershipStatus: string | null;
  authProvider: AccessAuthProvider | null;
  path: string | null;
  title: string | null;
  referrer: string | null;
  userAgent: string | null;
  ipAddress: string | null;
};

type AccessLogResponse = {
  events: AccessLogEvent[];
  meta: {
    returned: number;
    totalCount: number;
    loginCount: number;
    pageViewCount: number;
    uniqueMemberCount: number;
    betterAuthCount: number;
    nextAuthCount: number;
    unknownAuthProviderCount: number;
    since: string | null;
    complete: boolean;
  };
};

const formatDateTime = (value: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const eventLabel = (eventType: AccessEventType) =>
  eventType === "login" ? "Login" : "Page view";

const authProviderLabel = (provider: AccessAuthProvider | null) =>
  provider === "better-auth" ? "Better Auth" : provider === "next-auth" ? "NextAuth" : "Unattributed";

const memberLabel = (event: AccessLogEvent) =>
  event.name || event.email || event.userId || "Unknown member";

export function AccessLogPanel() {
  const [events, setEvents] = useState<AccessLogEvent[]>([]);
  const [meta, setMeta] = useState<AccessLogResponse["meta"] | null>(null);
  const [eventType, setEventType] = useState<"all" | AccessEventType>("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAccessLog = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "200", days: "30" });
      if (eventType !== "all") params.set("eventType", eventType);
      const res = await fetch(`/api/admin/access-log?${params.toString()}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to load access log");
      setEvents(Array.isArray(body.events) ? body.events : []);
      setMeta(body.meta || null);
    } catch (err: any) {
      setError(err?.message || "Failed to load access log");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAccessLog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventType]);

  const filteredEvents = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return events;
    return events.filter((event) => {
      const haystack = [
        event.name,
        event.email,
        event.membershipStatus,
        event.authProvider,
        event.path,
        event.title,
        event.referrer,
        event.ipAddress,
        event.userAgent,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalized);
    });
  }, [events, query]);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {[
          ["30-day events", meta?.totalCount ?? events.length],
          ["Logins", meta?.loginCount ?? 0],
          ["Page views", meta?.pageViewCount ?? 0],
          ["Members", meta?.uniqueMemberCount ?? 0],
          ["Better Auth", meta?.betterAuthCount ?? 0],
          ["NextAuth", meta?.nextAuthCount ?? 0],
          ["Unattributed", meta?.unknownAuthProviderCount ?? 0],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border bg-white/80 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</div>
            <div className="mt-2 text-2xl font-semibold text-[var(--brand-ink)]">{value}</div>
          </div>
        ))}
      </div>

      {meta && !meta.complete ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Provider totals are incomplete because the 30-day query exceeded the safety page limit.
        </div>
      ) : null}

      <div className="rounded-lg border bg-white/85 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative max-w-xl flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search member, email, path, referrer, IP, or device"
              className="w-full rounded-md border py-2 pl-9 pr-3 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              ["all", "All"],
              ["login", "Logins"],
              ["page_view", "Page views"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setEventType(value as typeof eventType)}
                className={cn(
                  "rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em]",
                  eventType === value
                    ? "border-[var(--brand-ink)] bg-[var(--brand-ink)] text-[var(--zcash-gold)]"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-400",
                )}
              >
                {label}
              </button>
            ))}
            <Button type="button" variant="outline" onClick={loadAccessLog} disabled={loading}>
              <RefreshCcw className={cn("h-4 w-4", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border bg-white/90">
        <div className="hidden grid-cols-[0.8fr_1fr_0.65fr_1.25fr_1fr] gap-3 border-b bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 md:grid">
          <div>Time</div>
          <div>Member</div>
          <div>Event</div>
          <div>Page</div>
          <div>Request</div>
        </div>
        {loading ? (
          <div className="p-6 text-sm text-slate-600">Loading access log...</div>
        ) : filteredEvents.length ? (
          <div className="divide-y">
            {filteredEvents.map((event) => (
              <div key={event.id} className="grid grid-cols-1 gap-3 px-4 py-4 text-sm md:grid-cols-[0.8fr_1fr_0.65fr_1.25fr_1fr]">
                <div className="text-slate-600">{formatDateTime(event.createdAt)}</div>
                <div className="min-w-0 space-y-1">
                  <div className="font-semibold text-[var(--brand-ink)]">
                    <SensitiveDataText value={memberLabel(event)} kind="name" />
                  </div>
                  {event.email ? (
                    <div className="text-xs text-slate-500">
                      <SensitiveDataText value={event.email} kind="email" />
                    </div>
                  ) : null}
                  {event.membershipStatus ? (
                    <div className="text-xs text-slate-500">{event.membershipStatus}</div>
                  ) : null}
                </div>
                <div>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold",
                      event.eventType === "login"
                        ? "bg-[var(--zcash-gold-soft)] text-[var(--zcash-gold-deep)]"
                        : "bg-teal-50 text-[var(--brand-teal)]",
                    )}
                  >
                    {event.eventType === "login" ? <LogIn className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    {eventLabel(event.eventType)}
                  </span>
                  <div className="mt-2 text-xs text-slate-500">
                    {authProviderLabel(event.authProvider)}
                  </div>
                </div>
                <div className="min-w-0 space-y-1">
                  {event.path ? (
                    <Link className="break-words font-medium text-[var(--brand-denim)] underline" href={event.path}>
                      {event.title || event.path}
                    </Link>
                  ) : (
                    <div className="font-medium text-slate-700">Sign-in event</div>
                  )}
                  {event.path && event.title ? (
                    <div className="break-words text-xs text-slate-500">{event.path}</div>
                  ) : null}
                  {event.referrer ? (
                    <div className="break-words text-xs text-slate-500">Referrer: {event.referrer}</div>
                  ) : null}
                </div>
                <div className="min-w-0 space-y-1 text-xs text-slate-500">
                  <div>{event.ipAddress || "No IP captured"}</div>
                  <div className="break-words">{event.userAgent || "No device captured"}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 text-sm text-slate-600">No access events match this view yet.</div>
        )}
      </div>
    </div>
  );
}
