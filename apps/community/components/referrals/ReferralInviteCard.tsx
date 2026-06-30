"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clipboard, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ReferralSummary = {
  referralCode: string;
  referralUrl: string;
  creditedSignupCount: number;
  activeRecruitCount: number;
  recentCredits: Array<{
    referredUserId: string;
    referredEmail: string | null;
    referredName: string | null;
    membershipStatus: "active" | "none";
    creditedAt: string;
  }>;
};

export function ReferralInviteCard({ className }: { className?: string }) {
  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadSummary = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/referrals/summary", { cache: "no-store" });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error || "Referral link unavailable");
        if (!cancelled) setSummary(body);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Referral link unavailable");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadSummary();
    return () => {
      cancelled = true;
    };
  }, []);

  const copyReferralLink = async () => {
    if (!summary?.referralUrl) return;
    try {
      await navigator.clipboard.writeText(summary.referralUrl);
      setCopied(true);
      setError(null);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Could not copy the referral link. Select the link and copy it manually.");
    }
  };

  return (
    <section className={cn("glass-surface p-6", className)} id="member-recruitment">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <p className="section-eyebrow text-[var(--brand-denim)]">Member recruitment</p>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--brand-ink)] text-[var(--zcash-gold)]">
              <Gift className="h-5 w-5" aria-hidden="true" />
            </span>
            <h2 className="text-2xl font-semibold text-[var(--brand-ink)]">Invite prospective members</h2>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-slate-600">
            Share your referral link with people who should be part of the PGPZ community.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-md border bg-white/80 px-4 py-2">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Sign-ups</div>
            <div className="text-xl font-semibold text-[var(--brand-ink)]">
              {summary?.creditedSignupCount ?? 0}
            </div>
          </div>
          <div className="rounded-md border bg-white/80 px-4 py-2">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Active</div>
            <div className="text-xl font-semibold text-[var(--brand-ink)]">
              {summary?.activeRecruitCount ?? 0}
            </div>
          </div>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <input
          value={loading ? "Loading..." : summary?.referralUrl || ""}
          readOnly
          aria-label="Referral link"
          className="min-w-0 flex-1 rounded-md border bg-white px-3 py-2 text-sm"
        />
        <Button type="button" variant="outline" onClick={copyReferralLink} disabled={!summary?.referralUrl || loading}>
          <Clipboard className="h-4 w-4" aria-hidden="true" />
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button type="button" asChild>
          <Link href="/settings/profile#member-recruitment">Details</Link>
        </Button>
      </div>
    </section>
  );
}
