"use client";

import { useEffect } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlertTriangle,
  BookOpenText,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  Link2,
  MessageSquareText,
} from "lucide-react";
import type { CuratedBriefing } from "@pgpz/x-monitor-core/contracts";

const formatDate = (value: string | null | undefined) => {
  if (!value) return "Not available";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Not available";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const xPostHref = (statusId: string) => {
  const normalized = String(statusId || "").trim();
  return /^[0-9]{1,32}$/.test(normalized) ? `https://x.com/i/status/${normalized}` : null;
};

const safeMarkdownHref = (href: string | undefined) => {
  if (!href) return null;
  try {
    const url = new URL(href);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
};

function BriefingMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      skipHtml
      components={{
        h1: ({ children: heading }) => <h3 className="mt-6 text-xl font-semibold text-[var(--brand-ink)]">{heading}</h3>,
        h2: ({ children: heading }) => <h3 className="mt-6 text-lg font-semibold text-[var(--brand-ink)]">{heading}</h3>,
        h3: ({ children: heading }) => <h4 className="mt-5 text-base font-semibold text-[var(--brand-ink)]">{heading}</h4>,
        p: ({ children: paragraph }) => <p>{paragraph}</p>,
        ul: ({ children: items }) => <ul className="space-y-1 pl-6">{items}</ul>,
        ol: ({ children: items }) => <ol className="space-y-1 pl-6">{items}</ol>,
        li: ({ children: item, node }) => (
          <li className={node?.position ? "list-disc" : undefined}>{item}</li>
        ),
        blockquote: ({ children: quote }) => (
          <blockquote className="border-l-4 border-[var(--zcash-gold)] pl-4 text-slate-600">{quote}</blockquote>
        ),
        a: ({ href, children: label }) => {
          const safeHref = safeMarkdownHref(href);
          return safeHref ? (
            <Link
              href={safeHref}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[var(--brand-denim)] underline"
            >
              {label}
            </Link>
          ) : <span>{label}</span>;
        },
        img: () => null,
        table: ({ children: table }) => (
          <div className="overflow-x-auto"><table className="w-full border-collapse text-sm">{table}</table></div>
        ),
        th: ({ children: cell }) => <th className="border bg-[var(--brand-ice)] px-3 py-2 text-left">{cell}</th>,
        td: ({ children: cell }) => <td className="border px-3 py-2 align-top">{cell}</td>,
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

export function XMonitorBriefings({ briefings }: { briefings: CuratedBriefing[] }) {
  useEffect(() => {
    let slug = "";
    try {
      slug = decodeURIComponent(window.location.hash.replace(/^#/, ""));
    } catch {
      return;
    }
    if (!slug) return;
    const target = document.getElementById(slug);
    if (target instanceof HTMLDetailsElement) {
      target.open = true;
      target.scrollIntoView?.({ block: "start" });
    }
  }, []);

  if (briefings.length === 0) {
    return (
      <section className="muted-card p-8 text-center" role="status">
        <BookOpenText className="mx-auto h-8 w-8 text-[var(--brand-denim)]" aria-hidden="true" />
        <h2 className="mt-4 text-xl font-semibold text-[var(--brand-ink)]">
          Topic briefings are being prepared
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
          PGPZ administrators are reviewing the first set of generated briefings. Published,
          reviewed answers will appear here.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="topic-briefings-heading" className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="section-eyebrow text-[var(--brand-denim)]">Curated questions</p>
          <h2 id="topic-briefings-heading" className="mt-2 text-2xl font-semibold text-[var(--brand-ink)]">
            Published briefings
          </h2>
        </div>
        <p className="text-xs leading-5 text-slate-500">
          {briefings.length} reviewed {briefings.length === 1 ? "topic" : "topics"}
        </p>
      </div>

      <div className="space-y-4">
        {briefings.map((briefing, index) => {
          return (
            <details
              key={briefing.topic_id}
              id={briefing.slug}
              name="x-monitor-topic-briefing"
              open={index === 0 ? true : undefined}
              className="glass-surface scroll-mt-28 overflow-hidden [&_summary::-webkit-details-marker]:hidden"
            >
              <summary className="group flex cursor-pointer list-none items-start justify-between gap-4 p-5 sm:p-6">
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    {briefing.category ? (
                      <span className="rounded-full bg-[var(--brand-ink)] px-3 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-[var(--zcash-gold)]">
                        {briefing.category}
                      </span>
                    ) : null}
                    {briefing.stale ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-amber-900">
                        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                        Update under review
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-emerald-800">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                        PGPZ reviewed
                      </span>
                    )}
                  </span>
                  <span className="mt-3 block text-lg font-semibold leading-7 text-[var(--brand-ink)] sm:text-xl">
                    {briefing.question}
                  </span>
                  <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs leading-5 text-slate-500">
                    <span>Evidence through {formatDate(briefing.corpus_through)}</span>
                    <span>{briefing.source_count} {briefing.source_count === 1 ? "source" : "sources"}</span>
                  </span>
                </span>
                <span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-white text-[var(--brand-denim)] transition group-open:rotate-45">
                  <span className="text-xl leading-none" aria-hidden="true">+</span>
                  <span className="sr-only">Toggle answer</span>
                </span>
              </summary>

              <div className="border-t border-[rgba(245,168,0,0.22)] bg-white/70 px-5 py-6 sm:px-6">
                {briefing.stale ? (
                  <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <p>
                      The scheduled freshness window has passed. This remains the last PGPZ-approved
                      answer while updated evidence is reviewed.
                    </p>
                  </div>
                ) : null}

                <div className="space-y-4 text-sm leading-7 text-slate-700 sm:text-base [&_ol>li]:list-decimal">
                  <BriefingMarkdown>{briefing.answer_text}</BriefingMarkdown>
                </div>

                {briefing.key_points.length > 0 ? (
                  <div className="mt-6 rounded-2xl border border-[rgba(245,168,0,0.26)] bg-[var(--brand-ice)] p-5">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--brand-ink)]">
                      <MessageSquareText className="h-4 w-4 text-[var(--brand-denim)]" aria-hidden="true" />
                      Key points
                    </h3>
                    <ul className="mt-3 space-y-2 pl-5 text-sm leading-6 text-slate-700">
                      {briefing.key_points.map((point, pointIndex) => (
                        <li key={`${briefing.version_id}-point-${pointIndex}`} className="list-disc">
                          {point}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="mt-6 grid gap-3 rounded-2xl border bg-white p-4 text-xs leading-5 text-slate-600 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <span className="block font-semibold text-[var(--brand-ink)]">Evidence current through</span>
                    <span>{formatDate(briefing.corpus_through)}</span>
                  </div>
                  <div>
                    <span className="block font-semibold text-[var(--brand-ink)]">AI draft generated</span>
                    <span>{formatDate(briefing.generated_at)}</span>
                  </div>
                  <div>
                    <span className="block font-semibold text-[var(--brand-ink)]">PGPZ reviewed</span>
                    <span>{formatDate(briefing.reviewed_at)}</span>
                  </div>
                  <div>
                    <span className="block font-semibold text-[var(--brand-ink)]">Published</span>
                    <span>{formatDate(briefing.published_at)}</span>
                  </div>
                </div>

                {briefing.citations.length > 0 ? (
                  <div className="mt-6">
                    <h3 className="text-sm font-semibold text-[var(--brand-ink)]">Sources from monitored X conversation</h3>
                    <div className="mt-3 grid gap-3 lg:grid-cols-2">
                      {briefing.citations.map((citation, citationIndex) => {
                        const href = xPostHref(citation.status_id);
                        const excerpt = citation.excerpt || citation.body_text;
                        const card = (
                          <>
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-semibold text-[var(--brand-denim)]">
                                @{citation.author_handle || "unknown"}
                              </span>
                              <span className="text-xs text-slate-500">{formatDate(citation.discovered_at)}</span>
                            </div>
                            {excerpt ? (
                              <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{excerpt}</p>
                            ) : null}
                            {href ? (
                              <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[var(--brand-denim)]">
                                Open post on X
                                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                              </span>
                            ) : null}
                          </>
                        );
                        return href ? (
                          <Link
                            key={`${citation.status_id}-${citationIndex}`}
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-xl border bg-white p-4 transition hover:border-[rgba(245,168,0,0.5)]"
                          >
                            {card}
                          </Link>
                        ) : (
                          <div key={`${citation.status_id}-${citationIndex}`} className="rounded-xl border bg-white p-4">
                            {card}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <div className="mt-6 flex flex-col gap-3 border-t pt-4 text-xs leading-5 text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                  <p className="max-w-3xl">
                    AI-generated from monitored public X posts and reviewed by PGPZ. This briefing
                    summarizes conversation in the cited evidence; it is not a substitute for primary
                    technical documentation or legal advice.
                  </p>
                  <Link
                    href={`#${briefing.slug}`}
                    className="inline-flex shrink-0 items-center gap-1.5 font-semibold text-[var(--brand-denim)] underline"
                    aria-label={`Link to ${briefing.question}`}
                  >
                    <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Link to briefing
                  </Link>
                </div>
              </div>
            </details>
          );
        })}
      </div>

      <div className="muted-card flex items-start gap-3 p-4 text-xs leading-5 text-slate-600">
        <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-denim)]" aria-hidden="true" />
        <p>
          Briefings are refreshed on topic-specific schedules. New AI drafts are not shown until a
          PGPZ administrator reviews and publishes them.
        </p>
      </div>
    </section>
  );
}
