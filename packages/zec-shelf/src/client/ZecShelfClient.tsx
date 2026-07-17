"use client";

import Image from "next/image";
import React, {
  type ButtonHTMLAttributes,
  type CSSProperties,
  type FormEvent,
  useId,
  useMemo,
  useState,
} from "react";
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
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  reorderClientResources,
  type ZecShelfCheckState,
  type ZecShelfClientConfig,
  type ZecShelfResource,
  type ZecShelfResourceDraft,
} from "../domain";

const STATE_COPY: Record<ZecShelfCheckState, { label: string; classes: string }> = {
  unchecked: { label: "Not tracked", classes: "border-slate-200 bg-slate-50 text-slate-500" },
  baseline: { label: "Tracking started", classes: "border-blue-200 bg-blue-50 text-blue-700" },
  same: { label: "No change", classes: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  changed: { label: "Updated", classes: "border-amber-300 bg-amber-50 text-amber-800" },
  error: { label: "Check failed", classes: "border-rose-200 bg-rose-50 text-rose-700" },
};

function cn(...values: ClassValue[]) {
  return twMerge(clsx(values));
}

type ZecShelfThemeStyle = CSSProperties & Record<`--zec-shelf-${string}`, string>;

function themeStyle(config: ZecShelfClientConfig): ZecShelfThemeStyle {
  return {
    "--zec-shelf-ink": config.theme.ink,
    "--zec-shelf-secondary": config.theme.secondary,
    "--zec-shelf-accent": config.theme.accent,
    "--zec-shelf-accent-soft": config.theme.accentSoft,
    "--zec-shelf-accent-subtle": config.theme.accentSubtle,
    "--zec-shelf-accent-text": config.theme.accentText,
    "--zec-shelf-ice": config.theme.ice,
    "--zec-shelf-teal": config.theme.teal,
    "--zec-shelf-surface": config.theme.surface,
    "--zec-shelf-focus-ring": config.theme.focusRing,
    "--zec-shelf-overlay": config.theme.overlay,
    "--zec-shelf-hero-background": config.theme.heroBackground,
    "--zec-shelf-hero-border": config.theme.heroBorder,
  };
}

function canonicalUrl(value: string) {
  try {
    return new URL(value).toString();
  } catch {
    return null;
  }
}

function fallbackPreview(resource: ZecShelfResource, config: ZecShelfClientConfig) {
  const fallback = config.fallbackPreviewByResourceId[resource.id];
  return fallback && canonicalUrl(fallback.url) === canonicalUrl(resource.url) ? fallback.src : null;
}

function FeatureButton({
  variant = "default",
  size = "default",
  isLoading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg";
  isLoading?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={disabled || isLoading}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--zec-shelf-focus-ring)] [&_svg]:pointer-events-none [&_svg]:shrink-0",
        variant === "default" && "bg-[var(--zec-shelf-ink)] text-white shadow-sm hover:bg-[var(--zec-shelf-secondary)]",
        variant === "outline" && "border border-slate-200 bg-white text-[var(--zec-shelf-ink)] shadow-sm hover:border-[var(--zec-shelf-accent)] hover:bg-[var(--zec-shelf-accent-subtle)]",
        variant === "ghost" && "text-[var(--zec-shelf-ink)] hover:bg-slate-100",
        size === "default" && "h-9 px-4 py-2",
        size === "sm" && "h-8 gap-1.5 px-3",
        size === "lg" && "h-10 px-6",
        isLoading && "cursor-wait",
        className,
      )}
    >
      {isLoading ? <span aria-hidden="true" className="inline-flex size-4 animate-spin rounded-full border-2 border-current border-r-transparent" /> : null}
      {children}
    </button>
  );
}

function hostFor(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
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
  suggestedCategories,
  datalistId,
  onSubmit,
  onCancel,
}: {
  initial: ZecShelfResourceDraft;
  submitLabel: string;
  suggestedCategories: readonly string[];
  datalistId: string;
  onSubmit: (draft: ZecShelfResourceDraft) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const fieldClasses = "mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-[var(--zec-shelf-ink)] outline-none transition focus:border-[var(--zec-shelf-accent)] focus:ring-2 focus:ring-[var(--zec-shelf-focus-ring)]";

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
        <input required list={datalistId} className={fieldClasses} value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} />
        <datalist id={datalistId}>
          {suggestedCategories.map((category) => <option key={category} value={category} />)}
        </datalist>
      </label>
      <div className="flex justify-end gap-3 border-t border-slate-100 pt-4 sm:col-span-2">
        <FeatureButton type="button" variant="outline" onClick={onCancel}>Cancel</FeatureButton>
        <FeatureButton type="submit" isLoading={saving}>{submitLabel}</FeatureButton>
      </div>
    </form>
  );
}

