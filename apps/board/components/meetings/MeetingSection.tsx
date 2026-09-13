"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/** Collapses secondary meeting content while keeping anchored navigation usable. */
export function MeetingSection({ id, title, detail, collapsed, children }: {
  id: string; title: string; detail?: string; collapsed: boolean; children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const reveal = () => { if (window.location.hash === `#${id}` && ref.current) ref.current.open = true; };
    const revealOnClick = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest("a")?.getAttribute("href") === `#${id}` && ref.current) ref.current.open = true;
    };
    reveal();
    window.addEventListener("hashchange", reveal);
    document.addEventListener("click", revealOnClick);
    return () => { window.removeEventListener("hashchange", reveal); document.removeEventListener("click", revealOnClick); };
  }, [id]);
  return <details ref={ref} open={!collapsed} className="group/section">
    <summary className="flex cursor-pointer list-none items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--focus)] [&::-webkit-details-marker]:hidden">
      <h2 className="min-w-0 flex-1 text-lg font-semibold tracking-[-0.025em]">{title}</h2>
      {detail && <span className="text-xs font-semibold text-[var(--muted)]">{detail}</span>}
      <ChevronDown aria-hidden="true" className="h-5 w-5 shrink-0 transition-transform group-open/section:rotate-180" />
    </summary>
    <div className="mt-4">{children}</div>
  </details>;
}
