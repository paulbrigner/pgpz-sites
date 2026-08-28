"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck, X } from "lucide-react";

const NOTICE_KEY = "pgpz-board:governance-safeguards:v1";

export function GovernanceSafeguardsNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      setVisible(window.localStorage.getItem(NOTICE_KEY) !== "dismissed");
    } catch {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(NOTICE_KEY, "dismissed");
    } catch {
      // The notice can still be dismissed for this page view when browser
      // storage is unavailable.
    }
    setVisible(false);
  }

  return (
    <aside className="mt-8 flex items-start gap-4 rounded-2xl border border-[var(--accent-border)] bg-[var(--accent-soft)] px-5 py-4" aria-labelledby="governance-safeguards-notice-title">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[var(--accent-ink)]">
        <ShieldCheck className="h-4.5 w-4.5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 id="governance-safeguards-notice-title" className="text-sm font-semibold text-[var(--foreground)]">Governance records are protected by design</h2>
        <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
          The portal preserves document history, verifies file integrity, and records important activity for accountability.
        </p>
        <Link href="/governance-safeguards" className="mt-2 inline-flex text-sm font-semibold text-[var(--primary)] underline decoration-[var(--border-strong)] underline-offset-4 hover:decoration-[var(--primary)]">
          How records are protected
        </Link>
      </div>
      <button type="button" onClick={dismiss} aria-label="Dismiss governance safeguards notice" className="rounded-lg p-1.5 text-[var(--muted)] transition hover:bg-white hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]">
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </aside>
  );
}
