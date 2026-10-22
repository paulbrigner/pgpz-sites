"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { KeyRound, Link2, LockKeyhole, LogIn } from "lucide-react";
import { buttonStyles } from "@pgpz/ui";
import { betterAuthClient } from "@/lib/auth-client";
import { verifyBoardPasskey, BOARD_PASSKEY_VERIFICATION_ERROR } from "@/lib/step-up-client";
import { resolveSafeCallbackUrl } from "@/lib/callback-url";

const EMAIL_LINK_NOTICE = "If this email is registered for Board access, a link has been sent. Open the latest email and confirm the link within 10 minutes to set up or verify your passkey.";

function emailLinkError(code: string | null): string | null {
  if (!code) return null;
  if (code === "INVALID_TOKEN") {
    return "This email link has expired, has already been used, or is invalid. Request a fresh link below, then open the latest email within 10 minutes.";
  }
  // Never echo provider errors or disclose account/roster state.
  return "The email link could not complete sign-in. Request a fresh link below. If this keeps happening, contact the Board Chair or Executive Director.";
}

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
  const [error, setError] = useState<string | null>(() => emailLinkError(searchParams.get("error")));
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<"magic" | "passkey" | "password" | null>(null);
  const safeCallbackUrl = resolveSafeCallbackUrl(searchParams.get("callbackUrl"));

  async function requestMagicLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting("magic");
    setError(null);
    setNotice(null);
    try {
      await betterAuthClient.signIn.magicLink({
        email,
        callbackURL: `/account/security?callbackUrl=${encodeURIComponent(safeCallbackUrl)}`,
        errorCallbackURL: `/signin?callbackUrl=${encodeURIComponent(safeCallbackUrl)}`,
      });
      // Deliberately generic: do not disclose roster/account existence or email-delivery state.
      setNotice(EMAIL_LINK_NOTICE);
    } catch {
      setNotice(EMAIL_LINK_NOTICE);
    } finally {
      setSubmitting(null);
    }
  }

  async function signInWithPasskey() {
    setSubmitting("passkey");
    setError(null);
    try {
      await verifyBoardPasskey();
      router.push(safeCallbackUrl);
      router.refresh();
    } catch {
      setError(BOARD_PASSKEY_VERIFICATION_ERROR);
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
      {error ? <p role="alert" className="rounded-xl border border-[var(--accent-border)] bg-[var(--accent-soft)] px-4 py-3 text-sm leading-6 text-[var(--accent-ink)]">{error}</p> : null}
      {passwordlessEnabled ? (
        <>
          <p className="text-sm text-[var(--muted)]">Already set up a passkey? Use it to sign in.</p>
          <button type="button" onClick={signInWithPasskey} disabled={submitting !== null}
            className={buttonStyles({ size: "lg", className: "justify-center disabled:opacity-60" })}>
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            {submitting === "passkey" ? "Checking passkey…" : "Sign in with a passkey"}
          </button>

          <section aria-labelledby="passkey-setup-heading" className="grid gap-4 border-t border-[var(--border)] pt-6">
            <div>
              <h2 id="passkey-setup-heading" className="text-lg font-semibold">First visit? Set up a passkey</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Start with the email address invited to this portal. The email link confirms your access so you can create a passkey.</p>
              <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm leading-6 text-[var(--muted)]">
                <li>Request and open the email link.</li>
                <li>Confirm the link, then create your passkey.</li>
                <li>Verify your passkey to open the Board portal.</li>
              </ol>
            </div>
          <form onSubmit={requestMagicLink} className="grid gap-4">
            <label className="grid gap-2 text-sm font-semibold text-[var(--foreground)]">
              Email
              <input type="email" name="email" autoComplete="email webauthn" required value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-11 rounded-xl border border-[var(--border-strong)] bg-white px-4 text-sm font-normal text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--focus)]"
                placeholder="director@example.org" />
            </label>
            <button type="submit" disabled={submitting !== null}
              className={buttonStyles({ variant: "secondary", size: "lg", className: "justify-center disabled:opacity-60" })}>
              <Link2 className="h-4 w-4" aria-hidden="true" />
              {submitting === "magic" ? "Sending link…" : "Email me a sign-in link"}
            </button>
          </form>
            <p className="text-sm leading-6 text-[var(--muted)]">Recovering access? You can use the same email link to verify an existing passkey. If you have lost all your passkeys, contact the Board Chair or Executive Director for a reset.</p>
          </section>
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
    </div>
  );
}
