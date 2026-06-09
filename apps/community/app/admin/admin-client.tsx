"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BadgeCheck, MailCheck, RefreshCcw, Search, ShieldCheck } from "lucide-react";
import {
  SensitiveDataText,
  useAdminSensitiveData,
} from "@/components/admin/sensitive-data";
import type { AdminMember, AdminRoster } from "@/lib/admin/roster";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  initialRoster: AdminRoster | null;
  currentAdminId?: string | null;
};

const formatDate = (value: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const displayName = (member: AdminMember) =>
  member.name || [member.firstName, member.lastName].filter(Boolean).join(" ") || member.email || "Unnamed member";

export default function AdminClient({ initialRoster, currentAdminId }: Props) {
  const { sensitiveDataVisible } = useAdminSensitiveData();
  const [roster, setRoster] = useState<AdminRoster | null>(initialRoster);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "none">("all");
  const [loading, setLoading] = useState(!initialRoster);
  const [error, setError] = useState<string | null>(null);
  const [emailSending, setEmailSending] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState<string | null>(null);

  const loadRoster = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/admin/members?${params.toString()}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to load roster");
      setRoster(body);
    } catch (err: any) {
      setError(err?.message || "Failed to load roster");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRoster();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const filteredMembers = useMemo(() => {
    const members = (roster?.members || []).filter((member) => member.id !== currentAdminId);
    const normalized = query.trim().toLowerCase();
    if (!normalized) return members;
    return members.filter((member) => {
      const haystack = [
        member.name,
        member.email,
        member.firstName,
        member.lastName,
        member.xHandle,
        member.linkedinUrl,
        member.membershipProofPostUrl,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalized);
    });
  }, [currentAdminId, query, roster]);

  const sendWelcome = async (member: AdminMember) => {
    setEmailSending((current) => ({ ...current, [member.id]: true }));
    setNotice(null);
    try {
      const res = await fetch("/api/admin/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: member.id, type: "welcome" }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to send welcome email");
      setNotice(`Welcome email sent to ${member.email || displayName(member)}.`);
      await loadRoster();
    } catch (err: any) {
      setError(err?.message || "Failed to send welcome email");
    } finally {
      setEmailSending((current) => ({ ...current, [member.id]: false }));
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Total", roster?.meta.total ?? 0],
          ["Active", roster?.meta.active ?? 0],
          ["Unverified", roster?.meta.none ?? 0],
          ["Admins", roster?.meta.admins ?? 0],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border bg-white/80 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</div>
            <div className="mt-2 text-2xl font-semibold text-[var(--brand-ink)]">{value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border bg-white/85 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative max-w-xl flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, email, X handle, or proof URL"
              className="w-full rounded-md border py-2 pl-9 pr-3 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {(["all", "active", "none"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setStatusFilter(value)}
                className={cn(
                  "rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em]",
                  statusFilter === value
                    ? "border-[var(--brand-ink)] bg-[var(--brand-ink)] text-[var(--zcash-gold)]"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-400",
                )}
              >
                {value === "none" ? "Unverified" : value}
              </button>
            ))}
            <Button type="button" variant="outline" onClick={loadRoster} disabled={loading}>
              <RefreshCcw className={cn("h-4 w-4", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {notice ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border bg-white/90">
        <div className="grid grid-cols-[1.1fr_0.8fr_0.8fr_0.9fr_0.9fr] gap-3 border-b bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          <div>Member</div>
          <div>Status</div>
          <div>X proof</div>
          <div>Email</div>
          <div>Actions</div>
        </div>
        {loading ? (
          <div className="p-6 text-sm text-slate-600">Loading roster...</div>
        ) : filteredMembers.length ? (
          <div className="divide-y">
            {filteredMembers.map((member) => {
              const active = member.membershipStatus === "active";
              const emailHidden = !sensitiveDataVisible && member.email;
              const welcomeSent = !!member.welcomeEmailSentAt;
              return (
                <div
                  key={member.id}
                  className="grid grid-cols-1 gap-3 px-4 py-4 text-sm md:grid-cols-[1.1fr_0.8fr_0.8fr_0.9fr_0.9fr]"
                >
                  <div className="space-y-1">
                    <div className="font-semibold text-[var(--brand-ink)]">
                      <SensitiveDataText value={displayName(member)} kind="name" />
                    </div>
                    <div className="text-xs text-slate-500">
                      <SensitiveDataText value={member.email || "No email"} kind="email" />
                    </div>
                    {member.linkedinUrl ? (
                      <Link className="text-xs text-[var(--brand-denim)] underline" href={member.linkedinUrl} target="_blank" rel="noopener noreferrer">
                        LinkedIn
                      </Link>
                    ) : null}
                  </div>
                  <div>
                    <span className={cn(
                      "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold",
                      active ? "bg-teal-50 text-[var(--brand-teal)]" : "bg-[var(--zcash-gold-soft)] text-[var(--zcash-gold-deep)]",
                    )}>
                      {active ? <BadgeCheck className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                      {active ? "Active" : "Unverified"}
                    </span>
                    <div className="mt-2 text-xs text-slate-500">{formatDate(member.membershipVerifiedAt)}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="font-medium">{member.xHandle || "—"}</div>
                    {member.membershipProofPostUrl ? (
                      <Link className="text-xs text-[var(--brand-denim)] underline" href={member.membershipProofPostUrl} target="_blank" rel="noopener noreferrer">
                        Proof post
                      </Link>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <div
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold",
                        welcomeSent
                          ? "bg-emerald-50 text-emerald-800"
                          : "bg-slate-100 text-slate-600",
                      )}
                      title={
                        welcomeSent
                          ? `Welcome email sent ${formatDate(member.welcomeEmailSentAt)}`
                          : "Welcome email has not been sent"
                      }
                    >
                      <MailCheck className="h-3.5 w-3.5" />
                      {welcomeSent ? "Welcome sent" : "Welcome not sent"}
                    </div>
                    {welcomeSent ? (
                      <div className="text-xs text-slate-500">
                        Sent {formatDate(member.welcomeEmailSentAt)}
                      </div>
                    ) : null}
                    {member.emailSuppressed ? (
                      <div className="text-xs text-rose-700">Suppressed</div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={emailSending[member.id] || !member.email}
                      onClick={() => sendWelcome(member)}
                      title={emailHidden ? "Email hidden; toggle sensitive data to inspect target." : undefined}
                    >
                      {emailSending[member.id] ? "Sending..." : welcomeSent ? "Resend welcome" : "Send welcome"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-6 text-sm text-slate-600">No members match this view.</div>
        )}
      </div>
    </div>
  );
}
