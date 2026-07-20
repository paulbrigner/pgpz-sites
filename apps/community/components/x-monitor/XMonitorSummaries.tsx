import { ChevronDown } from "lucide-react";
import type { WindowSummary } from "@pgpz/x-monitor-core/contracts";

const labels: Record<string, string> = {
  rolling_2h: "Last two hours",
  rolling_12h: "Last twelve hours",
  rolling_7d_daily: "Weekly summary",
};

const preferredOrder = ["rolling_7d_daily", "rolling_12h", "rolling_2h"];

function formatGeneratedAt(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Recently generated";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/New_York",
  }).format(date);
}

export function XMonitorSummaries({ summaries }: { summaries: WindowSummary[] }) {
  const selected = [...summaries]
    .sort((left, right) =>
      preferredOrder.indexOf(left.window_type) - preferredOrder.indexOf(right.window_type),
    )
    .slice(0, 3);

  if (selected.length === 0) {
    return (
      <section className="muted-card p-6">
        <p className="section-eyebrow text-[var(--brand-denim)]">Conversation summaries</p>
        <p className="mt-3 text-sm text-slate-600">No generated summaries are available yet.</p>
      </section>
    );
  }

  return (
    <section className="space-y-4" aria-labelledby="x-monitor-summaries-title">
      <div>
        <p className="section-eyebrow text-[var(--brand-denim)]">Conversation summaries</p>
        <h2 id="x-monitor-summaries-title" className="mt-2 text-2xl font-semibold text-[var(--brand-ink)]">
          What the monitored conversation is emphasizing
        </h2>
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-3">
        {selected.map((summary) => (
          <details
            className="group glass-surface self-start overflow-hidden"
            key={summary.summary_key}
            name="x-monitor-summary"
          >
            <summary className="cursor-pointer list-none p-5 outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-[rgba(245,168,0,0.2)] [&::-webkit-details-marker]:hidden">
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="rounded-full bg-[var(--brand-ink)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--zcash-gold)]">
                  {labels[summary.window_type] || summary.window_type}
                </span>
                <span className="text-xs text-slate-500">{summary.post_count} posts</span>
              </span>
              <span
                aria-hidden="true"
                className="mt-4 block line-clamp-3 whitespace-pre-line text-sm leading-6 text-slate-700 group-open:hidden sm:line-clamp-4"
              >
                {summary.summary_text}
              </span>
              <span className="mt-4 flex items-center justify-between gap-3">
                <span className="text-xs text-slate-500">
                  Generated {formatGeneratedAt(summary.generated_at)} ET
                </span>
                <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-[var(--brand-denim)]">
                  <span className="group-open:hidden">Read full summary</span>
                  <span className="hidden group-open:inline">Show less</span>
                  <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
                </span>
              </span>
            </summary>
            <div className="border-t border-slate-200/80 px-5 pb-5 pt-4">
              <p className="whitespace-pre-line text-sm leading-6 text-slate-700">
                {summary.summary_text}
              </p>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
