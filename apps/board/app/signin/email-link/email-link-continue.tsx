"use client";

import { useState } from "react";
import { buttonStyles } from "@pgpz/ui";
import { buildBoardEmailLinkVerificationPath, resolveBoardEmailLinkCallback } from "@/lib/email-link";

export function EmailLinkContinue({ token, callbackUrl }: { token: string | null; callbackUrl: string }) {
  const [continuing, setContinuing] = useState(false);
  const signInPath = `/signin?callbackUrl=${encodeURIComponent(resolveBoardEmailLinkCallback(callbackUrl))}`;

  function continueSignIn() {
    const verificationPath = buildBoardEmailLinkVerificationPath(token, callbackUrl);
    if (!verificationPath || continuing) return;
    setContinuing(true);
    // A full navigation preserves Better Auth's normal redirect/cookie handling.
    window.location.assign(verificationPath);
  }

  return (
    <div className="grid gap-4">
      {token ? (
        <>
          <button type="button" onClick={continueSignIn} disabled={continuing}
            className={buttonStyles({ size: "lg", className: "justify-center disabled:opacity-60" })}>
            {continuing ? "Continuing…" : "Continue"}
          </button>
          <p className="text-sm leading-6 text-[var(--muted)]">This link can be used once and expires 10 minutes after it was sent.</p>
        </>
      ) : (
        <p role="alert" className="rounded-xl border border-[var(--accent-border)] bg-[var(--accent-soft)] px-4 py-3 text-sm leading-6 text-[var(--accent-ink)]">
          This email link is incomplete or invalid. Request a new sign-in link to continue.
        </p>
      )}
      <a href={signInPath} className="text-sm font-semibold text-[var(--primary)] underline">Request a new sign-in link</a>
    </div>
  );
}