export function ZecShelfClient({
  initialResources,
  isAdmin,
  config,
}: {
  initialResources: ZecShelfResource[];
  isAdmin: boolean;
  config: ZecShelfClientConfig;
}) {
  const [resources, setResources] = useState(initialResources);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All resources");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<ZecShelfResource | null>(null);
  const [checking, setChecking] = useState<string | "all" | null>(null);
  const [error, setError] = useState("");
  const generatedId = useId().replace(/:/g, "");
  const datalistId = `zec-shelf-categories-${generatedId}`;
  const headingId = `zec-shelf-heading-${generatedId}`;
  const modalTitleId = `zec-shelf-modal-title-${generatedId}`;
  const apiBasePath = config.apiBasePath.replace(/\/$/, "");

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
    const data = await request(`${apiBasePath}/resources`, { method: "GET", cache: "no-store" });
    setResources(data.resources || []);
  }

  async function addResource(draft: ZecShelfResourceDraft) {
    try {
      await request(`${apiBasePath}/resources`, { method: "POST", body: JSON.stringify(draft) });
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
      await request(`${apiBasePath}/resources`, { method: "PATCH", body: JSON.stringify({ id: editing.id, ...draft }) });
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
      await request(`${apiBasePath}/resources?id=${encodeURIComponent(resource.id)}`, { method: "DELETE" });
      setError("");
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not remove that resource.");
    }
  }

  async function moveResource(id: string, destination: -1 | 1 | "top" | "bottom") {
    const reordered = reorderClientResources(resources, id, destination);
    if (reordered === resources) return;
    setResources(reordered);
    try {
      await request(`${apiBasePath}/resources`, {
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
      await request(`${apiBasePath}/check`, { method: "POST", body: JSON.stringify(id ? { id } : {}) });
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The update check could not finish.");
    } finally {
      setChecking(null);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 pb-14" style={themeStyle(config)}>
      <section className={cn(
        "relative overflow-hidden rounded-[1.75rem] border border-[var(--zec-shelf-hero-border)] [background:var(--zec-shelf-hero-background)] text-white shadow-[0_30px_60px_-32px_rgba(30,30,30,0.58)]",
        config.heroClassName,
      )}>
        <div className={cn(
          "relative w-full rounded-[1.65rem] border border-[var(--zec-shelf-hero-border)] bg-white/10 px-7 py-10 shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] backdrop-blur-[10px] sm:px-12 sm:py-14",
          config.heroFrameClassName,
        )}>
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-5">
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-white/70">{config.heroEyebrow}</p>
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[var(--zec-shelf-accent-soft)] bg-[var(--zec-shelf-accent-subtle)] text-[var(--zec-shelf-accent-soft)]">
                  <Library className="h-6 w-6" aria-hidden="true" />
                </span>
                <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">{config.title}</h1>
              </div>
              <p className="max-w-2xl text-base leading-7 text-white/78">{config.description}</p>
            </div>
            {isAdmin ? (
              <FeatureButton className="bg-[var(--zec-shelf-accent)] text-[var(--zec-shelf-ink)] hover:bg-[var(--zec-shelf-accent-soft)]" size="lg" onClick={() => setShowAdd(true)}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add resource
              </FeatureButton>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-[var(--zec-shelf-hero-border)] [background:var(--zec-shelf-surface)] p-5 shadow-[0_26px_46px_-30px_rgba(30,30,30,0.38)] backdrop-blur-[18px] sm:p-6" aria-labelledby={headingId}>
        <div className="flex flex-col gap-4 border-b border-[var(--zec-shelf-hero-border)] pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[var(--zec-shelf-secondary)]">{config.collectionEyebrow}</p>
            <h2 id={headingId} className="mt-2 text-3xl font-semibold text-[var(--zec-shelf-ink)]">{config.collectionTitle}</h2>
          </div>
          {isAdmin ? (
            <FeatureButton variant="outline" title="Check page content and refresh previews when needed" onClick={() => void checkForUpdates()} disabled={checking !== null || resources.length === 0}>
              <RefreshCw className={cn("h-4 w-4", checking === "all" && "animate-spin")} aria-hidden="true" />
              {checking === "all" ? "Checking sites…" : "Check for updates"}
            </FeatureButton>
          ) : null}
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(15rem,0.72fr)_1.28fr]">
          <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-500 shadow-sm focus-within:border-[var(--zec-shelf-accent)] focus-within:ring-2 focus-within:ring-[var(--zec-shelf-focus-ring)]">
            <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="sr-only">Search resources</span>
            <input className="min-w-0 flex-1 bg-transparent text-sm text-[var(--zec-shelf-ink)] outline-none placeholder:text-slate-400" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ZEC Shelf…" />
          </label>
          <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter by category">
            {categories.map((item) => (
              <button
                type="button"
                key={item}
                className={cn(
                  "shrink-0 rounded-full border px-4 py-2 text-xs font-semibold transition",
                  item === category
                    ? "border-[var(--zec-shelf-ink)] bg-[var(--zec-shelf-ink)] text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-[var(--zec-shelf-accent)] hover:text-[var(--zec-shelf-secondary)]",
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
          <div className="mt-5 rounded-2xl border border-dashed border-[var(--zec-shelf-hero-border)] bg-white/70 px-6 py-14 text-center">
            <Library className="mx-auto h-8 w-8 text-[var(--zec-shelf-accent)]" aria-hidden="true" />
            <h3 className="mt-4 text-lg font-semibold text-[var(--zec-shelf-ink)]">Nothing matches that search</h3>
            <p className="mt-2 text-sm text-slate-600">Try another phrase or category.</p>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {visible.map((resource) => {
              const actualIndex = resources.findIndex((item) => item.id === resource.id);
              const preview = resource.previewUrl || fallbackPreview(resource, config);
              const state = STATE_COPY[resource.checkState];
              return (
                <article
                  key={resource.id}
                  className={cn(
                    "grid gap-4 rounded-2xl border border-[var(--zec-shelf-hero-border)] bg-white p-4 shadow-[0_18px_38px_-32px_rgba(30,30,30,0.38)] transition hover:border-[var(--zec-shelf-accent)]",
                    isAdmin
                      ? "md:grid-cols-[3.5rem_13rem_minmax(0,1fr)] lg:grid-cols-[3.5rem_13rem_minmax(0,1fr)_8.5rem]"
                      : "md:grid-cols-[13rem_minmax(0,1fr)]",
                  )}
                >
                  {isAdmin ? (
                    <div className="flex items-center justify-between gap-2 md:flex-col md:justify-center">
                      <div className="grid grid-cols-4 gap-1 md:grid-cols-1">
                        <button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-[var(--zec-shelf-accent)] hover:text-[var(--zec-shelf-secondary)] disabled:cursor-not-allowed disabled:opacity-30" onClick={() => void moveResource(resource.id, "top")} disabled={actualIndex === 0 || category !== "All resources" || Boolean(query)} aria-label={`Move ${resource.title} to top`}><ArrowUpToLine className="h-4 w-4" aria-hidden="true" /></button>
                        <button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-[var(--zec-shelf-accent)] hover:text-[var(--zec-shelf-secondary)] disabled:cursor-not-allowed disabled:opacity-30" onClick={() => void moveResource(resource.id, -1)} disabled={actualIndex === 0 || category !== "All resources" || Boolean(query)} aria-label={`Move ${resource.title} up`}><ArrowUp className="h-4 w-4" aria-hidden="true" /></button>
                        <button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-[var(--zec-shelf-accent)] hover:text-[var(--zec-shelf-secondary)] disabled:cursor-not-allowed disabled:opacity-30" onClick={() => void moveResource(resource.id, 1)} disabled={actualIndex === resources.length - 1 || category !== "All resources" || Boolean(query)} aria-label={`Move ${resource.title} down`}><ArrowDown className="h-4 w-4" aria-hidden="true" /></button>
                        <button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-[var(--zec-shelf-accent)] hover:text-[var(--zec-shelf-secondary)] disabled:cursor-not-allowed disabled:opacity-30" onClick={() => void moveResource(resource.id, "bottom")} disabled={actualIndex === resources.length - 1 || category !== "All resources" || Boolean(query)} aria-label={`Move ${resource.title} to bottom`}><ArrowDownToLine className="h-4 w-4" aria-hidden="true" /></button>
                      </div>
                    </div>
                  ) : null}

                  <a href={resource.url} target="_blank" rel="noreferrer" className="group relative block aspect-[8/5] overflow-hidden rounded-xl border border-slate-200 bg-[var(--zec-shelf-ice)]" aria-label={`Open ${resource.title}`}>
                    {preview ? (
                      <Image src={preview} alt="" fill sizes="(min-width: 768px) 208px, 100vw" className="object-cover transition duration-300 group-hover:scale-[1.02]" />
                    ) : (
                      <span className="flex h-full items-center justify-center bg-[linear-gradient(145deg,var(--zec-shelf-ink),var(--zec-shelf-secondary))] text-4xl font-semibold text-[var(--zec-shelf-accent-soft)]" aria-hidden="true">{resource.title.slice(0, 1).toUpperCase()}</span>
                    )}
                  </a>

                  <div className="min-w-0 self-center">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[var(--zec-shelf-accent-subtle)] px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[var(--zec-shelf-accent-text)]">{resource.category}</span>
                      {isAdmin ? <span className={cn("rounded-full border px-3 py-1 text-[0.68rem] font-semibold", state.classes)}>{state.label}</span> : null}
                    </div>
                    <a href={resource.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-xl font-semibold text-[var(--zec-shelf-ink)] transition hover:text-[var(--zec-shelf-secondary)]">
                      {resource.title}
                      <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    </a>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{resource.description}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="font-medium text-[var(--zec-shelf-secondary)]">{hostFor(resource.url)}</span>
                      {resource.lastChangedAt ? <><span aria-hidden="true">•</span><span>Last update observed {formatRelativeDate(resource.lastChangedAt)}</span></> : null}
                      {isAdmin && resource.lastCheckedAt ? <><span aria-hidden="true">•</span><span>Checked {formatRelativeDate(resource.lastCheckedAt)}</span></> : null}
                      {isAdmin && resource.previewUpdatedAt ? <><span aria-hidden="true">•</span><span>Preview refreshed {formatRelativeDate(resource.previewUpdatedAt)}</span></> : null}
                    </div>
                  </div>

                  {isAdmin ? (
                    <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3 lg:flex-col lg:justify-center lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
                      <FeatureButton size="sm" variant="outline" title="Check page content and refresh its preview when needed" onClick={() => void checkForUpdates(resource.id)} disabled={checking !== null}><RefreshCw className={cn("h-3.5 w-3.5", checking === resource.id && "animate-spin")} aria-hidden="true" />Check</FeatureButton>
                      <FeatureButton size="sm" variant="outline" onClick={() => setEditing(resource)}><Pencil className="h-3.5 w-3.5" aria-hidden="true" />Edit</FeatureButton>
                      <FeatureButton size="sm" variant="ghost" className="text-rose-700 hover:bg-rose-50 hover:text-rose-800" onClick={() => void deleteResource(resource)}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" />Remove</FeatureButton>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}

        <div className="mt-5 flex flex-col gap-2 border-t border-[var(--zec-shelf-hero-border)] pt-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[var(--zec-shelf-teal)]" aria-hidden="true" />{config.curatedForLabel}</span>
          {isAdmin ? <span>{lastChecked ? `Last checked ${formatRelativeDate(lastChecked)}` : "Update tracking is ready"}</span> : null}
        </div>
      </section>

      {isAdmin && (showAdd || editing) ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[var(--zec-shelf-overlay)] p-4 backdrop-blur-sm" role="presentation" onMouseDown={() => { setShowAdd(false); setEditing(null); }}>
          <section className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--zec-shelf-hero-border)] bg-white p-5 shadow-2xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby={modalTitleId} onMouseDown={(event) => event.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[var(--zec-shelf-secondary)]">{editing ? "Edit entry" : "New entry"}</p>
                <h2 id={modalTitleId} className="mt-2 text-2xl font-semibold text-[var(--zec-shelf-ink)]">{editing ? "Update resource" : "Add to ZEC Shelf"}</h2>
              </div>
              <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50" onClick={() => { setShowAdd(false); setEditing(null); }} aria-label="Close"><X className="h-4 w-4" /></button>
            </div>
            <ResourceForm
              initial={editing ? { title: editing.title, url: editing.url, description: editing.description, category: editing.category } : { title: "", url: "https://", description: "", category: config.defaultCategory }}
              submitLabel={editing ? "Save changes" : "Add resource"}
              suggestedCategories={config.suggestedCategories}
              datalistId={datalistId}
              onSubmit={editing ? updateResource : addResource}
              onCancel={() => { setShowAdd(false); setEditing(null); }}
            />
          </section>
        </div>
      ) : null}
    </div>
  );
}
