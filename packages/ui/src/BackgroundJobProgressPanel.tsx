"use client";

import { useEffect, useRef, useState } from "react";

export type BackgroundJobSummary = {
  id: string;
  kind: string;
  mode: "live" | "validate_only" | "smoke";
  status: string;
  recipientCount: number;
  pendingCount: number;
  queuedCount: number;
  processingCount: number;
  sentCount: number;
  validatedCount: number;
  skippedCount: number;
  failedCount: number;
  deliveryUnknownCount: number;
  canceledCount: number;
};

const TERMINAL = new Set(["completed", "partial", "failed", "needs_review", "canceled"]);

function statusLabel(status: string) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function BackgroundJobProgressPanel({
  initialJob,
  statusUrl,
  onTerminal,
}: {
  initialJob: BackgroundJobSummary;
  statusUrl?: string;
  onTerminal?: (job: BackgroundJobSummary) => void | Promise<void>;
}) {
  const [job, setJob] = useState(initialJob);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const terminalNotified = useRef<string | null>(null);

  useEffect(() => {
    setJob(initialJob);
    setError(null);
    terminalNotified.current = null;
  }, [initialJob]);

  useEffect(() => {
    if (TERMINAL.has(job.status)) {
      if (terminalNotified.current !== `${job.id}:${job.status}`) {
        terminalNotified.current = `${job.id}:${job.status}`;
        void onTerminal?.(job);
      }
      return;
    }
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delay = 1500;
    const poll = async () => {
      try {
        const response = await fetch(statusUrl || `/api/admin/jobs?jobId=${encodeURIComponent(job.id)}`, {
          cache: "no-store",
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body?.job) throw new Error(body?.error || "Unable to refresh job status");
        if (disposed) return;
        setJob(body.job);
        setError(null);
        delay = 1500;
      } catch (pollError: any) {
        if (disposed) return;
        setError(pollError?.message || "Unable to refresh job status");
        delay = Math.min(delay * 2, 15000);
      }
      if (!disposed) timer = setTimeout(poll, delay);
    };
    timer = setTimeout(poll, delay);
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
    };
  }, [job.id, job.status, onTerminal, statusUrl]);

  const completed =
    job.sentCount + job.validatedCount + job.skippedCount + job.failedCount +
    job.deliveryUnknownCount + job.canceledCount;
  const percentage = job.recipientCount ? Math.min(100, Math.round((completed / job.recipientCount) * 100)) : 0;
  const canRetry = TERMINAL.has(job.status) && (job.failedCount > 0 || job.deliveryUnknownCount > 0);

  const retry = async () => {
    setRetrying(true);
    setError(null);
    try {
      const statusResponse = await fetch(
        statusUrl || `/api/admin/jobs?jobId=${encodeURIComponent(job.id)}`,
        { cache: "no-store" },
      );
      const statusBody = await statusResponse.json().catch(() => ({}));
      if (!statusResponse.ok || !statusBody?.job) {
        throw new Error(statusBody?.error || "Unable to load recipients eligible for retry");
      }
      const deliveryUnknownTaskIds = Array.isArray(statusBody.deliveryUnknownTaskIds)
        ? statusBody.deliveryUnknownTaskIds.filter(
            (taskId: unknown): taskId is string => typeof taskId === "string",
          )
        : [];
      const confirmation = deliveryUnknownTaskIds.length
        ? `Retry failed recipients plus ${deliveryUnknownTaskIds.length} delivery-uncertain recipient${deliveryUnknownTaskIds.length === 1 ? "" : "s"}? An uncertain message may already have been delivered, so this can create a duplicate.`
        : "Retry recipients whose delivery definitely failed?";
      if (!window.confirm(confirmation)) return;
      const response = await fetch("/api/admin/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "retry",
          jobId: job.id,
          acknowledgeDeliveryUnknown: deliveryUnknownTaskIds.length > 0,
          deliveryUnknownTaskIds,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.job) throw new Error(body?.error || "Unable to retry failed recipients");
      terminalNotified.current = null;
      setJob(body.job);
    } catch (retryError: any) {
      setError(retryError?.message || "Unable to retry failed recipients");
    } finally {
      setRetrying(false);
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white/90 p-4" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Background job
          </div>
          <div className="mt-1 font-semibold text-slate-900">{statusLabel(job.status)}</div>
          <div className="mt-1 text-xs text-slate-500">
            {job.mode === "validate_only" ? "Validation only · no email delivery" : `${job.kind.replaceAll("_", " ")} · ${job.mode}`}
          </div>
        </div>
        <div className="text-right text-sm font-semibold text-slate-700">
          {completed} / {job.recipientCount}
        </div>
      </div>
      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"
        role="progressbar"
        aria-label="Background job progress"
        aria-valuemin={0}
        aria-valuemax={job.recipientCount}
        aria-valuenow={completed}
      >
        <div className="h-full bg-emerald-600 transition-[width]" style={{ width: `${percentage}%` }} />
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        {job.sentCount ? <span>Sent {job.sentCount}</span> : null}
        {job.validatedCount ? <span>Validated {job.validatedCount}</span> : null}
        {job.skippedCount ? <span>Skipped {job.skippedCount}</span> : null}
        {job.processingCount ? <span>Running {job.processingCount}</span> : null}
        {job.pendingCount + job.queuedCount ? <span>Waiting {job.pendingCount + job.queuedCount}</span> : null}
        {job.failedCount ? <span className="text-rose-700">Failed {job.failedCount}</span> : null}
        {job.deliveryUnknownCount ? <span className="text-amber-700">Needs review {job.deliveryUnknownCount}</span> : null}
      </div>
      {canRetry ? (
        <button
          type="button"
          onClick={retry}
          disabled={retrying}
          className="mt-3 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 disabled:opacity-50"
        >
          {retrying ? "Retrying…" : "Retry failed recipients"}
        </button>
      ) : null}
      {error ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null}
    </section>
  );
}
