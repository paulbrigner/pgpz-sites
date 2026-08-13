"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { KeyRound, Link2, LockKeyhole, LogIn } from "lucide-react";
import { buttonStyles } from "@pgpz/ui";
import { betterAuthClient } from "@/lib/auth-client";
import { resolveSafeCallbackUrl } from "@/lib/callback-url";

export function SignInForm({
  passwordlessEnabled,
  passwordEnabled,
}: {
  passwordlessEnabled: boolean;
  passwordEnabled: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<"magic" | "passkey" | "password" | null>(null);
  const safeCallbackUrl = resolveSafeCallbackUrl(searchParams.get("callbackUrl"));

  async function requestMagicLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting("magic");
    setError(null);
    setNotice(null);
    try {
      await betterAuthClient.signIn.magicLink({ email, callbackURL: safeCallbackUrl });
      // Deliberately generic: do not disclose roster/account existence or email-delivery state.
      setNotice("If this email is registered for Board access, a sign-in link has been sent. It expires in 10 minutes.");
    } catch {
      setNotice("If this email is registered for Board access, a sign-in link has been sent. It expires in 10 minutes.");
    } finally {
      setSubmitting(null);
    }
  }

  async function signInWithPasskey() {
    setSubmitting("passkey");
    setError(null);
    try {
      const result = await betterAuthClient.signIn.passkey();
      if (result.error) {
        setError("Passkey sign-in was not completed. Try again or request an email link.");
        return;
      }
      router.push(safeCallbackUrl);
      router.refresh();
    } catch {
      setError("Passkey sign-in is unavailable in this browser. Request an email link instead.");
    } finally {
      setSubmitting(null);
    }
  }

  async function signInWithPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting("password");
    setError(null);
    try {
      const result = await betterAuthClient.signIn.email({ email, password });
      if (result.error) {
        setError("Sign-in failed. Check your credentials or request an email link.");
        return;
      }
      router.push(safeCallbackUrl);
      router.refresh();
    } catch {
      setError("Sign-in is temporarily unavailable. Please try again shortly.");
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div data-safe-callback={safeCallbackUrl} className="grid gap-6 px-8 py-8">
      {passwordlessEnabled ? (
        <>
          <form onSubmit={requestMagicLink} className="grid gap-4" noValidate>
            <label className="grid gap-2 text-sm font-semibold text-[var(--foreground)]">
              Email
              <input type="email" name="email" autoComplete="email webauthn" required value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-11 rounded-xl border border-[var(--border-strong)] bg-white px-4 text-sm font-normal text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--focus)]"
                placeholder="director@example.org" />
            </label>
            <button type="submit" disabled={submitting !== null}
              className={buttonStyles({ size: "lg", className: "justify-center disabled:opacity-60" })}>
              <Link2 className="h-4 w-4" aria-hidden="true" />
              {submitting === "magic" ? "Sending link…" : "Email me a sign-in link"}
            </button>
          </form>

          <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]"><span className="h-px flex-1 bg-[var(--border)]" />or<span className="h-px flex-1 bg-[var(--border)]" /></div>
          <button type="button" onClick={signInWithPasskey} disabled={submitting !== null}
            className={buttonStyles({ variant: "secondary", size: "lg", className: "justify-center disabled:opacity-60" })}>
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            {submitting === "passkey" ? "Checking passkey…" : "Sign in with a passkey"}
          </button>
        </>
      ) : null}

      {passwordEnabled ? (
        <details className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4">
          <summary className="cursor-pointer text-sm font-semibold text-[var(--foreground)]">Use password during transition</summary>
          <form onSubmit={signInWithPassword} className="mt-4 grid gap-4" noValidate>
            {!passwordlessEnabled ? <label className="grid gap-2 text-sm font-semibold">Email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="h-11 rounded-xl border bg-white px-4" /></label> : null}
            <label className="grid gap-2 text-sm font-semibold">Password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="h-11 rounded-xl border bg-white px-4" /></label>
            <button type="submit" disabled={submitting !== null} className={buttonStyles({ variant: "secondary", className: "justify-center" })}>
              {submitting === "password" ? <LockKeyhole className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
              {submitting === "password" ? "Signing in…" : "Sign in with password"}
            </button>
          </form>
        </details>
      ) : null}

      {notice ? <p role="status" className="rounded-xl border border-[var(--primary)]/30 bg-[var(--primary-soft)] px-4 py-3 text-sm leading-6">{notice}</p> : null}
      {error ? <p role="alert" className="rounded-xl border border-[var(--accent-border)] bg-[var(--accent-soft)] px-4 py-3 text-sm leading-6 text-[var(--accent-ink)]">{error}</p> : null}
    </div>
  );
}
