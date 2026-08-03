"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { LockKeyhole, LogIn } from "lucide-react";
import { buttonStyles } from "@pgpz/ui";
import { betterAuthClient } from "@/lib/auth-client";
import { resolveSafeCallbackUrl } from "@/lib/callback-url";

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // The query-string callbackUrl is attacker-controlled; only a validated
  // application-local path may be reached after sign-in (no open redirect,
  // no javascript:/data: schemes, no protocol-relative hosts).
  const safeCallbackUrl = resolveSafeCallbackUrl(searchParams.get("callbackUrl"));

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await betterAuthClient.signIn.email({ email, password });
      if (result.error) {
        setError("Sign-in failed. Check your email and password, or contact the board administrator.");
        return;
      }
      router.push(safeCallbackUrl);
      router.refresh();
    } catch {
      setError("Sign-in is temporarily unavailable. Please try again shortly.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} data-safe-callback={safeCallbackUrl} className="grid gap-5 px-8 py-8" noValidate>
      <label className="grid gap-2 text-sm font-semibold text-[var(--foreground)]">
        Email
        <input
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="h-11 rounded-xl border border-[var(--border-strong)] bg-white px-4 text-sm font-normal text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--focus)]"
          placeholder="director@example.org"
        />
      </label>
      <label className="grid gap-2 text-sm font-semibold text-[var(--foreground)]">
        Password
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="h-11 rounded-xl border border-[var(--border-strong)] bg-white px-4 text-sm font-normal text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--focus)]"
        />
      </label>

      {error ? (
        <p role="alert" className="rounded-xl border border-[var(--accent-border)] bg-[var(--accent-soft)] px-4 py-3 text-sm leading-6 text-[var(--accent-ink)]">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className={buttonStyles({ size: "lg", className: "mt-1 justify-center disabled:opacity-60" })}
      >
        {submitting ? (
          <LockKeyhole className="h-4 w-4" aria-hidden="true" />
        ) : (
          <LogIn className="h-4 w-4" aria-hidden="true" />
        )}
        {submitting ? "Signing in…" : "Sign in"}
      </button>

      <p className="flex items-center gap-2 text-xs leading-5 text-[var(--muted)]">
        <LockKeyhole className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Accounts are provisioned by the board administrator. Self-registration is disabled.
      </p>
    </form>
  );
}
