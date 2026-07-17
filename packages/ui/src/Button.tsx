import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "outline" | "quiet";
export type ButtonSize = "sm" | "md" | "lg";

export function buttonStyles({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2",
    "disabled:pointer-events-none disabled:opacity-50",
    variant === "primary" && "bg-[var(--primary)] text-white shadow-[0_14px_30px_-16px_var(--primary)] hover:bg-[var(--primary-strong)]",
    variant === "secondary" && "bg-[var(--accent)] text-[var(--foreground)] hover:bg-[var(--accent-strong)]",
    variant === "outline" && "border border-[var(--border-strong)] bg-white/70 text-[var(--foreground)] hover:bg-white",
    variant === "quiet" && "text-[var(--primary)] hover:bg-[var(--primary-soft)]",
    size === "sm" && "min-h-9 px-4 text-sm",
    size === "md" && "min-h-11 px-5 text-sm",
    size === "lg" && "min-h-12 px-6 text-base",
    className,
  );
}

export function Button({
  variant,
  size,
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      type={type}
      className={buttonStyles({ variant, size, className })}
      {...props}
    />
  );
}
