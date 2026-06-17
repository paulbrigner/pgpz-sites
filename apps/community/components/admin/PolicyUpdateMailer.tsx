"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, FileText, MailCheck, RefreshCcw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PolicyUpdateSummary } from "@/lib/policy-updates";
import { cn } from "@/lib/utils";

type PolicyUpdateEmailStats = {
  sent: number;
  failed: number;
  draftSent: number;
  lastSentAt: string | null;
};

type ApiState = {
  updates: PolicyUpdateSummary[];
  recipientCount: number;
  statsBySlug: Record<string, PolicyUpdateEmailStats>;
};

type SendResult = {
  ok: boolean;
  title: string;
  draft?: boolean;
  recipientEmail?: string | null;
  resolvedRecipientName?: string | null;
  sent: number;
  failed: number;
  recipientCount: number;
  failures?: Array<{ email: string; error: string }>;
};

type Props = {
  initialUpdates: PolicyUpdateSummary[];
};

const emptyStats: PolicyUpdateEmailStats = {
  sent: 0,
  failed: 0,
  draftSent: 0,
  lastSentAt: null,
};

const formatDateTime = (value: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export function PolicyUpdateMailer({ initialUpdates }: Props) {
  const [updates, setUpdates] = useState<PolicyUpdateSummary[]>(initialUpdates);
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [statsBySlug, setStatsBySlug] = useState<Record<string, PolicyUpdateEmailStats>>({});
  const [selectedSlug, setSelectedSlug] = useState(initialUpdates[0]?.slug || "");
  const [confirmSend, setConfirmSend] = useState(false);
  const [draftEmail, setDraftEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [draftSending, setDraftSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SendResult | null>(null);

  const selectedUpdate = useMemo(
    () => updates.find((update) => update.slug === selectedSlug) || updates[0] || null,
    [selectedSlug, updates],
  );
  const selectedStats = selectedUpdate ? statsBySlug[selectedUpdate.slug] || emptyStats : emptyStats;

  const loadState = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/policy-updates", { cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as Partial<ApiState> & { error?: string };
      if (!res.ok) throw new Error(body?.error || "Failed to load policy update sender");
      setUpdates(body.updates || []);
      setRecipientCount(typeof body.recipientCount === "number" ? body.recipientCount : 0);
      setStatsBySlug(body.statsBySlug || {});
      if (!selectedSlug && body.updates?.[0]?.slug) setSelectedSlug(body.updates[0].slug);
    } catch (err: any) {
      setError(err?.message || "Failed to load policy update sender");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendUpdate = async () => {
    if (!selectedUpdate || !confirmSend) return;
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/policy-updates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: selectedUpdate.slug, confirmSend: true }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to send policy update");
      setResult(body);
      setConfirmSend(false);
      await loadState();
    } catch (err: any) {
      setError(err?.message || "Failed to send policy update");
    } finally {
      setSending(false);
    }
  };

  const sendDraft = async () => {
    if (!selectedUpdate || !draftEmail.trim()) return;
    setDraftSending(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/policy-updates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: selectedUpdate.slug,
          confirmSend: true,
          draftRecipientEmail: draftEmail.trim(),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to send policy update draft");
      setResult(body);
      await loadState();
    } catch (err: any) {
      setError(err?.message || "Failed to send policy update draft");
    } finally {
      setDraftSending(false);
    }
  };

  return (
    <section className="glass-surface p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <p className="section-eyebrow text-[var(--brand-denim)]">Member updates</p>
          <h2 className="text-2xl font-semibold text-[var(--brand-ink)]">Policy update email sender</h2>
          <p className="max-w-3xl text-sm leading-6 text-slate-600">
            Send a PGPZ-branded weekly memo or special update to active members with unsuppressed email addresses.
            Nothing sends automatically; this tool sends only after manual confirmation.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="rounded-full border bg-white px-4 py-2 text-sm font-semibold text-[var(--brand-ink)]">
            {recipientCount === null ? "Loading recipients" : `${recipientCount} recipients`}
          </div>
          <Button type="button" variant="outline" onClick={loadState} disabled={loading}>
            <RefreshCcw className={cn("h-4 w-4", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[0.42fr_1fr]">
        <div className="rounded-2xl border bg-white/85 p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Available updates
          </div>
          <div className="space-y-2">
            {updates.map((update) => {
              const stats = statsBySlug[update.slug] || emptyStats;
              return (
                <button
                  key={update.slug}
                  type="button"
                  onClick={() => {
                    setSelectedSlug(update.slug);
                    setConfirmSend(false);
                    setResult(null);
                  }}
                  className={cn(
                    "w-full rounded-xl border p-3 text-left transition",
                    selectedUpdate?.slug === update.slug
                      ? "border-[rgba(245,168,0,0.72)] bg-[var(--brand-ice)]"
                      : "border-slate-200 bg-white hover:border-slate-300",
                  )}
                >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--brand-ink)] text-[var(--zcash-gold)]">
                    <FileText className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-denim)]">
                      {update.categoryLabel}
                    </span>
                    <span className="mt-1 block text-sm font-semibold text-[var(--brand-ink)]">
                      {update.shortTitle}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">{update.displayDate}</span>
                    <span className="mt-2 flex flex-wrap gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      <span>Sent {stats.sent}</span>
                      <span>Drafts {stats.draftSent}</span>
                      {stats.failed ? <span className="text-rose-700">Failed {stats.failed}</span> : null}
                    </span>
                  </span>
                </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border bg-white/90 p-5">
          {selectedUpdate ? (
            <div className="space-y-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="inline-flex rounded-full bg-[var(--brand-ink)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--zcash-gold)]">
                    {selectedUpdate.categoryLabel}
                  </div>
                  <h3 className="mt-3 text-xl font-semibold text-[var(--brand-ink)]">
                    {selectedUpdate.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{selectedUpdate.summary}</p>
                </div>
                <Button variant="outline" asChild>
                  <Link href={selectedUpdate.portalPath} target="_blank" rel="noopener noreferrer">
                    Portal view
                  </Link>
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Email subject</div>
                  <div className="mt-2 text-sm font-semibold text-[var(--brand-ink)]">{selectedUpdate.emailSubject}</div>
                </div>
                <div className="rounded-xl border bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Portal link</div>
                  <div className="mt-2 truncate text-sm font-medium text-[var(--brand-denim)]">{selectedUpdate.portalPath}</div>
                </div>
              </div>

              <div className="rounded-xl border bg-white p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  <BarChart3 className="h-4 w-4" />
                  Message stats
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-4">
                  {[
                    ["Member sends", selectedStats.sent.toLocaleString()],
                    ["Draft sends", selectedStats.draftSent.toLocaleString()],
                    ["Failures", selectedStats.failed.toLocaleString()],
                    ["Last sent", formatDateTime(selectedStats.lastSentAt)],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border bg-slate-50 p-3">
                      <div className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</div>
                      <div className="mt-1 text-sm font-semibold text-[var(--brand-ink)]">{value}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Draft send</div>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                  <input
                    type="email"
                    value={draftEmail}
                    onChange={(event) => setDraftEmail(event.target.value)}
                    placeholder="member@example.com"
                    className="min-w-0 flex-1 rounded-md border bg-white px-3 py-2 text-sm"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={draftSending || !draftEmail.trim()}
                    onClick={sendDraft}
                  >
                    {draftSending ? <MailCheck className="h-4 w-4 animate-pulse" /> : <Send className="h-4 w-4" />}
                    {draftSending ? "Sending..." : "Send draft"}
                  </Button>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Sends only to this address. If the email matches a PGPZ Community profile, the greeting uses that profile name.
                </p>
              </div>

              <label className="flex items-start gap-3 rounded-xl border border-[rgba(245,168,0,0.32)] bg-[var(--brand-ice)] p-4 text-sm leading-6 text-slate-700">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={confirmSend}
                  onChange={(event) => setConfirmSend(event.target.checked)}
                />
                <span>
                  I understand this will send the selected update to all active member subscribers with unsuppressed emails.
                  I have reviewed the portal page and email subject.
                </span>
              </label>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  disabled={!confirmSend || sending || !recipientCount}
                  onClick={sendUpdate}
                >
                  {sending ? <MailCheck className="h-4 w-4 animate-pulse" /> : <Send className="h-4 w-4" />}
                  {sending ? "Sending..." : "Send selected update"}
                </Button>
                <p className="text-xs text-slate-500">
                  Sends are logged per recipient in the email log table.
                </p>
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-600">No policy updates are configured.</div>
          )}
        </div>
      </div>

      {result ? (
        <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {result.draft
            ? `Sent draft to ${result.recipientEmail || "draft recipient"} for ${result.title}`
            : `Sent ${result.sent} of ${result.recipientCount} emails for ${result.title}`}
          {result.failed ? `; ${result.failed} failed.` : "."}
          {result.draft && result.resolvedRecipientName ? ` Greeting name: ${result.resolvedRecipientName}.` : ""}
        </div>
      ) : null}
      {error ? (
        <div className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </div>
      ) : null}
    </section>
  );
}
