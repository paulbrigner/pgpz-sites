"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ExternalLink, RefreshCcw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

type Submission = {
  id: string;
  title: string;
  url: string | null;
  details: string;
  status: "pending" | "approved" | "rejected";
  submitterName: string;
  submitterEmail: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
};

export function ResourceModerationPanel() {
  const [status, setStatus] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/resource-submissions?status=${status}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "Could not load resource submissions");
      setSubmissions(Array.isArray(body?.submissions) ? body.submissions : []);
    } catch (err: any) {
      setError(err?.message || "Could not load resource submissions");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  const review = async (submission: Submission, decision: "approved" | "rejected") => {
    setSaving((current) => ({ ...current, [submission.id]: true }));
    setError(null);
    try {
      const response = await fetch("/api/admin/resource-submissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: submission.id, decision, note: notes[submission.id] || "" }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "Could not review submission");
      await load();
    } catch (err: any) {
      setError(err?.message || "Could not review submission");
    } finally {
      setSaving((current) => ({ ...current, [submission.id]: false }));
    }
  };

  return (
    <section className="rounded-lg border bg-white/90 p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="section-eyebrow text-[var(--brand-denim)]">Moderation queue</p>
          <h2 className="mt-2 text-2xl font-semibold text-[var(--brand-ink)]">Member resource submissions</h2>
        </div>
        <Button type="button" variant="outline" onClick={load} disabled={loading}>
          <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {(["pending", "approved", "rejected", "all"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setStatus(value)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold capitalize ${status === value ? "border-[var(--zcash-gold)] bg-[var(--zcash-gold-soft)]" : "bg-white"}`}
          >
            {value}
          </button>
        ))}
      </div>
      {error ? <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{error}</div> : null}
      <div className="mt-5 space-y-4">
        {!loading && !submissions.length ? (
          <div className="rounded-md border bg-white p-5 text-sm text-slate-600">No {status === "all" ? "" : `${status} `}submissions.</div>
        ) : null}
        {submissions.map((submission) => (
          <article key={submission.id} className="rounded-lg border bg-white p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold text-[var(--brand-ink)]">{submission.title}</h3>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-700">{submission.status}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {submission.submitterName}{submission.submitterEmail ? ` - ${submission.submitterEmail}` : ""} · {new Date(submission.submittedAt).toLocaleString()}
                </p>
              </div>
              {submission.url ? (
                <Link href={submission.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-[var(--brand-denim)] underline">
                  Open link <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              ) : null}
            </div>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">{submission.details}</p>
            {submission.status === "pending" ? (
              <div className="mt-4 space-y-3 border-t pt-4">
                <textarea
                  rows={2}
                  maxLength={2000}
                  value={notes[submission.id] || ""}
                  onChange={(event) => setNotes((current) => ({ ...current, [submission.id]: event.target.value }))}
                  placeholder="Optional review note"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" disabled={saving[submission.id]} onClick={() => review(submission, "approved")}>
                    <CheckCircle2 className="h-4 w-4" /> Approve
                  </Button>
                  <Button type="button" size="sm" variant="outline" disabled={saving[submission.id]} onClick={() => review(submission, "rejected")}>
                    <XCircle className="h-4 w-4" /> Reject
                  </Button>
                </div>
              </div>
            ) : submission.reviewNote ? (
              <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">Review note: {submission.reviewNote}</p>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
