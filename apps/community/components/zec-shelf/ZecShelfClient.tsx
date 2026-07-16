"use client";

import Image from "next/image";
import React, { FormEvent, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  ExternalLink,
  Library,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ZecShelfCheckState, ZecShelfResource, ZecShelfResourceDraft } from "@/lib/zec-shelf";

const EMPTY_DRAFT: ZecShelfResourceDraft = {
  title: "",
  url: "https://",
  description: "",
  category: "Community",
};

const SUGGESTED_CATEGORIES = [
  "Community",
  "Official",
  "Explorers",
  "Analytics",
  "Research & Media",
  "Learning",
  "Development",
  "Wallets & Payments",
  "Other",
];

const SITE_PREVIEWS: Record<string, string> = {
  "zcashcommunity.com": "/zec-shelf/zcash-community.png",
  "z.cash": "/zec-shelf/zcash-ecosystem.png",
  "cipherscan.app": "/zec-shelf/cipherscan.png",
  "zecstats.com": "/zec-shelf/zec-stats.png",
  "scifi.money": "/zec-shelf/scifi-money.png",
  "maxdesalle.com": "/zec-shelf/mastering-zcash.png",
  "github.com": "/zec-shelf/perfect-money.png",
};

const STATE_COPY: Record<ZecShelfCheckState, { label: string; classes: string }> = {
  unchecked: { label: "Not tracked", classes: "border-slate-200 bg-slate-50 text-slate-500" },
  baseline: { label: "Tracking started", classes: "border-blue-200 bg-blue-50 text-blue-700" },
  same: { label: "No change", classes: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  changed: { label: "Updated", classes: "border-amber-300 bg-amber-50 text-amber-800" },
  error: { label: "Check failed", classes: "border-rose-200 bg-rose-50 text-rose-700" },
};

function hostFor(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function previewFor(url: string) {
  return SITE_PREVIEWS[hostFor(url)] || null;
}

type MoveDestination = -1 | 1 | "top" | "bottom";

export function reorderClientResources(resources: ZecShelfResource[], id: string, destination: MoveDestination) {
  const index = resources.findIndex((resource) => resource.id === id);
  if (index < 0) return resources;
  const targetIndex = destination === "top"
    ? 0
    : destination === "bottom"
      ? resources.length - 1
      : index + destination;
  if (targetIndex < 0 || targetIndex >= resources.length || targetIndex === index) return resources;
  const reordered = [...resources];
  const [resource] = reordered.splice(index, 1);
  reordered.splice(targetIndex, 0, resource);
  return reordered;
}

function formatRelativeDate(value: string | null) {
  if (!value) return "Never checked";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Checked recently";
  const seconds = Math.round((date.valueOf() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

function ResourceForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: ZecShelfResourceDraft;
  submitLabel: string;
  onSubmit: (draft: ZecShelfResourceDraft) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const fieldClasses = "mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-[var(--brand-ink)] outline-none transition focus:border-[var(--zcash-gold)] focus:ring-2 focus:ring-[rgba(245,168,0,0.18)]";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await onSubmit(draft);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
      <label className="text-sm font-medium text-slate-700">
        Name
        <input autoFocus required className={fieldClasses} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Zcash Forum" />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Website
        <input required inputMode="url" className={fieldClasses} value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} placeholder="https://example.com" />
      </label>
      <label className="text-sm font-medium text-slate-700 sm:col-span-2">
        Description
        <textarea required rows={4} className={fieldClasses} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="What makes this resource useful?" />
      </label>
      <label className="text-sm font-medium text-slate-700 sm:col-span-2">
        Category
        <input required list="zec-shelf-categories" className={fieldClasses} value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} />
        <datalist id="zec-shelf-categories">
          {SUGGESTED_CATEGORIES.map((category) => <option key={category} value={category} />)}
        </datalist>
      </label>
      <div className="flex justify-end gap-3 border-t border-slate-100 pt-4 sm:col-span-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" isLoading={saving}>{submitLabel}</Button>
      </div>
    </form>
  );
}

export function ZecShelfClient({ initialResources, isAdmin }: { initialResources: ZecShelfResource[]; isAdmin: boolean }) {
  const [resources, setResources] = useState(initialResources);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All resources");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<ZecShelfResource | null>(null);
  const [checking, setChecking] = useState<string | "all" | null>(null);
  const [error, setError] = useState("");

  const categories = useMemo(
    () => ["All resources", ...Array.from(new Set(resources.map((item) => item.category)))],
    [resources],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return resources.filter((resource) => {
      const matchesCategory = category === "All resources" || resource.category === category;
      const haystack = `${resource.title} ${resource.description} ${resource.url} ${resource.category}`.toLowerCase();
      return matchesCategory && (!needle || haystack.includes(needle));
    });
  }, [category, query, resources]);

  const lastChecked = resources
    .map((resource) => resource.lastCheckedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) || null;

  async function request(path: string, init: RequestInit) {
    const response = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers || {}) },
    });
    const data = await response.json() as { resources?: ZecShelfResource[]; error?: string };
    if (!response.ok) throw new Error(data.error || "That change could not be saved.");
    return data;
  }

  async function reload() {
    const data = await request("/api/zec-shelf/resources", { method: "GET", cache: "no-store" });
    setResources(data.resources || []);
  }

  async function addResource(draft: ZecShelfResourceDraft) {
    try {
      await request("/api/zec-shelf/resources", { method: "POST", body: JSON.stringify(draft) });
      setShowAdd(false);
      setError("");
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add that resource.");
    }
  }

  async function updateResource(draft: ZecShelfResourceDraft) {
    if (!editing) return;
    try {
      await request("/api/zec-shelf/resources", { method: "PATCH", body: JSON.stringify({ id: editing.id, ...draft }) });
      setEditing(null);
      setError("");
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update that resource.");
    }
  }

  async function deleteResource(resource: ZecShelfResource) {
    if (!window.confirm(`Remove “${resource.title}” from ZEC Shelf?`)) return;
    try {
      await request(`/api/zec-shelf/resources?id=${encodeURIComponent(resource.id)}`, { method: "DELETE" });
      setError("");
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not remove that resource.");
    }
  }

  async function moveResource(id: string, destination: MoveDestination) {
    const reordered = reorderClientResources(resources, id, destination);
    if (reordered === resources) return;
    setResources(reordered);
    try {
      await request("/api/zec-shelf/resources", {
        method: "PATCH",
        body: JSON.stringify({ order: reordered.map((resource) => resource.id) }),
      });
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save that order.");
      await reload();
    }
  }

  async function checkForUpdates(id?: string) {
    setChecking(id || "all");
    setError("");
    try {
      await request("/api/zec-shelf/check", { method: "POST", body: JSON.stringify(id ? { id } : {}) });
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The update check could not finish.");
    } finally {
      setChecking(null);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 pb-14">
      <section className="community-hero">
        <div className="community-hero__frame">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-5">
              <p className="section-eyebrow text-white/70">Member resource library</p>
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[rgba(255,230,163,0.5)] bg-[rgba(245,168,0,0.16)] text-[var(--zcash-gold-soft)]">
                  <Library className="h-6 w-6" aria-hidden="true" />
                </span>
                <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">ZEC Shelf</h1>
              </div>
              <p className="max-w-2xl text-base leading-7 text-white/78">
                A curated home for useful Zcash websites, tools, research, and references—organized for easy return visits.
              </p>
            </div>
            {isAdmin ? (
              <Button className="bg-[var(--zcash-gold)] text-[var(--brand-ink)] hover:bg-[var(--zcash-gold-soft)]" size="lg" onClick={() => setShowAdd(true)}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add resource
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="glass-surface p-5 sm:p-6" aria-labelledby="zec-shelf-heading">
        <div className="flex flex-col gap-4 border-b border-[rgba(245,168,0,0.22)] pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="section-eyebrow text-[var(--brand-denim)]">The collection</p>
            <h2 id="zec-shelf-heading" className="mt-2 text-3xl font-semibold text-[var(--brand-ink)]">Resource library</h2>
          </div>
          {isAdmin ? (
            <Button variant="outline" title="Check page content and refresh previews when needed" onClick={() => void checkForUpdates()} disabled={checking !== null || resources.length === 0}>
              <RefreshCw className={cn("h-4 w-4", checking === "all" && "animate-spin")} aria-hidden="true" />
              {checking === "all" ? "Checking sites…" : "Check for updates"}
            </Button>
          ) : null}
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(15rem,0.72fr)_1.28fr]">
          <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-500 shadow-sm focus-within:border-[var(--zcash-gold)] focus-within:ring-2 focus-within:ring-[rgba(245,168,0,0.14)]">
            <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="sr-only">Search resources</span>
            <input className="min-w-0 flex-1 bg-transparent text-sm text-[var(--brand-ink)] outline-none placeholder:text-slate-400" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ZEC Shelf…" />
          </label>
          <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter by category">
            {categories.map((item) => (
              <button
                type="button"
                key={item}
                className={cn(
                  "shrink-0 rounded-full border px-4 py-2 text-xs font-semibold transition",
                  item === category
                    ? "border-[var(--brand-ink)] bg-[var(--brand-ink)] text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-[rgba(245,168,0,0.55)] hover:text-[var(--brand-denim)]",
                )}
                onClick={() => setCategory(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <div className="mt-4 flex items-start justify-between gap-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => setError("")} aria-label="Dismiss"><X className="h-4 w-4" /></button>
          </div>
        ) : null}

        {visible.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-dashed border-[rgba(245,168,0,0.38)] bg-white/70 px-6 py-14 text-center">
            <Library className="mx-auto h-8 w-8 text-[var(--zcash-gold)]" aria-hidden="true" />
            <h3 className="mt-4 text-lg font-semibold text-[var(--brand-ink)]">Nothing matches that search</h3>
            <p className="mt-2 text-sm text-slate-600">Try another phrase or category.</p>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {visible.map((resource) => {
              const actualIndex = resources.findIndex((item) => item.id === resource.id);
              const preview = resource.previewUrl || previewFor(resource.url);
              const state = STATE_COPY[resource.checkState];
              return (
                <article
                  key={resource.id}
                  className={cn(
                    "grid gap-4 rounded-2xl border border-[rgba(245,168,0,0.24)] bg-white p-4 shadow-[0_18px_38px_-32px_rgba(30,30,30,0.38)] transition hover:border-[rgba(245,168,0,0.5)]",
                    isAdmin
                      ? "md:grid-cols-[3.5rem_13rem_minmax(0,1fr)] lg:grid-cols-[3.5rem_13rem_minmax(0,1fr)_8.5rem]"
                      : "md:grid-cols-[3.5rem_13rem_minmax(0,1fr)]",
                  )}
                >
                  <div className="flex items-center justify-between gap-2 md:flex-col md:justify-center">
                    <span className="font-mono text-sm font-semibold text-slate-400">{String(actualIndex + 1).padStart(2, "0")}</span>
                    {isAdmin ? (
                      <div className="grid grid-cols-4 gap-1 md:grid-cols-1">
                        <button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-[var(--zcash-gold)] hover:text-[var(--brand-denim)] disabled:cursor-not-allowed disabled:opacity-30" onClick={() => void moveResource(resource.id, "top")} disabled={actualIndex === 0 || category !== "All resources" || Boolean(query)} aria-label={`Move ${resource.title} to top`}>
                          <ArrowUpToLine className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-[var(--zcash-gold)] hover:text-[var(--brand-denim)] disabled:cursor-not-allowed disabled:opacity-30" onClick={() => void moveResource(resource.id, -1)} disabled={actualIndex === 0 || category !== "All resources" || Boolean(query)} aria-label={`Move ${resource.title} up`}>
                          <ArrowUp className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-[var(--zcash-gold)] hover:text-[var(--brand-denim)] disabled:cursor-not-allowed disabled:opacity-30" onClick={() => void moveResource(resource.id, 1)} disabled={actualIndex === resources.length - 1 || category !== "All resources" || Boolean(query)} aria-label={`Move ${resource.title} down`}>
                          <ArrowDown className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-[var(--zcash-gold)] hover:text-[var(--brand-denim)] disabled:cursor-not-allowed disabled:opacity-30" onClick={() => void moveResource(resource.id, "bottom")} disabled={actualIndex === resources.length - 1 || category !== "All resources" || Boolean(query)} aria-label={`Move ${resource.title} to bottom`}>
                          <ArrowDownToLine className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <a href={resource.url} target="_blank" rel="noreferrer" className="group relative block aspect-[8/5] overflow-hidden rounded-xl border border-slate-200 bg-[var(--brand-ice)]" aria-label={`Open ${resource.title}`}>
                    {preview ? (
                      <Image src={preview} alt="" fill sizes="(min-width: 768px) 208px, 100vw" className="object-cover transition duration-300 group-hover:scale-[1.02]" />
                    ) : (
                      <span className="flex h-full items-center justify-center bg-[linear-gradient(145deg,var(--brand-ink),var(--brand-denim))] text-4xl font-semibold text-[var(--zcash-gold-soft)]" aria-hidden="true">{resource.title.slice(0, 1).toUpperCase()}</span>
                    )}
                  </a>

                  <div className="min-w-0 self-center">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[rgba(245,168,0,0.14)] px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[var(--brand-denim)]">{resource.category}</span>
                      {isAdmin ? <span className={cn("rounded-full border px-3 py-1 text-[0.68rem] font-semibold", state.classes)}>{state.label}</span> : null}
                    </div>
                    <a href={resource.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-xl font-semibold text-[var(--brand-ink)] transition hover:text-[var(--brand-denim)]">
                      {resource.title}
                      <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    </a>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{resource.description}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="font-medium text-[var(--brand-denim)]">{hostFor(resource.url)}</span>
                      {resource.lastChangedAt ? <><span aria-hidden="true">•</span><span>Last update observed {formatRelativeDate(resource.lastChangedAt)}</span></> : null}
                      {isAdmin && resource.lastCheckedAt ? <><span aria-hidden="true">•</span><span>Checked {formatRelativeDate(resource.lastCheckedAt)}</span></> : null}
                      {isAdmin && resource.previewUpdatedAt ? <><span aria-hidden="true">•</span><span>Preview refreshed {formatRelativeDate(resource.previewUpdatedAt)}</span></> : null}
                    </div>
                  </div>

                  {isAdmin ? (
                    <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3 lg:flex-col lg:justify-center lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
                      <Button size="sm" variant="outline" title="Check page content and refresh its preview when needed" onClick={() => void checkForUpdates(resource.id)} disabled={checking !== null}>
                        <RefreshCw className={cn("h-3.5 w-3.5", checking === resource.id && "animate-spin")} aria-hidden="true" />
                        Check
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditing(resource)}><Pencil className="h-3.5 w-3.5" aria-hidden="true" />Edit</Button>
                      <Button size="sm" variant="ghost" className="text-rose-700 hover:bg-rose-50 hover:text-rose-800" onClick={() => void deleteResource(resource)}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" />Remove</Button>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}

        <div className="mt-5 flex flex-col gap-2 border-t border-[rgba(245,168,0,0.22)] pt-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[var(--brand-teal)]" aria-hidden="true" />Curated for PGPZ Community members</span>
          {isAdmin ? <span>{lastChecked ? `Last checked ${formatRelativeDate(lastChecked)}` : "Update tracking is ready"}</span> : null}
        </div>
      </section>

      {isAdmin && (showAdd || editing) ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(23,19,10,0.72)] p-4 backdrop-blur-sm" role="presentation" onMouseDown={() => { setShowAdd(false); setEditing(null); }}>
          <section className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[rgba(245,168,0,0.3)] bg-white p-5 shadow-2xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="zec-shelf-modal-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="section-eyebrow text-[var(--brand-denim)]">{editing ? "Edit entry" : "New entry"}</p>
                <h2 id="zec-shelf-modal-title" className="mt-2 text-2xl font-semibold text-[var(--brand-ink)]">{editing ? "Update resource" : "Add to ZEC Shelf"}</h2>
              </div>
              <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50" onClick={() => { setShowAdd(false); setEditing(null); }} aria-label="Close"><X className="h-4 w-4" /></button>
            </div>
            <ResourceForm
              initial={editing ? { title: editing.title, url: editing.url, description: editing.description, category: editing.category } : EMPTY_DRAFT}
              submitLabel={editing ? "Save changes" : "Add resource"}
              onSubmit={editing ? updateResource : addResource}
              onCancel={() => { setShowAdd(false); setEditing(null); }}
            />
          </section>
        </div>
      ) : null}
    </div>
  );
}
