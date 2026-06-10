"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  BadgeCheck,
  CheckCircle2,
  ExternalLink,
  FileText,
  Loader2,
  Mail,
  Megaphone,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { HomeShellSkeleton } from "@/components/home/Skeletons";

type MembershipStatus = {
  membershipStatus: "active" | "none";
  membershipProvider: string | null;
  membershipVerifiedAt: string | null;
  manualApprovalStatus: "none" | "pending" | "approved" | string | null;
  manualApprovalRequestedAt: string | null;
  manualApprovalApprovedAt: string | null;
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return "Not yet approved";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Not yet approved";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export default function HomeClient() {
  const { data: session, status, update } = useSession();
  const searchParams = useSearchParams();
  const authenticated = status === "authenticated";
  const loading = status === "loading";
  const sessionUser = session?.user as any | undefined;
  const isMembershipRequestOnboarding = searchParams?.get("next") === "membership-request";
  const signupProfileId = searchParams?.get("signupProfileId") || "";

  const [membershipStatus, setMembershipStatus] = useState<MembershipStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [manualApprovalLoading, setManualApprovalLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pendingProfileApplied = useRef(false);

  const displayName = useMemo(() => {
    const first = sessionUser?.firstName;
    if (first) return first;
    if (sessionUser?.name) return String(sessionUser.name).split(/\s+/)[0];
    if (sessionUser?.email) return String(sessionUser.email).split("@")[0];
    return "there";
  }, [sessionUser]);

  const activeFromSession = sessionUser?.membershipStatus === "active";
  const activeFromStatus = membershipStatus?.membershipStatus === "active";
  const isMember = activeFromSession || activeFromStatus;
  const showOnboardingFirst = authenticated && !isMember;
  const verifiedAt =
    membershipStatus?.membershipVerifiedAt || sessionUser?.membershipVerifiedAt || null;
  const membershipProvider =
    membershipStatus?.membershipProvider || sessionUser?.membershipProvider || null;
  const manualApprovalStatus =
    membershipStatus?.manualApprovalStatus || sessionUser?.manualApprovalStatus || "none";
  const manualApprovalRequestedAt =
    membershipStatus?.manualApprovalRequestedAt || sessionUser?.manualApprovalRequestedAt || null;
  const manualApprovalPending = manualApprovalStatus === "pending" && !isMember;
  const manuallyApproved =
    isMember && (membershipProvider === "manual" || manualApprovalStatus === "approved");
  const onboardingTitle = manualApprovalPending
    ? "Coalition access request submitted"
    : isMembershipRequestOnboarding
      ? "Email confirmed"
      : "Request coalition access";
  const onboardingDescription = manualApprovalPending
    ? "A PGPZ admin will review your membership request. You will be able to sign back in here after approval."
    : "This coalition is reviewed manually so partner access stays focused, trusted, and useful.";

  const refreshStatus = useCallback(async () => {
    if (!authenticated) return;
    try {
      setStatusError(null);
      const res = await fetch("/api/membership/status", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Unable to load membership status");
      }
      setMembershipStatus(await res.json());
    } catch (err: any) {
      setStatusError(err?.message || "Unable to load membership status");
    }
  }, [authenticated]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (!authenticated || pendingProfileApplied.current) return;
    pendingProfileApplied.current = true;

    const applyPendingProfile = async () => {
      let applied = false;
      if (signupProfileId) {
        try {
          const res = await fetch("/api/signup/pending", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ signupProfileId }),
          });
          const body = await res.json().catch(() => ({}));
          if (res.ok && body?.applied) {
            applied = true;
            await update({});
          }
        } catch {
          pendingProfileApplied.current = false;
          return;
        }
      }

      let pending: any = null;
      try {
        const raw = localStorage.getItem("pendingProfile");
        pending = raw ? JSON.parse(raw) : null;
      } catch {
        pending = null;
      }
      if (!pending?.firstName || !pending?.lastName) {
        if (applied && signupProfileId) {
          const url = new URL(window.location.href);
          url.searchParams.delete("signupProfileId");
          window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
        }
        return;
      }

      try {
        const res = await fetch("/api/profile/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pending),
        });
        if (res.ok) {
          localStorage.removeItem("pendingProfile");
          await update({});
          applied = true;
        }
      } catch {
        pendingProfileApplied.current = false;
        return;
      }

      if (applied && signupProfileId) {
        const url = new URL(window.location.href);
        url.searchParams.delete("signupProfileId");
        window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
      }
    };

    void applyPendingProfile();
  }, [authenticated, signupProfileId, update]);

  const requestManualApproval = async () => {
    setManualApprovalLoading(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/manual-approval/request", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Unable to request coalition approval");
      setMessage("Coalition access request submitted. A PGPZ admin will review your membership request.");
      await update({});
      await refreshStatus();
    } catch (err: any) {
      setError(err?.message || "Unable to request coalition approval");
    } finally {
      setManualApprovalLoading(false);
    }
  };

  if (loading) {
    return <HomeShellSkeleton />;
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5">
      {!showOnboardingFirst ? (
        <section className="coalition-hero">
          <div className="coalition-hero__frame">
            <div className="coalition-hero__content max-w-3xl space-y-5">
              <div className="flex flex-wrap items-center gap-3">
                <p className="section-eyebrow text-white/70">PGPZ COALITION</p>
                {authenticated ? (
                  <span className="rounded-full border border-[rgba(245,168,0,0.45)] bg-[rgba(245,168,0,0.14)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--zcash-gold-soft)]">
                    Partner workspace
                  </span>
                ) : null}
              </div>
              <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
                A policy coordination home for Zcash ecosystem partners.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-white/78">
                Share resources, align messaging, and organize coalition campaigns that help advance Zcash policy in Washington, DC.
              </p>
              {!authenticated ? (
                <div className="flex flex-wrap gap-3">
                  <Button
                    size="lg"
                    className="bg-[var(--zcash-gold)] text-[var(--brand-ink)] hover:bg-[var(--zcash-gold-soft)]"
                    asChild
                  >
                    <Link href="/signin?reason=signup">
                      <Mail className="h-4 w-4" aria-hidden="true" />
                      Request access
                    </Link>
                  </Button>
                  <Button size="lg" variant="outline" className="border-white/40 text-white hover:bg-white/10" asChild>
                    <Link href="https://pgpz.org" target="_blank" rel="noopener noreferrer">
                      Visit PGPZ
                      <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {showOnboardingFirst ? (
        <Alert>
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>{onboardingTitle}</AlertTitle>
          <AlertDescription>{onboardingDescription}</AlertDescription>
        </Alert>
      ) : null}

      {statusError ? (
        <Alert variant="destructive">
          <AlertTitle>Status unavailable</AlertTitle>
          <AlertDescription>{statusError}</AlertDescription>
        </Alert>
      ) : null}

      {message ? (
        <Alert>
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Request received</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Approval request issue</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {!authenticated ? (
        <section className="grid gap-4 md:grid-cols-3">
          {[
            ["1", "Request partner access", "Create a profile with the email you use for Zcash ecosystem policy work."],
            ["2", "Manual review", "A PGPZ admin reviews coalition fit so the workspace remains focused and trusted."],
            ["3", "Coordinate campaigns", "Approved members can return to share resources, messaging, and campaign materials."],
          ].map(([step, title, body]) => (
            <div key={step} className="muted-card p-5">
              <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-full bg-[var(--brand-ink)] text-sm font-semibold text-[var(--zcash-gold)]">
                {step}
              </div>
              <h2 className="text-lg font-semibold text-[var(--brand-ink)]">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
            </div>
          ))}
        </section>
      ) : (
        <>
          <section className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
            <div className="glass-surface p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <p className="section-eyebrow text-[var(--brand-denim)]">MEMBERSHIP</p>
                  <h2 className="text-2xl font-semibold text-[var(--brand-ink)]">
                    {isMember ? `Welcome, ${displayName}.` : "Request coalition membership access"}
                  </h2>
                  <p className="max-w-2xl text-sm leading-6 text-slate-600">
                    {isMember
                      ? "Your PGPZ Coalition membership is active. Use this space to coordinate policy resources, messaging, and campaign work with trusted partners."
                      : "Coalition access is approved manually so participation stays limited to selected Zcash ecosystem partners working on crypto policy."}
                  </p>
                </div>
                <div className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${
                  isMember ? "bg-emerald-50 text-[var(--brand-teal)]" : "bg-[var(--zcash-gold-soft)] text-[var(--zcash-gold-deep)]"
                }`}>
                  {isMember ? <BadgeCheck className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                  {isMember ? "Active coalition member" : "Approval required"}
                </div>
              </div>

              {isMember ? (
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border bg-white/75 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">APPROVAL METHOD</div>
                    <div className="mt-2 text-lg font-semibold text-[var(--brand-ink)]">
                      {manuallyApproved ? "Manual approval" : "Approved account"}
                    </div>
                  </div>
                  <div className="rounded-lg border bg-white/75 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">APPROVED AT</div>
                    <div className="mt-2 text-sm font-medium text-[var(--brand-ink)]">{formatDate(verifiedAt)}</div>
                  </div>
                  <div className="rounded-lg border bg-white/75 p-4 sm:col-span-2">
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">ACCESS RECORD</div>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-600">
                      Manual approval by a PGPZ admin.
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-6 rounded-lg border border-[rgba(245,168,0,0.58)] bg-white/90 p-5 shadow-[0_16px_28px_-24px_rgba(30,30,30,0.32)]">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand-denim)]">
                        MANUAL REVIEW
                      </div>
                      <h3 className="text-lg font-semibold text-[var(--brand-ink)]">
                        Submit a coalition access request
                      </h3>
                      <p className="max-w-2xl text-sm leading-6 text-slate-600">
                        This begins the manual membership process. A PGPZ admin will review your partner profile and approve access if the coalition workspace is the right fit.
                      </p>
                      {manualApprovalPending && manualApprovalRequestedAt ? (
                        <p className="text-xs font-medium text-[var(--brand-denim)]">
                          Requested {formatDate(manualApprovalRequestedAt)}
                        </p>
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      size="lg"
                      className="border border-[rgba(138,90,0,0.28)] bg-[var(--zcash-gold)] text-[var(--brand-ink)] shadow-sm hover:bg-[var(--zcash-gold-soft)]"
                      disabled={manualApprovalLoading || manualApprovalPending}
                      onClick={requestManualApproval}
                    >
                      {manualApprovalLoading
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <UserCheck className="h-4 w-4" />}
                      {manualApprovalPending ? "Request pending" : "Request coalition approval"}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <aside className="muted-card p-6">
              <p className="section-eyebrow text-[var(--brand-denim)]">COALITION</p>
              <h2 className="mt-2 text-xl font-semibold text-[var(--brand-ink)]">What this space is for</h2>
              <div className="mt-4 space-y-4 text-sm leading-6 text-slate-600">
                <p>
                  The PGPZ Coalition is a selective partner workspace for organizations and policy professionals helping shape the public policy environment around Zcash.
                </p>
                <ul className="list-disc space-y-2 pl-5">
                  <li>Shared resource libraries for policymaker education</li>
                  <li>Aligned messaging for Zcash and privacy-preserving digital cash</li>
                  <li>Coalition planning for Washington, DC policy campaigns</li>
                  <li>Trusted coordination across ecosystem partners</li>
                  <li>Action notes for meetings, briefings, and advocacy moments</li>
                </ul>
                <p>
                  The workspace is intentionally smaller than the broader public PGPZ site so coalition members can move quickly with shared context.
                </p>
              </div>
            </aside>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-[var(--brand-ink)]">Coalition workstreams</h2>
            <div className="grid gap-4 lg:grid-cols-3">
              {[
                {
                  icon: FileText,
                  eyebrow: "RESOURCE LIBRARY",
                  title: "Keep policy materials ready",
                  body: "Collect explainers, backgrounders, meeting notes, and partner-approved materials that help policymakers understand Zcash and financial privacy.",
                },
                {
                  icon: Megaphone,
                  eyebrow: "MESSAGING",
                  title: "Coordinate what partners say",
                  body: "Align coalition language before key hearings, markups, sign-on letters, agency engagement, and public education moments.",
                },
                {
                  icon: ShieldCheck,
                  eyebrow: "CAMPAIGNS",
                  title: "Organize targeted policy work",
                  body: "Plan coalition policy campaigns, assign follow-ups, and keep ecosystem partners moving from shared strategy to Washington action.",
                },
              ].map((workstream) => {
                const Icon = workstream.icon;
                return (
                  <article key={workstream.eyebrow} className="muted-card flex flex-col p-5">
                    <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(245,168,0,0.16)] text-[var(--brand-denim)]">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <p className="section-eyebrow text-[var(--brand-denim)]">{workstream.eyebrow}</p>
                    <h3 className="mt-3 text-lg font-semibold text-[var(--brand-ink)]">{workstream.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-slate-600">{workstream.body}</p>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <article className="glass-item p-6">
              <p className="section-eyebrow text-[var(--brand-denim)]">COMING NEXT</p>
              <h2 className="mt-3 text-xl font-semibold text-[var(--brand-ink)]">Building the partner workspace</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Future versions of the PGPZ Coalition site will add richer member profiles, resource collections, campaign planning pages, and member-only policy updates.
              </p>
            </article>

            <article className="glass-item p-6">
              <p className="section-eyebrow text-[var(--brand-denim)]">GET INVOLVED</p>
              <h2 className="mt-3 text-xl font-semibold text-[var(--brand-ink)]">Bring useful policy context</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Have a resource, Hill meeting insight, partner update, or campaign idea that could help advance Zcash policy? Share it with the PGPZ team as this coalition space comes online.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button asChild>
                  <Link href="mailto:admin@pgpz.org?subject=PGPZ%20Coalition%20Resource">
                    Share a resource
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="https://pgpz.org" target="_blank" rel="noopener noreferrer">
                    Visit PGPZ.org
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </article>
          </section>
        </>
      )}
    </div>
  );
}
