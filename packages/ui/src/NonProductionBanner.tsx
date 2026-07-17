import type { ReactNode } from "react";

export function NonProductionBanner({
  label = "Reference environment",
  children,
}: {
  label?: string;
  children?: ReactNode;
}) {
  return (
    <div className="border-b border-amber-300/70 bg-amber-50 text-amber-950" role="status" aria-label={label}>
      <div className="mx-auto flex min-h-10 w-full max-w-6xl flex-wrap items-center justify-center gap-x-3 gap-y-1 px-5 py-2 text-center text-xs font-semibold sm:text-sm">
        <span className="rounded-full bg-amber-900 px-2.5 py-1 text-[0.64rem] uppercase tracking-[0.18em] text-white">
          Non-production
        </span>
        <span>{children ?? "Executable example using synthetic content and disabled outbound services."}</span>
      </div>
    </div>
  );
}
