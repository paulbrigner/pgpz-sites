"use client";

import { Search } from "lucide-react";
import { useState } from "react";
import type { CommunityXMonitorQuery } from "@/lib/x-monitor-query";
import {
  COMMUNITY_X_MONITOR_THEMES,
  COMMUNITY_X_MONITOR_TIERS,
} from "@/lib/x-monitor-query";

export function XMonitorFilters({ query }: { query: CommunityXMonitorQuery }) {
  const [searchMode, setSearchMode] = useState(query.searchMode);
  const [queryText, setQueryText] = useState(query.q);

  return (
    <form
      action="/x-monitor#x-monitor-feed"
      className="glass-surface grid gap-x-4 gap-y-4 p-5 md:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(10rem,1fr)_minmax(12rem,1fr)_auto] lg:items-end"
      method="get"
    >
      <fieldset className="space-y-2">
        <legend className="sr-only">Search posts</legend>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label
            className="text-sm font-medium text-[var(--brand-ink)]"
            htmlFor="x-monitor-search-query"
          >
            {searchMode === "semantic" ? "Describe what you want to find" : "Search posts"}
          </label>
          <div className="flex items-center gap-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Search mode
            </span>
            <span
              aria-hidden="true"
              className={`select-none text-xs transition ${
                searchMode === "keyword"
                  ? "font-semibold text-[var(--brand-ink)]"
                  : "font-medium text-slate-500"
              }`}
            >
              Keyword
            </span>
            <label className="inline-flex cursor-pointer items-center">
              <input
                aria-describedby="x-monitor-search-mode-description"
                aria-label="Semantic search"
                checked={searchMode === "semantic"}
                className="peer sr-only"
                name="search_mode"
                onChange={(event) => {
                  const mode = event.currentTarget.checked ? "semantic" : "keyword";
                  setSearchMode(mode);
                  if (mode === "keyword") {
                    setQueryText((current) => current.slice(0, 200));
                  }
                }}
                role="switch"
                type="checkbox"
                value="semantic"
              />
              <span
                aria-hidden="true"
                className={`relative h-6 w-11 shrink-0 rounded-full border transition peer-focus-visible:ring-4 peer-focus-visible:ring-[rgba(245,168,0,0.18)] ${
                  searchMode === "semantic"
                    ? "border-[var(--zcash-gold)] bg-[rgba(245,168,0,0.24)]"
                    : "border-slate-500 bg-slate-300"
                }`}
              >
                <span
                  className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full border shadow-sm transition-transform ${
                    searchMode === "semantic"
                      ? "translate-x-5 border-[var(--brand-ink)] bg-[var(--brand-ink)]"
                      : "translate-x-0 border-slate-500 bg-white"
                  }`}
                />
              </span>
            </label>
            <span
              aria-hidden="true"
              className={`select-none text-xs transition ${
                searchMode === "semantic"
                  ? "font-semibold text-[var(--brand-ink)]"
                  : "font-medium text-slate-500"
              }`}
            >
              Semantic
            </span>
            <span className="sr-only" id="x-monitor-search-mode-description">
              Off selects keyword search. On selects semantic search.
            </span>
          </div>
        </div>
        <div className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-[var(--zcash-gold)] focus:ring-4 focus:ring-[rgba(245,168,0,0.12)]"
            id="x-monitor-search-query"
            maxLength={searchMode === "semantic" ? 500 : 200}
            name="q"
            onChange={(event) => setQueryText(event.target.value)}
            placeholder={searchMode === "semantic"
              ? "Posts discussing privacy as a practical product advantage..."
              : "privacy, wallets, policy..."}
            required={searchMode === "semantic"}
            type="search"
            value={queryText}
          />
        </div>
        <p className="text-xs leading-4 text-slate-500">
          {searchMode === "semantic"
            ? "Finds and ranks posts with similar meaning."
            : "Matches words and phrases in captured posts."}
        </p>
      </fieldset>

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

      <div className="flex flex-wrap gap-2 lg:justify-end">
        <button
          className="inline-flex min-h-10 items-center justify-center rounded-full bg-[var(--brand-ink)] px-5 text-sm font-semibold text-[var(--zcash-gold)] transition hover:bg-[var(--brand-coal)]"
          type="submit"
        >
          Search
        </button>
        <a
          className="inline-flex min-h-10 items-center justify-center rounded-full border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-[var(--zcash-gold)]"
          href="/x-monitor"
          onClick={(event) => {
            setSearchMode("keyword");
            setQueryText("");
            const form = event.currentTarget.closest("form");
            form?.reset();
            form?.querySelectorAll<HTMLInputElement>('input[name="tier"], input[name="theme"]')
              .forEach((input) => { input.checked = false; });
            const handle = form?.querySelector<HTMLInputElement>('input[name="handle"]');
            if (handle) handle.value = "";
            const feed = form?.querySelector<HTMLSelectElement>('select[name="significant"]');
            if (feed) feed.value = "significant";
          }}
        >
          Reset
        </a>
      </div>

      <div className="grid gap-4 border-t border-slate-200/80 pt-4 md:col-span-2 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.35fr)] lg:col-span-4">
        <fieldset>
          <legend className="text-sm font-medium text-[var(--brand-ink)]">Watch lists</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {COMMUNITY_X_MONITOR_TIERS.map(([value, label]) => (
              <label className="cursor-pointer" key={value}>
                <input
                  className="peer sr-only"
                  defaultChecked={query.tiers.includes(value)}
                  name="tier"
                  type="checkbox"
                  value={value}
                />
                <span className="inline-flex min-h-10 items-center rounded-full border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-600 transition hover:border-[var(--zcash-gold)] peer-checked:border-[var(--brand-ink)] peer-checked:bg-[var(--brand-ink)] peer-checked:text-[var(--zcash-gold)] peer-focus-visible:ring-4 peer-focus-visible:ring-[rgba(245,168,0,0.18)]">
                  {label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-medium text-[var(--brand-ink)]">Themes</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {COMMUNITY_X_MONITOR_THEMES.map((theme) => (
              <label className="cursor-pointer" key={theme}>
                <input
                  className="peer sr-only"
                  defaultChecked={query.themes.includes(theme)}
                  name="theme"
                  type="checkbox"
                  value={theme}
                />
                <span className="inline-flex min-h-10 items-center rounded-full border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-600 transition hover:border-[var(--zcash-gold)] peer-checked:border-[var(--brand-ink)] peer-checked:bg-[var(--brand-ink)] peer-checked:text-[var(--zcash-gold)] peer-focus-visible:ring-4 peer-focus-visible:ring-[rgba(245,168,0,0.18)]">
                  {theme}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <input name="trend_range" type="hidden" value={query.trendRange} />
    </form>
  );
}
