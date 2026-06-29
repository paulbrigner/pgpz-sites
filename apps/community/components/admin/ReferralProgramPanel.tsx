"use client";

import { useEffect, useState } from "react";
import { Gift, RefreshCcw, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReferralAdminReport } from "@/lib/referrals";
import { cn } from "@/lib/utils";

const formatDateTime = (value: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const displayText = (name: string | null, email: string | null) => name || email || "Unknown member";

export function ReferralProgramPanel() {
  const [report, setReport] = useState<ReferralAdminReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/referrals", { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to load referral report");
      setReport(body);
    } catch (err: any) {
      setError(err?.message || "Failed to load referral report");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadReport();
  }, []);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Credited sign-ups", report?.meta.totalCredits ?? 0],
          ["Active recruits", report?.meta.activeRecruitCount ?? 0],
          ["Recruiters", report?.meta.uniqueReferrers ?? 0],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border bg-white/80 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</div>
            <div className="mt-2 text-2xl font-semibold text-[var(--brand-ink)]">{value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border bg-white/85 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-lg font-semibold text-[var(--brand-ink)]">
              <Gift className="h-5 w-5 text-[var(--zcash-gold-deep)]" />
              Recruitment incentives
            </div>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Use credited sign-ups for periodic incentive gift review.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={loadReport} disabled={loading}>
            <RefreshCcw className={cn("h-4 w-4", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border bg-white/90">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-[0.3fr_1.3fr_0.55fr_0.55fr_0.8fr] gap-3 border-b bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            <div>Rank</div>
            <div>Recruiter</div>
            <div>Sign-ups</div>
            <div>Active</div>
            <div>Last credit</div>
          </div>
          {loading ? (
            <div className="p-6 text-sm text-slate-600">Loading referrals...</div>
          ) : report?.leaderboard.length ? (
            <div className="divide-y">
              {report.leaderboard.map((entry, index) => (
                <div
                  key={entry.referrerUserId}
                  className="grid grid-cols-[0.3fr_1.3fr_0.55fr_0.55fr_0.8fr] gap-3 px-4 py-4 text-sm"
                >
                  <div className="flex items-center gap-2 font-semibold text-[var(--brand-ink)]">
                    {index === 0 ? <Trophy className="h-4 w-4 text-[var(--zcash-gold-deep)]" /> : null}
                    {index + 1}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-[var(--brand-ink)]">
                      {displayText(entry.referrerName, entry.referrerEmail)}
                    </div>
                    <div className="truncate text-xs text-slate-500">
                      {entry.referralUrl || entry.referralCode || "No referral link"}
                    </div>
                  </div>
                  <div className="font-semibold">{entry.creditedSignupCount}</div>
                  <div className="font-semibold">{entry.activeRecruitCount}</div>
                  <div className="text-xs text-slate-600">{formatDateTime(entry.lastCreditAt)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 text-sm text-slate-600">No credited referral sign-ups yet.</div>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-white/90">
        <div className="min-w-[680px]">
          <div className="grid grid-cols-[1fr_1fr_0.55fr_0.75fr] gap-3 border-b bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            <div>Referred member</div>
            <div>Recruiter</div>
            <div>Status</div>
            <div>Credited</div>
          </div>
          {loading ? (
            <div className="p-6 text-sm text-slate-600">Loading credits...</div>
          ) : report?.credits.length ? (
            <div className="divide-y">
              {report.credits.slice(0, 75).map((credit) => (
                <div
                  key={`${credit.referredUserId}:${credit.creditedAt}`}
                  className="grid grid-cols-[1fr_1fr_0.55fr_0.75fr] gap-3 px-4 py-4 text-sm"
                >
                  <div>
                    <div className="font-semibold text-[var(--brand-ink)]">
                      {displayText(credit.referredName, credit.referredEmail)}
                    </div>
                    <div className="text-xs text-slate-500">{credit.referredEmail || credit.referredUserId}</div>
                  </div>
                  <div>
                    <div className="font-semibold text-[var(--brand-ink)]">
                      {displayText(credit.referrerName, credit.referrerEmail)}
                    </div>
                    <div className="text-xs text-slate-500">{credit.referralCode}</div>
                  </div>
                  <div>
                    <span className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-semibold",
                      credit.membershipStatus === "active"
                        ? "bg-teal-50 text-[var(--brand-teal)]"
                        : "bg-[var(--zcash-gold-soft)] text-[var(--zcash-gold-deep)]",
                    )}>
                      {credit.membershipStatus === "active" ? "Active" : "Signed up"}
                    </span>
                  </div>
                  <div className="text-xs text-slate-600">{formatDateTime(credit.creditedAt)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 text-sm text-slate-600">No referral credits yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
