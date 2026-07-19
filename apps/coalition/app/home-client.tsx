"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useAppSession } from "@/lib/use-app-session";
import {
  BadgeCheck,
  CheckCircle2,
  ExternalLink,
  Loader2,
  MessageCircle,
  Newspaper,
  Send,
  ShieldCheck,
  UserCheck,
  UsersRound,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { HomeShellSkeleton } from "@/components/home/Skeletons";
import {
  CoalitionHero,
  CoalitionPolicyPriorities,
  CoalitionWorkstreams,
} from "@/components/home/CoalitionHomeSections";
import {
  policyInterestGroupLabel,
  policyInterestGroupOptions,
  policyInterestGroupPath,
} from "@/lib/policy-interest-groups";

type MembershipStatus = {
  membershipStatus: "active" | "invited" | "none";
  membershipProvider: string | null;
  membershipVerifiedAt: string | null;
  manualApprovalStatus: "none" | "pending" | "approved" | string | null;
  manualApprovalRequestedAt: string | null;
  manualApprovalApprovedAt: string | null;
  applicationStatus: "none" | "requested" | "approved" | "declined" | "withdrawn";
  applicationRequestedAt: string | null;
  applicationApprovedAt: string | null;
  applicationDeclinedAt: string | null;
  applicationDeclineReason: string | null;
  applicationWithdrawnAt: string | null;
};

type DirectoryMember = {
  id: string;
  name: string;
  email: string;
  company: string | null;
  jobTitle: string | null;
  linkedinUrl: string | null;
  xHandle: string | null;
  policyInterestGroups: string[];
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
  const { data: session, status, update } = useAppSession();
  const searchParams = useSearchParams();
  const authenticated = status === "authenticated";
  const loading = status === "loading";
  const sessionUser = session?.user as any | undefined;
  const isMembershipRequestOnboarding = searchParams?.get("next") === "membership-request";
  const signupProfileId = searchParams?.get("signupProfileId") || "";

  const [membershipStatus, setMembershipStatus] = useState<MembershipStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [manualApprovalLoading, setManualApprovalLoading] = useState(false);
  const [invitationAccepting, setInvitationAccepting] = useState(false);
  const [directoryMembers, setDirectoryMembers] = useState<DirectoryMember[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directoryError, setDirectoryError] = useState<string | null>(null);
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
  const invitedFromSession = sessionUser?.membershipStatus === "invited";
  const invitedFromStatus = membershipStatus?.membershipStatus === "invited";
  const isMember = activeFromSession || activeFromStatus;
  const isInvited = !isMember && (invitedFromSession || invitedFromStatus);
  const selectedPolicyInterestGroups = Array.isArray(sessionUser?.policyInterestGroups)
    ? sessionUser.policyInterestGroups
    : [];
  const showOnboardingFirst = authenticated && !isMember;
  const verifiedAt =
    membershipStatus?.membershipVerifiedAt || sessionUser?.membershipVerifiedAt || null;
  const membershipProvider =
    membershipStatus?.membershipProvider || sessionUser?.membershipProvider || null;
  const manualApprovalStatus =
    membershipStatus?.manualApprovalStatus || sessionUser?.manualApprovalStatus || "none";
  const manualApprovalRequestedAt =
    membershipStatus?.manualApprovalRequestedAt || sessionUser?.manualApprovalRequestedAt || null;
  const applicationStatus =
    membershipStatus?.applicationStatus ||
    sessionUser?.applicationStatus ||
    (manualApprovalStatus === "pending" ? "requested" : manualApprovalStatus === "approved" ? "approved" : "none");
  const applicationRequestedAt =
    membershipStatus?.applicationRequestedAt ||
    sessionUser?.applicationRequestedAt ||
    manualApprovalRequestedAt;
  const manualApprovalPending = applicationStatus === "requested" && !isMember;
  const manuallyApproved =
    isMember && (membershipProvider === "manual" || manualApprovalStatus === "approved");
  const onboardingTitle = manualApprovalPending
    ? "Coalition access request submitted"
    : applicationStatus === "declined"
      ? "Coalition access request declined"
      : applicationStatus === "withdrawn"
        ? "Coalition access request withdrawn"
    : isInvited
      ? "Invitation pending"
      : isMembershipRequestOnboarding
        ? "Email confirmed"
        : "Request coalition access";
  const onboardingDescription = manualApprovalPending
    ? "A PGPZ admin will review your membership request. You will be able to sign back in here after approval."
    : applicationStatus === "declined"
      ? "Your prior request was reviewed and declined. You may submit a new request if your circumstances or coalition role have changed."
      : applicationStatus === "withdrawn"
        ? "You withdrew the prior request. You can submit a new one whenever you are ready."
    : isInvited
      ? "Accept the invitation below to activate coalition membership with your verified email."
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
    if (!isMember) {
      setDirectoryMembers([]);
      return;
    }

    const loadDirectory = async () => {
      setDirectoryLoading(true);
      setDirectoryError(null);
      try {
        const res = await fetch("/api/members/directory", { cache: "no-store" });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error || "Unable to load member directory");
        setDirectoryMembers(body?.members || []);
      } catch (err: any) {
        setDirectoryError(err?.message || "Unable to load member directory");
      } finally {
        setDirectoryLoading(false);
      }
    };

    void loadDirectory();
  }, [isMember]);

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

  const withdrawManualApproval = async () => {
    setManualApprovalLoading(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/manual-approval/request", { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Unable to withdraw coalition access request");
      setMessage("Coalition access request withdrawn.");
      await update({});
      await refreshStatus();
    } catch (err: any) {
      setError(err?.message || "Unable to withdraw coalition access request");
    } finally {
      setManualApprovalLoading(false);
    }
  };

  const acceptInvitation = async () => {
    setInvitationAccepting(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/invitations/accept", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Unable to accept coalition invitation");
      setMessage("Your PGPZ Coalition membership is now active.");
      await update({});
      await refreshStatus();
    } catch (err: any) {
      setError(err?.message || "Unable to accept coalition invitation");
    } finally {
      setInvitationAccepting(false);
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
      if (!res.ok) throw new Error(body?.error || "Unable to submit resource for review");
      setResourceTitle("");
      setResourceUrl("");
      setResourceDetails("");
      setResourceMessage("Resource added to the PGPZ moderation queue.");
    } catch (err: any) {
      setResourceError(err?.message || "Unable to submit resource for review");
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
        <CoalitionHero authenticated={authenticated} />
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
          <AlertTitle>Membership updated</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Membership issue</AlertTitle>
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
                    {isMember
                      ? `Welcome, ${displayName}.`
                      : isInvited
                        ? "Activate your coalition invitation"
                        : "Request coalition membership access"}
                  </h2>
                  <p className="max-w-2xl text-sm leading-6 text-slate-600">
                    {isMember
                      ? "Your PGPZ Coalition membership is active. Use this space to coordinate policy resources, messaging, and campaign work with trusted partners."
                      : isInvited
                        ? "Your verified email matches a coalition invitation. Accept it below to activate membership."
                        : "Coalition access is approved manually so participation stays limited to selected Zcash ecosystem partners working on crypto policy."}
                  </p>
                </div>
                <div className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${
                  isMember ? "bg-emerald-50 text-[var(--brand-teal)]" : "bg-[var(--zcash-gold-soft)] text-[var(--zcash-gold-deep)]"
                }`}>
                  {isMember ? <BadgeCheck className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                  {isMember ? "Active coalition member" : isInvited ? "Invited" : "Approval required"}
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
              ) : isInvited ? (
                <div className="mt-6 rounded-lg border border-[rgba(47,111,104,0.3)] bg-white/90 p-5 shadow-[0_16px_28px_-24px_rgba(16,40,39,0.32)]">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand-denim)]">
                        INVITATION
                      </div>
                      <h3 className="text-lg font-semibold text-[var(--brand-ink)]">
                        Accept your invitation
                      </h3>
                      <p className="max-w-2xl text-sm leading-6 text-slate-600">
                        You are signed in with the invited email address, so you can activate membership here.
                        No second email is required.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <Button
                        type="button"
                        size="lg"
                        className="bg-[var(--brand-teal)] text-white hover:bg-[var(--brand-ink)]"
                        disabled={invitationAccepting}
                        onClick={acceptInvitation}
                      >
                        {invitationAccepting
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <UserCheck className="h-4 w-4" />}
                        {invitationAccepting ? "Activating…" : "Accept invitation"}
                      </Button>
                      <Button type="button" size="lg" variant="outline" asChild>
                        <Link href="mailto:admin@pgpz.org?subject=PGPZ%20Coalition%20Invitation%20Help">
                          Contact admin
                        </Link>
                      </Button>
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
                      {manualApprovalPending && applicationRequestedAt ? (
                        <p className="text-xs font-medium text-[var(--brand-denim)]">
                          Requested {formatDate(applicationRequestedAt)}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
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
                      {manualApprovalPending ? (
                        <Button
                          type="button"
                          size="lg"
                          variant="outline"
                          disabled={manualApprovalLoading}
                          onClick={withdrawManualApproval}
                        >
                          Withdraw request
                        </Button>
                      ) : null}
                    </div>
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

          <CoalitionPolicyPriorities />

          <CoalitionWorkstreams />

          {isMember ? (
            <section className="rounded-lg border bg-white/90 p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="section-eyebrow text-[var(--brand-denim)]">POLICY GROUPS</p>
                  <h2 className="mt-2 text-2xl font-semibold text-[var(--brand-ink)]">Topic areas</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                    Select member groups and open topic pages for focused coordination.
                  </p>
                </div>
                <Button asChild>
                  <Link href="/groups">Manage groups</Link>
                </Button>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {policyInterestGroupOptions.map((group) => {
                  const selected = selectedPolicyInterestGroups.includes(group.id);
                  return (
                    <Link
                      key={group.id}
                      href={policyInterestGroupPath(group.id)}
                      className="rounded-lg border bg-white p-4 transition hover:border-[rgba(245,168,0,0.55)] hover:shadow-[0_18px_34px_-28px_rgba(30,30,30,0.4)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-sm font-semibold text-[var(--brand-ink)]">{group.label}</h3>
                        {selected ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-emerald-800">
                            Selected
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{group.description}</p>
                    </Link>
                  );
                })}
              </div>
            </section>
          ) : null}

          {isMember ? (
            <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
              <article className="glass-item p-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--brand-ink)] text-[var(--zcash-gold)]">
                    <MessageCircle className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="section-eyebrow text-[var(--brand-denim)]">SIGNAL GROUP</p>
                    <h2 className="mt-3 text-xl font-semibold text-[var(--brand-ink)]">
                      Join the members-only Signal group
                    </h2>
                    <p className="mt-3 text-sm leading-6 text-slate-600">
                      Scan the QR code from your phone or open the secure Signal link to join the coalition member channel.
                    </p>
                    <div className="mt-5 flex flex-wrap gap-3">
                      <Button asChild>
                        <Link
                          href="https://signal.group/#CjQKIK5Li1s23K9yp5UbvHeyzVXAs-1WpSFKxyLslxXIqOJCEhCbzgPjjoDLC3hsdoeeDxPX"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Open Signal link
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="mt-6 inline-block rounded-2xl border border-[rgba(245,168,0,0.34)] bg-white p-3 shadow-[0_18px_36px_-28px_rgba(16,40,39,0.48)]">
                  <Image
                    src="/coalition-signal-qr.png"
                    alt="QR code to join the PGPZ Coalition Signal group"
                    width={192}
                    height={192}
                    className="h-48 w-48 rounded-xl"
                  />
                </div>
              </article>

              <article className="glass-item p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="section-eyebrow text-[var(--brand-denim)]">MEMBER DIRECTORY</p>
                    <h2 className="mt-3 text-xl font-semibold text-[var(--brand-ink)]">
                      Active member contacts
                    </h2>
                    <p className="mt-3 text-sm leading-6 text-slate-600">
                      Members shown here have opted into sharing contact details with other active coalition members.
                    </p>
                  </div>
                  <UsersRound className="h-6 w-6 shrink-0 text-[var(--brand-denim)]" aria-hidden="true" />
                </div>
                <div className="mt-5 space-y-3">
                  {directoryLoading ? (
                    <div className="rounded-lg border bg-white/80 p-4 text-sm text-slate-600">Loading members...</div>
                  ) : directoryError ? (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{directoryError}</div>
                  ) : directoryMembers.length ? (
                    directoryMembers.slice(0, 6).map((member) => (
                      <details key={member.id} className="rounded-lg border bg-white/85 p-4">
                        <summary className="cursor-pointer list-none text-sm font-semibold text-[var(--brand-ink)]">
                          <span>{member.name}</span>
                          {member.company ? <span className="ml-2 font-normal text-slate-500">- {member.company}</span> : null}
                        </summary>
                        <div className="mt-3 grid gap-2 text-sm leading-6 text-slate-600 sm:grid-cols-2">
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Title</div>
                            <div>{member.jobTitle || "—"}</div>
                          </div>
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Email</div>
                            <a className="text-[var(--brand-denim)] underline" href={`mailto:${member.email}`}>{member.email}</a>
                          </div>
                          {member.linkedinUrl ? (
                            <div>
                              <Link className="text-[var(--brand-denim)] underline" href={member.linkedinUrl} target="_blank" rel="noopener noreferrer">
                                LinkedIn profile
                              </Link>
                            </div>
                          ) : null}
                          {member.xHandle ? (
                            <div>
                              <Link
                                className="text-[var(--brand-denim)] underline"
                                href={`https://x.com/${member.xHandle.replace(/^@/, "")}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {member.xHandle} on X
                              </Link>
                            </div>
                          ) : null}
                          {member.policyInterestGroups?.length ? (
                            <div className="sm:col-span-2">
                              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Interests</div>
                              <div className="mt-1 flex flex-wrap gap-1.5">
                                {member.policyInterestGroups.map((groupId) => (
                                  <span
                                    key={groupId}
                                    className="rounded-full border border-[rgba(47,111,104,0.22)] bg-white px-2 py-0.5 text-xs font-semibold text-[var(--brand-denim)]"
                                  >
                                    {policyInterestGroupLabel(groupId)}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </details>
                    ))
                  ) : (
                    <div className="rounded-lg border bg-white/80 p-4 text-sm text-slate-600">
                      No active members have opted into the directory yet.
                    </div>
                  )}
                </div>
                <Button variant="outline" asChild className="mt-5">
                  <Link href="/members">Search full directory</Link>
                </Button>
              </article>
            </section>
          ) : null}

          <section className="grid gap-5 lg:grid-cols-2">
            <article className="glass-item p-6">
              <p className="section-eyebrow text-[var(--brand-denim)]">MEMBER UPDATES</p>
              <h2 className="mt-3 text-xl font-semibold text-[var(--brand-ink)]">Policy memos and special updates</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Browse recurring weekly memos and featured reports prepared for active coalition members.
              </p>
              <div className="mt-5">
                <Button variant="outline" asChild>
                  <Link href="/updates">
                    View updates
                    <Newspaper className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
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
                      Submit for review
                    </Button>
                    <Button variant="outline" asChild>
                      <Link href="/resources">Browse approved resources</Link>
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
