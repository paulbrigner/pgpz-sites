import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "accent" | "success" | "warning";
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-full border px-3 py-1 text-[0.68rem] font-bold uppercase tracking-[0.16em]",
        tone === "neutral" && "border-slate-200 bg-white/80 text-slate-600",
        tone === "accent" && "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-ink)]",
        tone === "success" && "border-emerald-200 bg-emerald-50 text-emerald-800",
        tone === "warning" && "border-amber-300 bg-amber-50 text-amber-900",
        className,
      )}
      {...props}
    />
  );
}
