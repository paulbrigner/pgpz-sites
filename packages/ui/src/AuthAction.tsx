import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

export function SecureLinkSubmitButton({
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-[rgba(138,90,0,0.34)] bg-[var(--zcash-gold)] px-5 py-3 text-base font-semibold text-[var(--brand-ink)] shadow-[0_18px_34px_-20px_rgba(138,90,0,0.82)] transition-[background-color,box-shadow,transform] hover:-translate-y-0.5 hover:bg-[var(--zcash-gold-soft)] hover:shadow-[0_22px_38px_-20px_rgba(138,90,0,0.9)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--zcash-gold)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-55",
        className,
      )}
      {...props}
    />
  );
}
