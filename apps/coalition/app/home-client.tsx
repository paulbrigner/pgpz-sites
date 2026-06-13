"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  BadgeCheck,
  CheckCircle2,
  Code2,
  ExternalLink,
  FileText,
  Globe2,
  Landmark,
  Loader2,
  Mail,
  Megaphone,
  Scale,
  Send,
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

const policyPriorities = [
  {
    number: "01",
    icon: Landmark,
    title: "Primary policy contact",
    body: "Establish PGPZ as the clear home for policymakers, regulators, and industry stakeholders seeking to learn about Zcash.",
  },
  {
    number: "02",
    icon: Globe2,
    title: "Global advocacy",
    body: "Coordinate through one vehicle so ecosystem partners can move beyond scattershot outreach and speak with one voice.",
  },
  {
    number: "03",
    icon: Scale,
    title: "Civil liberties",
    body: "Advance the case for privacy-preserving infrastructure as blockchain adoption expands into mainstream systems.",
  },
  {
    number: "04",
    icon: ShieldCheck,
    title: "Policy response",
    body: "Promote Zcash ecosystem growth while responding to policy that could inhibit privacy-preserving networks.",
  },
  {
    number: "05",
    icon: Code2,
    title: "Protect developers",
    body: "Defend clear safe harbors, due process, and limits on enforcement for builders of non-custodial privacy software.",
  },
];

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
  const [resourceTitle, setResourceTitle] = useState("");
  const [resourceUrl, setResourceUrl] = useState("");
  const [resourceDetails, setResourceDetails] = useState("");
  const [resourceSubmitting, setResourceSubmitting] = useState(false);
  const [resourceMessage, setResourceMessage] = useState<string | null>(null);
  const [resourceError, setResourceError] = useState<string | null>(null);
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

  const submitResource = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setResourceSubmitting(true);
    setResourceMessage(null);
    setResourceError(null);
    try {
      const res = await fetch("/api/resources/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: resourceTitle,
          url: resourceUrl,
          details: resourceDetails,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Unable to send resource submission");
      setResourceTitle("");
      setResourceUrl("");
      setResourceDetails("");
      setResourceMessage("Resource submitted to the PGPZ team.");
    } catch (err: any) {
      setResourceError(err?.message || "Unable to send resource submission");
    } finally {
      setResourceSubmitting(false);
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
                Join us in sharing resources, aligning messaging, and organizing coalition campaigns that help advance Zcash-focused policy in Washington, DC.
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
                  The PGPZ Coalition is an exclusive partner workspace for organizations and policy professionals helping shape the public policy environment around Zcash.
                </p>
                <ul className="list-disc space-y-2 pl-5">
                  <li>Shared resource libraries for policymaker education</li>
                  <li>Aligned messaging focused on promoting Zcash and financial privacy</li>
                  <li>Policy campaign planning and execution</li>
                  <li>Coordination across trusted ecosystem partners</li>
                  <li>Coverage of meetings, briefings, and advocacy events</li>
                </ul>
                <p>
                  The workspace is intentionally smaller than the broader public PGPZ site so coalition members can move quickly with shared context.
                </p>
              </div>
            </aside>
          </section>

          <section className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="section-eyebrow text-[var(--brand-denim)]">POLICY PRIORITIES</p>
                <h2 className="mt-2 text-2xl font-semibold text-[var(--brand-ink)]">Five priorities guiding coalition work</h2>
              </div>
              <p className="max-w-2xl text-sm leading-6 text-slate-600">
                Adapted from PGPZ.org, these priorities connect public education, advocacy, civil liberties, policy response, and developer protection.
              </p>
            </div>
            <div className="overflow-hidden rounded-xl border border-[rgba(245,168,0,0.24)] bg-[linear-gradient(135deg,var(--brand-ink),#163E3C_58%,#2F6F68)] p-5 text-white shadow-[0_26px_48px_-32px_rgba(16,40,39,0.56)] md:p-6">
              <div className="grid gap-4 lg:grid-cols-[1fr_14rem_1fr] lg:items-center">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                  {policyPriorities.slice(0, 2).map((priority) => {
                    const Icon = priority.icon;
                    return (
                      <article key={priority.number} className="rounded-lg border border-white/14 bg-white/9 p-4 shadow-[0_18px_32px_-28px_rgba(0,0,0,0.5)] backdrop-blur">
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--zcash-gold)] text-xs font-bold text-[var(--brand-ink)]">
                            {priority.number}
                          </span>
                          <Icon className="h-5 w-5 shrink-0 text-[var(--zcash-gold-soft)]" aria-hidden="true" />
                          <h3 className="text-sm font-semibold text-white">{priority.title}</h3>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-white/72">{priority.body}</p>
                      </article>
                    );
                  })}
                </div>

                <div className="relative flex min-h-48 items-center justify-center py-4">
                  <div className="absolute h-48 w-48 rounded-full border border-white/12" aria-hidden="true" />
                  <div className="absolute h-36 w-36 rounded-full border border-[rgba(245,168,0,0.32)]" aria-hidden="true" />
                  <div className="relative flex h-28 w-28 flex-col items-center justify-center rounded-full border border-[rgba(245,168,0,0.64)] bg-[rgba(255,255,255,0.12)] text-center shadow-[0_20px_34px_-24px_rgba(0,0,0,0.58)]">
                    <span className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--zcash-gold-soft)]">PGPZ</span>
                    <span className="mt-1 text-sm font-semibold leading-5 text-white">Policy engine</span>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                  {policyPriorities.slice(2, 4).map((priority) => {
                    const Icon = priority.icon;
                    return (
                      <article key={priority.number} className="rounded-lg border border-white/14 bg-white/9 p-4 shadow-[0_18px_32px_-28px_rgba(0,0,0,0.5)] backdrop-blur">
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--zcash-gold)] text-xs font-bold text-[var(--brand-ink)]">
                            {priority.number}
                          </span>
                          <Icon className="h-5 w-5 shrink-0 text-[var(--zcash-gold-soft)]" aria-hidden="true" />
                          <h3 className="text-sm font-semibold text-white">{priority.title}</h3>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-white/72">{priority.body}</p>
                      </article>
                    );
                  })}
                </div>
              </div>

              {policyPriorities.slice(4).map((priority) => {
                const Icon = priority.icon;
                return (
                  <article key={priority.number} className="mt-4 rounded-lg border border-[rgba(245,168,0,0.32)] bg-[rgba(245,168,0,0.1)] p-4 lg:mx-auto lg:max-w-3xl">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                      <div className="flex items-center gap-3 sm:min-w-52">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--zcash-gold)] text-xs font-bold text-[var(--brand-ink)]">
                          {priority.number}
                        </span>
                        <Icon className="h-5 w-5 shrink-0 text-[var(--zcash-gold-soft)]" aria-hidden="true" />
                        <h3 className="text-sm font-semibold text-white">{priority.title}</h3>
                      </div>
                      <p className="text-sm leading-6 text-white/76">{priority.body}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-[var(--brand-ink)]">Coalition workstreams</h2>
            <div className="grid gap-4 lg:grid-cols-3">
              {[
                {
                  icon: FileText,
                  eyebrow: "RESOURCE LIBRARY",
                  title: "Access policy materials",
                  body: "View explainers, backgrounders, meeting notes, and partner-approved materials that help policymakers understand Zcash and the importance of financial privacy.",
                },
                {
                  icon: Megaphone,
                  eyebrow: "MESSAGING",
                  title: "Contribute and refer to key messaging",
                  body: "Sync up on messaging and talking points before key hearings, markups, sign-on letters, agency engagement, and public education events.",
                },
                {
                  icon: ShieldCheck,
                  eyebrow: "CAMPAIGNS",
                  title: "Engage in targeted policy work",
                  body: "Support coalition policy campaigns, see action items and follow-ups, and keep ecosystem partners moving from shared strategy to action in Washington.",
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
                Have a resource, Hill meeting insight, partner update, or campaign idea that could help advance Zcash policy? Share it with the PGPZ team from this workspace.
              </p>
              {isMember ? (
                <form className="mt-5 space-y-4" onSubmit={submitResource}>
                  {resourceMessage ? (
                    <Alert className="bg-emerald-50 text-[var(--brand-teal)]">
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      <AlertTitle>Submitted</AlertTitle>
                      <AlertDescription>{resourceMessage}</AlertDescription>
                    </Alert>
                  ) : null}
                  {resourceError ? (
                    <Alert variant="destructive">
                      <AlertTitle>Submission issue</AlertTitle>
                      <AlertDescription>{resourceError}</AlertDescription>
                    </Alert>
                  ) : null}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1.5 text-sm font-medium text-[var(--brand-ink)]">
                      Resource title
                      <input
                        required
                        maxLength={140}
                        value={resourceTitle}
                        onChange={(event) => setResourceTitle(event.target.value)}
                        className="h-10 w-full rounded-md border border-[rgba(245,168,0,0.28)] bg-white px-3 text-sm text-[var(--brand-ink)] outline-none transition focus:border-[var(--brand-denim)] focus:ring-2 focus:ring-[rgba(47,111,104,0.18)]"
                        placeholder="Policy explainer, meeting note, campaign idea"
                      />
                    </label>
                    <label className="space-y-1.5 text-sm font-medium text-[var(--brand-ink)]">
                      Link
                      <input
                        type="url"
                        maxLength={300}
                        value={resourceUrl}
                        onChange={(event) => setResourceUrl(event.target.value)}
                        className="h-10 w-full rounded-md border border-[rgba(245,168,0,0.28)] bg-white px-3 text-sm text-[var(--brand-ink)] outline-none transition focus:border-[var(--brand-denim)] focus:ring-2 focus:ring-[rgba(47,111,104,0.18)]"
                        placeholder="https://"
                      />
                    </label>
                  </div>
                  <label className="space-y-1.5 text-sm font-medium text-[var(--brand-ink)]">
                    Notes for the PGPZ team
                    <textarea
                      required
                      maxLength={4000}
                      rows={5}
                      value={resourceDetails}
                      onChange={(event) => setResourceDetails(event.target.value)}
                      className="w-full resize-y rounded-md border border-[rgba(245,168,0,0.28)] bg-white px-3 py-2 text-sm leading-6 text-[var(--brand-ink)] outline-none transition focus:border-[var(--brand-denim)] focus:ring-2 focus:ring-[rgba(47,111,104,0.18)]"
                      placeholder="Share context, urgency, suggested use, or who should follow up."
                    />
                  </label>
                  <div className="flex flex-wrap gap-3">
                    <Button type="submit" isLoading={resourceSubmitting} disabled={resourceSubmitting}>
                      <Send className="h-4 w-4" aria-hidden="true" />
                      Send to PGPZ team
                    </Button>
                    <Button variant="outline" asChild>
                      <Link href="https://pgpz.org" target="_blank" rel="noopener noreferrer">
                        Visit PGPZ.org
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="mt-5 rounded-lg border border-[rgba(245,168,0,0.3)] bg-white/80 p-4 text-sm leading-6 text-slate-600">
                  Resource submissions are available after coalition access is approved.
                </div>
              )}
            </article>
          </section>
        </>
      )}
    </div>
  );
}
