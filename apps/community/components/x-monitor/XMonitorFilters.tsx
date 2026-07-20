import Link from "next/link";
import { Search } from "lucide-react";
import type { CommunityXMonitorQuery } from "@/lib/x-monitor-query";
import {
  COMMUNITY_X_MONITOR_THEMES,
  COMMUNITY_X_MONITOR_TIERS,
} from "@/lib/x-monitor-query";

export function XMonitorFilters({ query }: { query: CommunityXMonitorQuery }) {
  return (
    <form
      action="/x-monitor"
      className="glass-surface grid gap-4 p-5 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_180px_180px_220px_220px_auto] xl:items-end"
      method="get"
    >
      <label className="space-y-2 text-sm font-medium text-[var(--brand-ink)]">
        Search posts
        <span className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-[var(--zcash-gold)] focus:ring-4 focus:ring-[rgba(245,168,0,0.12)]"
            defaultValue={query.q}
            maxLength={200}
            name="q"
            placeholder="privacy, wallets, policy..."
            type="search"
          />
        </span>
      </label>

      <label className="space-y-2 text-sm font-medium text-[var(--brand-ink)]">
        Watch lists
        <select
          className="min-h-32 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--zcash-gold)] focus:ring-4 focus:ring-[rgba(245,168,0,0.12)]"
          defaultValue={query.tiers}
          multiple
          name="tier"
        >
          {COMMUNITY_X_MONITOR_TIERS.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>

      <label className="space-y-2 text-sm font-medium text-[var(--brand-ink)]">
        Themes
        <select
          className="min-h-32 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--zcash-gold)] focus:ring-4 focus:ring-[rgba(245,168,0,0.12)]"
          defaultValue={query.themes}
          multiple
          name="theme"
        >
          {COMMUNITY_X_MONITOR_THEMES.map((theme) => (
            <option key={theme} value={theme}>{theme}</option>
          ))}
        </select>
      </label>

      <label className="space-y-2 text-sm font-medium text-[var(--brand-ink)]">
        X account
        <input
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--zcash-gold)] focus:ring-4 focus:ring-[rgba(245,168,0,0.12)]"
          defaultValue={query.handle}
          maxLength={16}
          name="handle"
          placeholder="@handle"
        />
      </label>

      <label className="space-y-2 text-sm font-medium text-[var(--brand-ink)]">
        Feed
        <select
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--zcash-gold)] focus:ring-4 focus:ring-[rgba(245,168,0,0.12)]"
          defaultValue={query.significantMode}
          name="significant"
        >
          <option value="significant">Significant posts</option>
          <option value="all">All captured posts</option>
        </select>
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          className="inline-flex min-h-10 items-center justify-center rounded-full bg-[var(--brand-ink)] px-5 text-sm font-semibold text-[var(--zcash-gold)] transition hover:bg-[var(--brand-coal)]"
          type="submit"
        >
          Apply
        </button>
        <Link
          className="inline-flex min-h-10 items-center justify-center rounded-full border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-[var(--zcash-gold)]"
          href="/x-monitor"
        >
          Reset
        </Link>
      </div>

      <p className="text-xs leading-5 text-slate-500 lg:col-span-2 xl:col-span-6">
        Use Command or Control to select more than one watch list or theme. Historical investor-list posts are included with Influencer.
      </p>

      <input name="trend_range" type="hidden" value={query.trendRange} />
    </form>
  );
}
