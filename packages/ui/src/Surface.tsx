import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export function Container({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mx-auto w-full max-w-6xl px-5 sm:px-7", className)} {...props} />;
}

export function Surface({
  tone = "default",
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  tone?: "default" | "subtle" | "dark";
}) {
  return (
    <section
      className={cn(
        "rounded-[1.75rem] border",
        tone === "default" && "border-[var(--border)] bg-white/82 shadow-[0_26px_70px_-46px_rgba(15,23,42,0.48)] backdrop-blur",
        tone === "subtle" && "border-[var(--border)] bg-[var(--surface-muted)]",
        tone === "dark" && "border-white/10 bg-[var(--foreground)] text-white shadow-[0_30px_80px_-44px_rgba(15,23,42,0.8)]",
        className,
      )}
      {...props}
    />
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
}: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  align?: "left" | "center";
}) {
  return (
    <div className={cn("max-w-3xl", align === "center" && "mx-auto text-center")}>
      <p className="text-xs font-bold uppercase tracking-[0.28em] text-[var(--primary)]">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-[var(--foreground)] sm:text-4xl">
        {title}
      </h2>
      {description ? <p className="mt-4 text-base leading-7 text-[var(--muted)]">{description}</p> : null}
    </div>
  );
}
