"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CopyPlus,
  Edit3,
  MailCheck,
  MailPlus,
  Newspaper,
  RefreshCcw,
  Save,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NewsletterStats = {
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  draftSendCount: number;
  openCount: number | null;
  clickCount: number | null;
  unsubscribeCount: number | null;
  lastDraftSentAt: string | null;
};

type Newsletter = {
  id: string;
  subject: string;
  preheader: string;
  body: string;
  previewText: string;
  status: "draft" | "sent";
  audience: "active_members";
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  stats: NewsletterStats;
  failurePreview: Array<{ email: string; error: string }>;
};

type NewsletterApiState = {
  newsletters: Newsletter[];
  recipientCount: number;
};

type NewsletterResult = {
  ok: boolean;
  draft?: boolean;
  newsletter?: Newsletter;
  recipientEmail?: string;
  resolvedRecipientName?: string | null;
  recipientCount?: number;
  sent?: number;
  failed?: number;
  failures?: Array<{ email: string; error: string }>;
};

const emptyForm = {
  id: "",
  subject: "",
  preheader: "",
  body: "",
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

const metricText = (value: number | null) => (typeof value === "number" ? value.toLocaleString() : "—");

function NewsletterStatsRow({ newsletter }: { newsletter: Newsletter }) {
  const stats = newsletter.stats;
  const metrics = [
    ["Recipients", stats.recipientCount],
    ["Sent", stats.sentCount],
    ["Failed", stats.failedCount],
    ["Drafts", stats.draftSendCount],
    ["Opens", stats.openCount],
    ["Clicks", stats.clickCount],
  ] as const;

  return (
    <div className="grid grid-cols-2 gap-2 border-t bg-slate-50/80 px-4 py-3 sm:grid-cols-6">
      {metrics.map(([label, value]) => (
        <div key={label}>
          <div className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</div>
          <div className="mt-1 text-sm font-semibold text-[var(--brand-ink)]">{metricText(value)}</div>
        </div>
      ))}
    </div>
  );
}

function NewsletterCard({
  newsletter,
  onEdit,
  onUseAsTemplate,
}: {
  newsletter: Newsletter;
  onEdit: (newsletter: Newsletter) => void;
  onUseAsTemplate: (newsletter: Newsletter) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const sent = newsletter.status === "sent";

  return (
    <article className="overflow-hidden rounded-2xl border bg-white/95 shadow-sm">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-semibold text-[var(--brand-ink)]">
                {newsletter.subject || "Untitled newsletter"}
              </h3>
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em]",
                  sent ? "bg-emerald-50 text-emerald-800" : "bg-[var(--zcash-gold-soft)] text-[var(--zcash-gold-deep)]",
                )}
              >
                {sent ? "Published" : "Draft"}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {sent ? `Sent ${formatDateTime(newsletter.sentAt)}` : `Updated ${formatDateTime(newsletter.updatedAt)}`} · Everyone
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            {sent ? (
              <Button type="button" size="sm" variant="outline" onClick={() => onUseAsTemplate(newsletter)}>
                <CopyPlus className="h-4 w-4" />
                Template
              </Button>
            ) : (
              <Button type="button" size="sm" variant="outline" onClick={() => onEdit(newsletter)}>
                <Edit3 className="h-4 w-4" />
                Edit
              </Button>
            )}
          </div>
        </div>

        <p className="mt-4 line-clamp-4 text-sm leading-6 text-slate-700">
          {newsletter.previewText || newsletter.body || "No newsletter body yet."}
        </p>
      </div>
      <NewsletterStatsRow newsletter={newsletter} />
      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
        <p className="text-xs text-slate-500">
          Open, click, and unsubscribe tracking is not instrumented yet; delivery stats are tracked.
        </p>
        <Button type="button" size="sm" variant="outline" onClick={() => setExpanded((current) => !current)}>
          <BarChart3 className="h-4 w-4" />
          {expanded ? "Hide stats" : "View stats"}
        </Button>
      </div>
      {expanded ? (
        <div className="border-t bg-slate-50 px-4 py-4 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border bg-white p-3">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Last draft</div>
              <div className="mt-1 text-slate-700">{formatDateTime(newsletter.stats.lastDraftSentAt)}</div>
            </div>
            <div className="rounded-xl border bg-white p-3">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Unsubscribes</div>
              <div className="mt-1 text-slate-700">{metricText(newsletter.stats.unsubscribeCount)}</div>
            </div>
          </div>
          {newsletter.failurePreview.length ? (
            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
              <div className="font-semibold">Recent failures</div>
              <ul className="mt-2 space-y-1">
                {newsletter.failurePreview.map((failure) => (
                  <li key={`${failure.email}-${failure.error}`}>
                    {failure.email || "Unknown"}: {failure.error || "Failed"}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function NewsletterMailer() {
  const [newsletters, setNewsletters] = useState<Newsletter[]>([]);
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [draftEmail, setDraftEmail] = useState("");
  const [confirmSend, setConfirmSend] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draftSending, setDraftSending] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<NewsletterResult | null>(null);

  const drafts = useMemo(
    () => newsletters.filter((newsletter) => newsletter.status === "draft"),
    [newsletters],
  );
  const published = useMemo(
    () => newsletters.filter((newsletter) => newsletter.status === "sent"),
    [newsletters],
  );
  const selectedDraft = useMemo(
    () => newsletters.find((newsletter) => newsletter.id === form.id && newsletter.status === "draft") || null,
    [form.id, newsletters],
  );
  const dirty = useMemo(() => {
    if (!selectedDraft) return !!(form.subject.trim() || form.preheader.trim() || form.body.trim());
    return (
      form.subject !== selectedDraft.subject ||
      form.preheader !== selectedDraft.preheader ||
      form.body !== selectedDraft.body
    );
  }, [form, selectedDraft]);

  const loadState = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/newsletters", { cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as Partial<NewsletterApiState> & { error?: string };
      if (!res.ok) throw new Error(body?.error || "Failed to load newsletters");
      setNewsletters(body.newsletters || []);
      setRecipientCount(typeof body.recipientCount === "number" ? body.recipientCount : 0);
    } catch (err: any) {
      setError(err?.message || "Failed to load newsletters");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadState();
  }, []);

  const updateForm = (field: keyof typeof emptyForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setConfirmSend(false);
    setResult(null);
  };

  const startNewDraft = () => {
    setForm(emptyForm);
    setConfirmSend(false);
    setResult(null);
    setNotice(null);
    setError(null);
  };

  const editDraft = (newsletter: Newsletter) => {
    setForm({
      id: newsletter.id,
      subject: newsletter.subject,
      preheader: newsletter.preheader,
      body: newsletter.body,
    });
    setConfirmSend(false);
    setResult(null);
    setNotice(null);
    setError(null);
  };

  const useAsTemplate = (newsletter: Newsletter) => {
    setForm({
      id: "",
      subject: newsletter.subject,
      preheader: newsletter.preheader,
      body: newsletter.body,
    });
    setConfirmSend(false);
    setResult(null);
    setNotice("Loaded published newsletter as a new unsaved draft.");
    setError(null);
  };

  const saveDraft = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/newsletters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", ...form }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to save newsletter draft");
      const newsletter = body.newsletter as Newsletter;
      setForm({
        id: newsletter.id,
        subject: newsletter.subject,
        preheader: newsletter.preheader,
        body: newsletter.body,
      });
      setNotice("Newsletter draft saved.");
      await loadState();
    } catch (err: any) {
      setError(err?.message || "Failed to save newsletter draft");
    } finally {
      setSaving(false);
    }
  };

  const sendDraft = async () => {
    if (!draftEmail.trim()) return;
    setDraftSending(true);
    setError(null);
    setNotice(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/newsletters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sendDraft", ...form, draftRecipientEmail: draftEmail.trim() }),
      });
      const body = (await res.json().catch(() => ({}))) as NewsletterResult & { error?: string };
      if (!res.ok) throw new Error(body?.error || "Failed to send newsletter draft");
      if (body.newsletter) {
        setForm({
          id: body.newsletter.id,
          subject: body.newsletter.subject,
          preheader: body.newsletter.preheader,
          body: body.newsletter.body,
        });
      }
      setResult(body);
      setNotice(`Sent newsletter draft to ${body.recipientEmail || draftEmail.trim()}.`);
      await loadState();
    } catch (err: any) {
      setError(err?.message || "Failed to send newsletter draft");
    } finally {
      setDraftSending(false);
    }
  };

  const sendNewsletter = async () => {
    if (!form.id || !confirmSend) return;
    setSending(true);
    setError(null);
    setNotice(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/newsletters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", id: form.id, confirmSend: true }),
      });
      const body = (await res.json().catch(() => ({}))) as NewsletterResult & { error?: string };
      if (!res.ok) throw new Error(body?.error || "Failed to send newsletter");
      setResult(body);
      setConfirmSend(false);
      setNotice(`Sent newsletter to ${body.sent || 0} of ${body.recipientCount || 0} recipients.`);
      setForm(emptyForm);
      await loadState();
    } catch (err: any) {
      setError(err?.message || "Failed to send newsletter");
    } finally {
      setSending(false);
    }
  };

  const canSave = !!form.subject.trim() && !!form.body.trim() && !saving;
  const canSendDraft = canSave && !!draftEmail.trim() && !draftSending;
  const canSendNewsletter = !!form.id && !dirty && confirmSend && !sending && !!recipientCount;

  return (
    <section className="glass-surface p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <p className="section-eyebrow text-[var(--brand-denim)]">Newsletters</p>
          <h2 className="text-2xl font-semibold text-[var(--brand-ink)]">Newsletter drafting and sends</h2>
          <p className="max-w-3xl text-sm leading-6 text-slate-600">
            Compose member newsletters, send reviewer drafts, publish to active member subscribers, and review delivery stats.
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

      {notice ? (
        <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {notice}
          {result?.resolvedRecipientName ? ` Greeting name: ${result.resolvedRecipientName}.` : ""}
        </div>
      ) : null}
      {error ? (
        <div className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </div>
      ) : null}

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,0.48fr)_minmax(0,0.52fr)]">
        <div className="rounded-2xl border bg-white/90 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                {form.id ? "Editing draft" : "New draft"}
              </div>
              <h3 className="mt-1 text-lg font-semibold text-[var(--brand-ink)]">
                {form.subject || "Untitled newsletter"}
              </h3>
            </div>
            <Button type="button" variant="outline" onClick={startNewDraft}>
              <MailPlus className="h-4 w-4" />
              New draft
            </Button>
          </div>

          <div className="mt-5 space-y-4">
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-[var(--brand-ink)]">Subject</span>
              <input
                value={form.subject}
                onChange={(event) => updateForm("subject", event.target.value)}
                maxLength={180}
                placeholder="Newsletter subject"
                className="w-full rounded-md border bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-[var(--brand-ink)]">Preheader</span>
              <input
                value={form.preheader}
                onChange={(event) => updateForm("preheader", event.target.value)}
                maxLength={240}
                placeholder="Short inbox preview"
                className="w-full rounded-md border bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-[var(--brand-ink)]">Body</span>
              <textarea
                value={form.body}
                onChange={(event) => updateForm("body", event.target.value)}
                maxLength={25000}
                rows={14}
                placeholder="Write the newsletter body. URLs will be linked automatically in the email."
                className="min-h-[22rem] w-full resize-y rounded-md border bg-white px-3 py-2 text-sm leading-6"
              />
              <span className="block text-xs text-slate-500">{form.body.length}/25000</span>
            </label>

            <div className="flex flex-wrap gap-3">
              <Button type="button" disabled={!canSave} isLoading={saving} onClick={saveDraft}>
                <Save className="h-4 w-4" />
                Save draft
              </Button>
              {dirty && form.id ? (
                <span className="self-center text-xs text-amber-700">
                  Save changes before sending to members.
                </span>
              ) : null}
            </div>

            <div className="rounded-xl border bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Draft send</div>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                <input
                  type="email"
                  value={draftEmail}
                  onChange={(event) => setDraftEmail(event.target.value)}
                  placeholder="reviewer@example.com"
                  className="min-w-0 flex-1 rounded-md border bg-white px-3 py-2 text-sm"
                />
                <Button type="button" variant="outline" disabled={!canSendDraft} onClick={sendDraft}>
                  {draftSending ? <MailCheck className="h-4 w-4 animate-pulse" /> : <Send className="h-4 w-4" />}
                  {draftSending ? "Sending..." : "Send draft"}
                </Button>
              </div>
            </div>

            <label className="flex items-start gap-3 rounded-xl border border-[rgba(245,168,0,0.32)] bg-[var(--brand-ice)] p-4 text-sm leading-6 text-slate-700">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4"
                checked={confirmSend}
                onChange={(event) => setConfirmSend(event.target.checked)}
                disabled={!form.id || dirty}
              />
              <span>
                I understand this will send the saved newsletter to all active member subscribers with unsuppressed emails.
              </span>
            </label>
            <Button type="button" disabled={!canSendNewsletter} onClick={sendNewsletter}>
              {sending ? <MailCheck className="h-4 w-4 animate-pulse" /> : <Newspaper className="h-4 w-4" />}
              {sending ? "Sending..." : "Send newsletter"}
            </Button>
          </div>
        </div>

        <div className="space-y-5">
          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-[var(--brand-ink)]">Drafts</h3>
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                {drafts.length} draft{drafts.length === 1 ? "" : "s"}
              </span>
            </div>
            {loading ? (
              <div className="rounded-2xl border bg-white/80 p-5 text-sm text-slate-600">Loading newsletters...</div>
            ) : drafts.length ? (
              <div className="space-y-3">
                {drafts.map((newsletter) => (
                  <NewsletterCard
                    key={newsletter.id}
                    newsletter={newsletter}
                    onEdit={editDraft}
                    onUseAsTemplate={useAsTemplate}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border bg-white/80 p-5 text-sm text-slate-600">
                As you save newsletter drafts, they will appear here.
              </div>
            )}
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-[var(--brand-ink)]">Published</h3>
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                {published.length} sent
              </span>
            </div>
            {published.length ? (
              <div className="space-y-3">
                {published.map((newsletter) => (
                  <NewsletterCard
                    key={newsletter.id}
                    newsletter={newsletter}
                    onEdit={editDraft}
                    onUseAsTemplate={useAsTemplate}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border bg-white/80 p-5 text-sm text-slate-600">
                Sent newsletters will show here with delivery stats.
              </div>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}
