import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

type LetterSummaryMarkdownProps = {
  children: string;
  className?: string;
  compact?: boolean;
  disableLinks?: boolean;
};

export function safeLetterSummaryHref(href: string | undefined) {
  const value = href?.trim();
  if (!value) return null;
  if (value.startsWith("#")) return value;
  if (value.startsWith("/") && !value.startsWith("//")) return value;

  try {
    const url = new URL(value);
    return ["https:", "http:", "mailto:"].includes(url.protocol)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function LetterSummaryMarkdown({
  children,
  className,
  compact = false,
  disableLinks = false,
}: LetterSummaryMarkdownProps) {
  const blockSpacing = compact ? "mt-2 first:mt-0" : "mt-4 first:mt-0";

  return (
    <div
      className={cn(
        "text-slate-600",
        compact ? "text-sm leading-6" : "text-base leading-7",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          h1: ({ children: heading }) => (
            <h2
              className={cn(
                blockSpacing,
                "font-semibold text-[var(--brand-ink)]",
                compact ? "text-base" : "text-xl",
              )}
            >
              {heading}
            </h2>
          ),
          h2: ({ children: heading }) => (
            <h3
              className={cn(
                blockSpacing,
                "font-semibold text-[var(--brand-ink)]",
                compact ? "text-sm" : "text-lg",
              )}
            >
              {heading}
            </h3>
          ),
          h3: ({ children: heading }) => (
            <h4
              className={cn(
                blockSpacing,
                "font-semibold text-[var(--brand-ink)]",
                compact ? "text-sm" : "text-base",
              )}
            >
              {heading}
            </h4>
          ),
          p: ({ children: paragraph }) => (
            <p className={blockSpacing}>{paragraph}</p>
          ),
          ul: ({ children: items }) => (
            <ul className={cn(blockSpacing, "list-disc space-y-1 pl-5")}>
              {items}
            </ul>
          ),
          ol: ({ children: items }) => (
            <ol className={cn(blockSpacing, "list-decimal space-y-1 pl-5")}>
              {items}
            </ol>
          ),
          li: ({ children: item }) => <li>{item}</li>,
          blockquote: ({ children: quote }) => (
            <blockquote
              className={cn(
                blockSpacing,
                "border-l-4 border-[var(--zcash-gold)] pl-4 text-slate-600",
              )}
            >
              {quote}
            </blockquote>
          ),
          a: ({ href, title, children: label }) => {
            const safeHref = safeLetterSummaryHref(href);
            if (!safeHref || disableLinks) {
              return <span>{label}</span>;
            }
            const opensNewWindow =
              safeHref.startsWith("https://") ||
              safeHref.startsWith("http://");
            return (
              <a
                href={safeHref}
                title={title || undefined}
                target={opensNewWindow ? "_blank" : undefined}
                rel={opensNewWindow ? "noopener noreferrer" : undefined}
                className="font-medium text-[var(--brand-denim)] underline decoration-[rgba(30,78,121,0.35)] underline-offset-2 hover:decoration-current"
              >
                {label}
              </a>
            );
          },
          img: () => null,
          code: ({ children: code }) => (
            <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.9em] text-[var(--brand-ink)]">
              {code}
            </code>
          ),
          pre: ({ children: code }) => (
            <pre
              className={cn(
                blockSpacing,
                "overflow-x-auto rounded-lg bg-slate-950 p-4 text-sm leading-6 text-slate-100",
              )}
            >
              {code}
            </pre>
          ),
          table: ({ children: table }) => (
            <div className={cn(blockSpacing, "overflow-x-auto")}>
              <table className="w-full border-collapse text-sm">{table}</table>
            </div>
          ),
          th: ({ children: cell }) => (
            <th className="border border-slate-200 bg-slate-100 px-3 py-2 text-left font-semibold text-[var(--brand-ink)]">
              {cell}
            </th>
          ),
          td: ({ children: cell }) => (
            <td className="border border-slate-200 px-3 py-2 align-top">
              {cell}
            </td>
          ),
          hr: () => <hr className={cn(blockSpacing, "border-slate-200")} />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
