import type {
  AnchorHTMLAttributes,
  HTMLAttributes,
  ReactNode,
} from "react";
import { cn } from "./cn";

export function PersonalHome({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("space-y-5", className)} {...props} />;
}

export function PersonalHomeHeader({
  eyebrow,
  title,
  description,
  status,
  actions,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  eyebrow: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header
      className={cn(
        "rounded-[1.75rem] border p-6 sm:p-8",
        className,
      )}
      {...props}
    >
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <div className="text-xs font-semibold uppercase tracking-[0.24em]">
            {eyebrow}
          </div>
          <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-[-0.035em] sm:text-4xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-3 max-w-2xl text-sm leading-6 sm:text-base sm:leading-7">
              {description}
            </p>
          ) : null}
        </div>
        {status || actions ? (
          <div className="flex shrink-0 flex-col items-start gap-3 lg:items-end">
            {status}
            {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}

export function PersonalHomeGrid({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("grid items-start gap-5 lg:grid-cols-12", className)}
      {...props}
    />
  );
}

export function PersonalHomePanel({
  eyebrow,
  title,
  description,
  action,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-3xl border border-black/10 bg-white/90 p-5 shadow-[0_22px_48px_-38px_rgba(15,23,42,0.5)] sm:p-6",
        className,
      )}
      {...props}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {eyebrow ? (
            <div className="text-xs font-semibold uppercase tracking-[0.22em]">
              {eyebrow}
            </div>
          ) : null}
          <h2 className={cn("text-xl font-semibold tracking-[-0.025em]", eyebrow && "mt-2")}>
            {title}
          </h2>
          {description ? (
            <p className="mt-2 text-sm leading-6">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children ? <div className="mt-5">{children}</div> : null}
    </section>
  );
}

export function PersonalHomeAction({
  eyebrow,
  title,
  description,
  leading,
  trailing,
  className,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <a
      className={cn(
        "group flex min-h-24 items-start gap-3 rounded-2xl border border-black/10 bg-white/80 p-4 text-left no-underline transition hover:-translate-y-0.5 hover:border-black/20 hover:shadow-[0_18px_36px_-28px_rgba(15,23,42,0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2",
        className,
      )}
      {...props}
    >
      {leading ? <span className="shrink-0">{leading}</span> : null}
      <span className="min-w-0 flex-1">
        {eyebrow ? (
          <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.18em]">
            {eyebrow}
          </span>
        ) : null}
        <span className={cn("block font-semibold leading-5", eyebrow && "mt-1")}>
          {title}
        </span>
        {description ? (
          <span className="mt-1 block text-sm leading-5">{description}</span>
        ) : null}
      </span>
      {trailing ? <span className="shrink-0 self-center">{trailing}</span> : null}
    </a>
  );
}
