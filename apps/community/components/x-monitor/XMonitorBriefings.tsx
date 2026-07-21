"use client";

import { useEffect, useRef, useState } from "react";
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
  Minus,
  Plus,
} from "lucide-react";
import type { CuratedBriefing } from "@pgpz/x-monitor-core/contracts";

type BriefingCitation = CuratedBriefing["citations"][number];

type MarkdownNode = {
  type?: string;
  value?: string;
  url?: string;
  title?: string | null;
  children?: MarkdownNode[];
};

type CitationReference = {
  citation: BriefingCitation;
  href: string | null;
  number: number;
};

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

const linkedCitationMarker = /^(?:\[#([0-9]+)\]|#([0-9]+))$/;
const inlineCitationMarker = /\[#([0-9]{1,32})\]/g;

const buildCitationReferences = (citations: BriefingCitation[]) => {
  const seenStatusIds = new Set<string>();
  const references: CitationReference[] = [];

  citations.forEach((citation) => {
    const normalizedStatusId = String(citation.status_id || "").trim();
    if (normalizedStatusId && seenStatusIds.has(normalizedStatusId)) return;
    if (normalizedStatusId) seenStatusIds.add(normalizedStatusId);
    references.push({
      citation,
      href: xPostHref(normalizedStatusId),
      number: references.length + 1,
    });
  });

  return references;
};

const citationLinkNode = (reference: CitationReference): MarkdownNode => {
  const handle = String(reference.citation.author_handle || "").replace(/^@/, "").trim();
  return {
    type: "link",
    url: reference.href || undefined,
    title: `Source ${reference.number}: open ${handle ? `@${handle}` : "the cited"} post on X in a new tab`,
    children: [{ type: "text", value: `[${reference.number}]` }],
  };
};

const createCitationLinksPlugin = (citations: BriefingCitation[]) => {
  const referencesByStatusId = new Map<string, CitationReference>();
  buildCitationReferences(citations).forEach((reference) => {
    if (reference.href) {
      referencesByStatusId.set(String(reference.citation.status_id).trim(), reference);
    }
  });

  return function citationLinksPlugin() {
    return (tree: MarkdownNode) => {
      const rewriteChildren = (parent: MarkdownNode) => {
        if (!parent.children) return;

        parent.children = parent.children.flatMap((node) => {
          if (node.type === "link" || node.type === "linkReference") {
            const exactLabel = node.children?.length === 1 && node.children[0]?.type === "text"
              ? node.children[0].value || ""
              : "";
            const markerMatch = linkedCitationMarker.exec(exactLabel);
            if (markerMatch) {
              const reference = referencesByStatusId.get(markerMatch[1] || markerMatch[2]);
              return reference ? [citationLinkNode(reference)] : [{ type: "text", value: exactLabel }];
            }
            return [node];
          }

          if (
            node.type === "code"
            || node.type === "inlineCode"
            || node.type === "html"
            || node.type === "image"
            || node.type === "imageReference"
          ) {
            return [node];
          }

          if (node.type === "text" && node.value) {
            const replacements: MarkdownNode[] = [];
            let cursor = 0;
            let match: RegExpExecArray | null;
            inlineCitationMarker.lastIndex = 0;

            while ((match = inlineCitationMarker.exec(node.value)) !== null) {
              if (match.index > cursor) {
                replacements.push({ type: "text", value: node.value.slice(cursor, match.index) });
              }
              const reference = referencesByStatusId.get(match[1]);
              replacements.push(
                reference
                  ? citationLinkNode(reference)
                  : { type: "text", value: match[0] },
              );
              cursor = match.index + match[0].length;
            }

            if (replacements.length === 0) return [node];
            if (cursor < node.value.length) {
              replacements.push({ type: "text", value: node.value.slice(cursor) });
            }
            return replacements;
          }

          rewriteChildren(node);
          return [node];
        });
      };

      rewriteChildren(tree);
    };
  };
};

function BriefingMarkdown({
  children,
  citations,
}: {
  children: string;
  citations: BriefingCitation[];
}) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, createCitationLinksPlugin(citations)]}
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
        a: ({ href, title, children: label }) => {
          const safeHref = safeMarkdownHref(href);
          const isCitation = Boolean(
            safeHref && /^https:\/\/x\.com\/i\/status\/[0-9]{1,32}\/?$/.test(safeHref),
          );
          return safeHref ? (
            <Link
              href={safeHref}
              target="_blank"
              rel="noopener noreferrer"
              title={title || undefined}
              aria-label={isCitation ? title || undefined : undefined}
              className={isCitation
                ? "mx-0.5 inline-flex rounded bg-[var(--brand-ice)] px-1.5 py-0.5 text-xs font-semibold text-[var(--brand-denim)] no-underline"
                : "font-medium text-[var(--brand-denim)] underline"}
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
  const [openSlugs, setOpenSlugs] = useState<Set<string>>(() => new Set());
  const pendingToggleRef = useRef<{
    slug: string;
    summary: HTMLElement;
    top: number;
  } | null>(null);
  const toggleFrameRef = useRef<number | null>(null);
  const deepLinkFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const openBriefingFromHash = () => {
      let slug = "";
      try {
        slug = decodeURIComponent(window.location.hash.replace(/^#/, ""));
      } catch {
        return;
      }
      if (!slug) return;

      const target = document.getElementById(slug);
      if (!(target instanceof HTMLDetailsElement)) return;

      document
        .querySelectorAll<HTMLDetailsElement>('details[name="x-monitor-topic-briefing"]')
        .forEach((details) => {
          details.open = details === target;
        });
      setOpenSlugs(new Set([slug]));

      if (deepLinkFrameRef.current !== null) {
        window.cancelAnimationFrame(deepLinkFrameRef.current);
      }
      deepLinkFrameRef.current = window.requestAnimationFrame(() => {
        target.scrollIntoView?.({ block: "start", behavior: "instant" });
        deepLinkFrameRef.current = null;
      });
    };

    openBriefingFromHash();
    window.addEventListener("hashchange", openBriefingFromHash);
    return () => {
      window.removeEventListener("hashchange", openBriefingFromHash);
      if (deepLinkFrameRef.current !== null) {
        window.cancelAnimationFrame(deepLinkFrameRef.current);
      }
      if (toggleFrameRef.current !== null) {
        window.cancelAnimationFrame(toggleFrameRef.current);
      }
    };
  }, []);

  const handleSummaryClick = (slug: string, summary: HTMLElement) => {
    pendingToggleRef.current = {
      slug,
      summary,
      top: summary.getBoundingClientRect().top,
    };
  };

  const handleToggle = (slug: string, details: HTMLDetailsElement) => {
    const isOpen = details.open;
    setOpenSlugs((current) => {
      const currentlyOpen = current.has(slug);
      if (currentlyOpen === isOpen) return current;
      const next = new Set(current);
      if (isOpen) next.add(slug);
      else next.delete(slug);
      return next;
    });

    const pendingToggle = pendingToggleRef.current;
    if (!pendingToggle || pendingToggle.slug !== slug) return;
    pendingToggleRef.current = null;

    let currentHash = "";
    try {
      currentHash = decodeURIComponent(window.location.hash.replace(/^#/, ""));
    } catch {
      currentHash = "";
    }
    if (isOpen || currentHash === slug) {
      const hash = isOpen ? `#${encodeURIComponent(slug)}` : "";
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${window.location.search}${hash}`,
      );
    }

    if (toggleFrameRef.current !== null) {
      window.cancelAnimationFrame(toggleFrameRef.current);
    }
    toggleFrameRef.current = window.requestAnimationFrame(() => {
      if (pendingToggle.summary.isConnected) {
        const delta = pendingToggle.summary.getBoundingClientRect().top - pendingToggle.top;
        if (Math.abs(delta) > 1) {
          window.scrollBy({ top: delta, left: 0, behavior: "instant" });
        }
      }
      toggleFrameRef.current = null;
    });
  };

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
        {briefings.map((briefing) => {
          const isOpen = openSlugs.has(briefing.slug);
          const citationReferences = buildCitationReferences(briefing.citations);
          return (
            <details
              key={briefing.topic_id}
              id={briefing.slug}
              name="x-monitor-topic-briefing"
              className="glass-surface scroll-mt-28 overflow-hidden [&_summary::-webkit-details-marker]:hidden"
              onToggle={(event) => handleToggle(briefing.slug, event.currentTarget)}
            >
              <summary
                className="flex cursor-pointer list-none items-start justify-between gap-4 p-5 sm:p-6"
                onClick={(event) => handleSummaryClick(briefing.slug, event.currentTarget)}
              >
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
                <span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-white text-[var(--brand-denim)]">
                  {isOpen ? (
                    <Minus className="h-5 w-5" aria-hidden="true" />
                  ) : (
                    <Plus className="h-5 w-5" aria-hidden="true" />
                  )}
                  <span className="sr-only">{isOpen ? "Collapse answer" : "Expand answer"}</span>
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

                {briefing.key_points.length > 0 ? (
                  <div className="mb-6 rounded-2xl border border-[rgba(245,168,0,0.26)] bg-[var(--brand-ice)] p-5">
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

                <div className="space-y-4 text-sm leading-7 text-slate-700 sm:text-base [&_ol>li]:list-decimal">
                  <BriefingMarkdown citations={briefing.citations}>{briefing.answer_text}</BriefingMarkdown>
                </div>

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
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Numbered markers in the answer link directly to the matching monitored X posts.
                    </p>
                    <div className="mt-3 grid gap-3 lg:grid-cols-2">
                      {citationReferences.map(({ citation, href, number }, citationIndex) => {
                        const excerpt = citation.excerpt || citation.body_text;
                        const card = (
                          <>
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-semibold text-[var(--brand-denim)]">
                                Source {number} · @{citation.author_handle || "unknown"}
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
