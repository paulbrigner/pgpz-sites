import Link from "next/link";
import { ExternalLink, Heart, MessageCircle, Repeat2 } from "lucide-react";
import type { FeedItem } from "@pgpz/x-monitor-core/contracts";
import type { CommunityXMonitorQuery } from "@/lib/x-monitor-query";
import { buildCommunityXMonitorHref } from "@/lib/x-monitor-query";

function formatDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Captured recently";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/New_York",
  }).format(date);
}

function tierLabel(value: string | null): string | null {
  if (value === "teammate") return "Zodl Team";
  if (value === "investor") return "Influencer";
  if (value === "influencer") return "Influencer";
  if (value === "ecosystem") return "Ecosystem";
  return value ? value.replaceAll("_", " ") : null;
}

export function XMonitorPostCard({
  item,
  linkToDetail = true,
}: {
  item: FeedItem;
  linkToDetail?: boolean;
}) {
  const label = tierLabel(item.watch_tier);
  const canonicalPostUrl = /^[0-9]{1,32}$/.test(item.status_id)
    ? `https://x.com/i/status/${item.status_id}`
    : null;
  return (
    <article className="glass-surface p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <a
              className="font-semibold text-[var(--brand-ink)] hover:text-[var(--brand-denim)]"
              href={`https://x.com/${encodeURIComponent(item.author_handle)}`}
              rel="noopener noreferrer"
              target="_blank"
            >
              @{item.author_handle}
            </a>
            {label ? (
              <span className="rounded-full bg-[rgba(245,168,0,0.14)] px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[var(--brand-denim)]">
                {label}
              </span>
            ) : null}
            {item.is_significant ? (
              <span className="rounded-full bg-teal-50 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[var(--brand-teal)]">
                Significant
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-slate-500">{formatDate(item.discovered_at)} ET</p>
        </div>
        {canonicalPostUrl ? (
          <a
            aria-label="Open original post on X"
            className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[var(--brand-denim)] hover:underline"
            href={canonicalPostUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            View on X
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        ) : null}
      </div>

      <p className="mt-4 whitespace-pre-line text-sm leading-6 text-slate-700">
        {item.body_text || "This captured post has no available text."}
      </p>

      {item.significance_reason ? (
        <p className="mt-4 rounded-xl border border-[rgba(31,111,104,0.18)] bg-teal-50/65 p-3 text-xs leading-5 text-slate-600">
          {item.significance_reason}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-slate-100 pt-4 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1"><Heart className="h-3.5 w-3.5" aria-hidden="true" />{item.likes.toLocaleString()}</span>
        <span className="inline-flex items-center gap-1"><Repeat2 className="h-3.5 w-3.5" aria-hidden="true" />{item.reposts.toLocaleString()}</span>
        <span className="inline-flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />{item.replies.toLocaleString()}</span>
        {linkToDetail ? (
          <Link
            className="ml-auto font-semibold text-[var(--brand-denim)] hover:underline"
            href={`/x-monitor/posts/${encodeURIComponent(item.status_id)}`}
          >
            Post details
          </Link>
        ) : null}
      </div>
    </article>
  );
}

export function XMonitorFeed({
  items,
  nextCursor,
  query,
}: {
  items: FeedItem[];
  nextCursor: string | null;
  query: CommunityXMonitorQuery;
}) {
  return (
    <section className="space-y-4" aria-labelledby="x-monitor-feed-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="section-eyebrow text-[var(--brand-denim)]">Monitored feed</p>
          <h2 id="x-monitor-feed-title" className="mt-2 text-2xl font-semibold text-[var(--brand-ink)]">
            {query.significantMode === "significant" ? "Significant posts" : "All captured posts"}
          </h2>
        </div>
        <p className="text-sm text-slate-500">{items.length} posts on this page</p>
      </div>

      {items.length > 0 ? (
        <div className="space-y-4">
          {items.map((item) => <XMonitorPostCard item={item} key={item.status_id} />)}
        </div>
      ) : (
        <div className="muted-card p-8 text-center text-sm text-slate-600">
          No captured posts match these filters.
        </div>
      )}

      {nextCursor ? (
        <div className="flex justify-center pt-2">
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--brand-ink)] px-6 text-sm font-semibold text-[var(--zcash-gold)] transition hover:bg-[var(--brand-coal)]"
            href={buildCommunityXMonitorHref(query, nextCursor)}
          >
            Load older posts
          </Link>
        </div>
      ) : null}
    </section>
  );
}
