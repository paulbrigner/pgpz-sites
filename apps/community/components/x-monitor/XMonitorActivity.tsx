import Link from "next/link";
import type {
  ActivityTrendsResponse,
  XMonitorTrendRangeKey,
} from "@pgpz/x-monitor-core/contracts";
import type { CommunityXMonitorQuery } from "@/lib/x-monitor-query";
import { buildCommunityXMonitorHref } from "@/lib/x-monitor-query";

const ranges: Array<{ key: XMonitorTrendRangeKey; label: string }> = [
  { key: "24h", label: "24 hours" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
];

const ACTIVITY_ANCHOR = "x-monitor-activity";

function rangeHref(query: CommunityXMonitorQuery, range: XMonitorTrendRangeKey): string {
  const next = { ...query, trendRange: range };
  return `${buildCommunityXMonitorHref(next)}#${ACTIVITY_ANCHOR}`;
}

function formatScopeDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    timeZone: "America/New_York",
  }).format(date);
}

export function XMonitorActivity({
  query,
  trends,
}: {
  query: CommunityXMonitorQuery;
  trends: ActivityTrendsResponse | null;
}) {
  if (!trends) {
    return (
      <section className="muted-card scroll-mt-24 p-6" id={ACTIVITY_ANCHOR}>
        <p className="section-eyebrow text-[var(--brand-denim)]">Activity trends</p>
        <p className="mt-3 text-sm text-slate-600">Activity data is temporarily unavailable.</p>
      </section>
    );
  }

  const totals = trends.activity.totals;
  const buckets = trends.activity.buckets;
  const maximum = Math.max(1, ...buckets.map((bucket) => bucket.post_count));
  const scopeMarkers = buckets.length > 0
    ? [buckets[0], buckets[Math.floor((buckets.length - 1) / 2)], buckets[buckets.length - 1]]
    : [];

  return (
    <section
      className="glass-surface scroll-mt-24 p-6"
      id={ACTIVITY_ANCHOR}
      aria-labelledby="x-monitor-activity-title"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="section-eyebrow text-[var(--brand-denim)]">Activity trends</p>
          <h2 id="x-monitor-activity-title" className="mt-2 text-2xl font-semibold text-[var(--brand-ink)]">
            Captured conversation volume
          </h2>
          <p className="mt-2 text-xs text-slate-500">
            {formatScopeDate(trends.scope.since)} to {formatScopeDate(trends.scope.until)} ET · {trends.scope.bucket_hours}-hour buckets
          </p>
          {query.searchMode === "semantic" && !trends.scope.text_filter_applied && query.q ? (
            <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-500">
              The semantic prompt is not applied to this volume chart; selected watch-list, theme,
              account, and feed filters are applied.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Activity range">
          {ranges.map((range) => (
            <Link
              aria-current={range.key === query.trendRange ? "page" : undefined}
              className={
                range.key === query.trendRange
                  ? "rounded-full bg-[var(--brand-ink)] px-3 py-1.5 text-xs font-semibold text-[var(--zcash-gold)]"
                  : "rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-[var(--zcash-gold)]"
              }
              href={rangeHref(query, range.key)}
              key={range.key}
            >
              {range.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Captured posts", totals.post_count],
          ["Significant", totals.significant_count],
          ["Unique accounts", totals.unique_handle_count],
          ["Discovery posts", totals.discovery_count],
        ].map(([label, value]) => (
          <div className="rounded-2xl border border-[rgba(245,168,0,0.2)] bg-white/80 p-4" key={label}>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--brand-ink)]">{Number(value).toLocaleString()}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 overflow-x-auto pb-2">
        {buckets.length === 0 ? (
          <div className="muted-card min-w-[20rem] p-6 text-center text-sm text-slate-600">
            No activity was captured in this range.
          </div>
        ) : (
          <>
          <div className="flex h-40 min-w-[38rem] items-end gap-1" aria-label="Post volume by time bucket">
          {buckets.map((bucket) => {
            const height = Math.max(4, Math.round((bucket.post_count / maximum) * 100));
            return (
              <div
                className="min-w-2 flex-1 rounded-t bg-[linear-gradient(180deg,var(--zcash-gold),var(--brand-denim))]"
                key={bucket.bucket_start}
                role="img"
                aria-label={`${bucket.post_count} posts beginning ${formatScopeDate(bucket.bucket_start)} Eastern Time`}
                style={{ height: `${height}%` }}
                title={`${bucket.post_count} posts from ${bucket.bucket_start}`}
              />
            );
          })}
          </div>
          <div className="mt-2 flex min-w-[38rem] justify-between text-[0.68rem] text-slate-500" aria-hidden="true">
            {scopeMarkers.map((bucket, index) => (
              <span key={`${bucket.bucket_start}-${index}`}>{formatScopeDate(bucket.bucket_start)}</span>
            ))}
          </div>
          </>
        )}
      </div>
    </section>
  );
}
