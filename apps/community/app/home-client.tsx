"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BadgeCheck, CheckCircle2, Clipboard, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { HomeShellSkeleton } from "@/components/home/Skeletons";
import {
  CommunityClosingCards,
  CommunityHero,
  CommunityMemberResources,
  CommunityPillars,
  type CommunityHeroFeature,
  type CommunityMemberResource,
} from "@/components/home/CommunityHomeSections";
import { REFERRAL_QUERY_PARAM, normalizeReferralCode } from "@/lib/referral-code";
import { useAppSession } from "@/lib/use-app-session";

type ProofStatus = {
  membershipStatus: "active" | "none";
  membershipProvider: string | null;
  membershipVerifiedAt: string | null;
  membershipProofPostUrl: string | null;
  membershipProofPostId: string | null;
  membershipProofHandle: string | null;
  xHandle: string | null;
  proofRetentionPolicy: string | null;
  manualApprovalStatus: "none" | "pending" | "approved" | string | null;
  manualApprovalRequestedAt: string | null;
  manualApprovalApprovedAt: string | null;
};

type XChallenge = {
  challengeId: string;
  challenge: string;
  expiresAt: string;
  suggestedPost: string;
};

type FeaturedPolicyUpdate = {
  slug: string;
  categoryLabel: string;
  title: string;
  shortTitle: string;
  summary: string;
  emailPreheader: string;
  coverImage: string;
  portalPath: string;
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return "Not yet verified";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Not yet verified";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const buildIntentUrl = (text: string) =>
  `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`;

export default function HomeClient({
  featuredPolicyUpdates,
}: {
  featuredPolicyUpdates: FeaturedPolicyUpdate[];
}) {
  const { data: session, status, update } = useAppSession();
  const searchParams = useSearchParams();
  const previewMember =
    process.env.NODE_ENV === "development" && searchParams?.get("preview") === "member";
  const authenticated = previewMember || status === "authenticated";
  const loading = !previewMember && status === "loading";
  const sessionUser = useMemo(
    () => previewMember
      ? {
        firstName: "Preview",
        membershipStatus: "active",
        membershipProvider: "manual",
        membershipVerifiedAt: "2026-06-13T12:00:00.000Z",
        manualApprovalStatus: "approved",
      }
      : session?.user as any | undefined,
    [previewMember, session?.user],
  );
  const isSocialProofOnboarding = searchParams?.get("next") === "social-proof";
  const signupProfileId = searchParams?.get("signupProfileId") || "";
  const referralCode = normalizeReferralCode(searchParams?.get(REFERRAL_QUERY_PARAM));
  const signupHref = referralCode
    ? `/signin?reason=signup&${REFERRAL_QUERY_PARAM}=${encodeURIComponent(referralCode)}`
    : "/signin?reason=signup";
  const memberResources = useMemo<CommunityMemberResource[]>(
    () => featuredPolicyUpdates.map((update) => ({
      href: update.portalPath,
      label: update.shortTitle,
      detail: update.summary,
      category: update.categoryLabel,
    })),
    [featuredPolicyUpdates],
  );
  const heroFeatureSlides = useMemo<CommunityHeroFeature[]>(
    () => featuredPolicyUpdates.map((update) => ({
      eyebrow: update.categoryLabel,
      title: update.shortTitle,
      body: update.emailPreheader,
      href: update.portalPath,
      caption: update.title,
      imageSrc: update.coverImage,
      imageAlt: `${update.shortTitle} cover`,
      imageFit: "contain",
    })),
    [featuredPolicyUpdates],
  );

  const [proofStatus, setProofStatus] = useState<ProofStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<XChallenge | null>(null);
  const [challengeLoading, setChallengeLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [findLoading, setFindLoading] = useState(false);
  const [manualApprovalLoading, setManualApprovalLoading] = useState(false);
  const [postUrl, setPostUrl] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [heroFeatureIndex, setHeroFeatureIndex] = useState(0);
  const pendingProfileApplied = useRef(false);

  const displayName = useMemo(() => {
    const first = sessionUser?.firstName;
    if (first) return first;
    if (sessionUser?.name) return String(sessionUser.name).split(/\s+/)[0];
    if (sessionUser?.email) return String(sessionUser.email).split("@")[0];
    return "there";
  }, [sessionUser]);

  const activeFromSession = sessionUser?.membershipStatus === "active";
  const activeFromStatus = proofStatus?.membershipStatus === "active";
  const isMember = activeFromSession || activeFromStatus;
  const showOnboardingFirst = authenticated && !isMember;
  const verifiedAt =
    proofStatus?.membershipVerifiedAt || sessionUser?.membershipVerifiedAt || null;
  const membershipProvider =
    proofStatus?.membershipProvider || sessionUser?.membershipProvider || null;
  const proofUrl =
    proofStatus?.membershipProofPostUrl || sessionUser?.membershipProofPostUrl || null;
  const verifiedXHandle =
    proofStatus?.membershipProofHandle || sessionUser?.membershipProofHandle || null;
  const manualApprovalStatus =
    proofStatus?.manualApprovalStatus || sessionUser?.manualApprovalStatus || "none";
  const manualApprovalRequestedAt =
    proofStatus?.manualApprovalRequestedAt || sessionUser?.manualApprovalRequestedAt || null;
  const manualApprovalPending = manualApprovalStatus === "pending" && !isMember;
  const manuallyApproved =
    isMember && (membershipProvider === "manual" || manualApprovalStatus === "approved");
  const onboardingTitle = manualApprovalPending
    ? "Manual approval requested"
    : isSocialProofOnboarding
      ? "Email confirmed"
      : "Finish membership setup";
  const onboardingDescription = manualApprovalPending
    ? "An admin will review your membership request. You can also complete member verification with X at any time."
    : "Post the verification text on X, then return here so the site can find the post or you can paste its link.";

  const refreshStatus = useCallback(async () => {
    if (!authenticated || previewMember) return;
    try {
      setStatusError(null);
      const res = await fetch("/api/social-proof/status", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Unable to load member verification status");
      }
      setProofStatus(await res.json());
    } catch (err: any) {
      setStatusError(err?.message || "Unable to load member verification status");
    }
  }, [authenticated, previewMember]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (heroFeatureSlides.length < 2) return;
    const interval = window.setInterval(() => {
      setHeroFeatureIndex((current) => (current + 1) % heroFeatureSlides.length);
    }, 5500);

    return () => window.clearInterval(interval);
  }, [heroFeatureSlides.length]);

  useEffect(() => {
    if (previewMember || !authenticated || pendingProfileApplied.current) return;
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
  }, [authenticated, previewMember, signupProfileId, update]);

  const generateChallenge = async () => {
    setChallengeLoading(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/social-proof/x/challenge", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Unable to generate member verification text");
      setChallenge(body);
      setMessage("Member verification text is ready. Post it publicly on X, then return here to find the post or paste its link.");
    } catch (err: any) {
      setError(err?.message || "Unable to generate member verification text");
    } finally {
      setChallengeLoading(false);
    }
  };

  const verifyProof = async () => {
    setVerifyLoading(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/social-proof/x/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postUrl }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Unable to verify X post");
      setMessage("Member verification complete. Your PGPZ community membership is active.");
      setChallenge(null);
      setPostUrl("");
      await update({});
      await refreshStatus();
    } catch (err: any) {
      setError(err?.message || "Unable to complete member verification");
    } finally {
      setVerifyLoading(false);
    }
  };

  const copyProofText = async () => {
    if (!challenge?.suggestedPost) return;
    await navigator.clipboard.writeText(challenge.suggestedPost);
    setMessage("Verification text copied.");
  };

  const findProofPost = async () => {
    setFindLoading(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/social-proof/x/find", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Unable to search for your X post");

      if (body?.status === "verified") {
        setMessage("Member verification complete. Your PGPZ community membership is active.");
        setChallenge(null);
        setPostUrl("");
        await update({});
        await refreshStatus();
        return;
      }

      if (body?.status === "already_active") {
        setMessage("Your PGPZ community membership is already active.");
        setChallenge(null);
        await update({});
        await refreshStatus();
        return;
      }

      if (body?.status === "ambiguous") {
        setError(body?.message || "Multiple matching X posts were found. Paste the intended post URL to complete verification.");
        return;
      }

      setMessage(body?.message || "I could not find the X post yet. X search can lag, so try again shortly or paste the post URL.");
    } catch (err: any) {
      setError(err?.message || "Unable to search for your X post");
    } finally {
      setFindLoading(false);
    }
  };

  const requestManualApproval = async () => {
    setManualApprovalLoading(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/manual-approval/request", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Unable to request manual approval");
      setMessage("Manual approval requested. An admin will review your membership request.");
      await update({});
      await refreshStatus();
    } catch (err: any) {
      setError(err?.message || "Unable to request manual approval");
    } finally {
      setManualApprovalLoading(false);
    }
  };

  if (loading) {
    return <HomeShellSkeleton />;
  }

  const heroFeature = heroFeatureSlides[heroFeatureIndex] || heroFeatureSlides[0];
  if (!heroFeature) return <HomeShellSkeleton />;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5">
      {!showOnboardingFirst ? (
        <CommunityHero
          authenticated={authenticated}
          signupHref={signupHref}
          feature={heroFeature}
          features={heroFeatureSlides}
          activeIndex={heroFeatureIndex}
        />
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
          <AlertTitle>Ready</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Verification issue</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {!authenticated ? (
        <section className="grid gap-4 md:grid-cols-3">
          {[
            ["1", "Join the community", "Use email to create your PGPZ community profile."],
            ["2", "Follow the project", "Keep up with announcements, resources, and early member notes."],
            ["3", "Return as things open", "This will become the member home for coordination and access."],
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
                    {isMember ? `Welcome, ${displayName}.` : "Choose your membership path"}
                  </h2>
                  <p className="max-w-2xl text-sm leading-6 text-slate-600">
                    {isMember
                      ? "Your free PGPZ community membership is active. Thanks for helping build a credible, constructive policy home for Zcash."
                      : "Complete member verification with X or request manual approval if you prefer not to link an X account."}
                  </p>
                </div>
                <div className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${
                  isMember ? "bg-teal-50 text-[var(--brand-teal)]" : "bg-[var(--zcash-gold-soft)] text-[var(--zcash-gold-deep)]"
                }`}>
                  {isMember ? <BadgeCheck className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                  {isMember ? "Active member" : "Member verification needed"}
                </div>
              </div>

              {isMember ? (
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border bg-white/75 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">VERIFIED ACCOUNT</div>
                    <div className="mt-2 text-lg font-semibold text-[var(--brand-ink)]">
                      {manuallyApproved ? "Manual approval" : verifiedXHandle || "X account"}
                    </div>
                  </div>
                  <div className="rounded-lg border bg-white/75 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">VERIFIED AT</div>
                    <div className="mt-2 text-sm font-medium text-[var(--brand-ink)]">{formatDate(verifiedAt)}</div>
                  </div>
                  <div className="rounded-lg border bg-white/75 p-4 sm:col-span-2">
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">PROOF RECORD</div>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                      {proofUrl ? (
                        <Link className="font-medium text-[var(--brand-denim)] underline" href={proofUrl} target="_blank" rel="noopener noreferrer">
                          View verified X post
                        </Link>
                      ) : manuallyApproved ? (
                        <span className="text-slate-600">Manual approval by PGPZ admin</span>
                      ) : (
                        <span className="text-slate-600">Proof URL unavailable</span>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-6 space-y-5">
                  <div className="rounded-lg border border-[rgba(245,168,0,0.58)] bg-white/90 p-4 shadow-[0_16px_28px_-24px_rgba(30,30,30,0.32)]">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand-denim)]">
                          X SOCIAL PROOF
                        </div>
                        <h3 className="text-base font-semibold text-[var(--brand-ink)]">
                          Start with X social proof
                        </h3>
                        <p className="text-sm leading-6 text-slate-600">
                          Create a short verification post for X. After you publish it, return here so the site can confirm the post and activate membership.
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="lg"
                        className="border border-[rgba(138,90,0,0.35)] bg-[var(--zcash-gold)] text-[var(--brand-ink)] shadow-sm hover:bg-[var(--zcash-gold-soft)]"
                        onClick={generateChallenge}
                        disabled={challengeLoading}
                      >
                        {challengeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                        {challengeLoading ? "Preparing X verification" : "Start X verification"}
                      </Button>
                    </div>

                    {challenge ? (
                      <div className="mt-4 space-y-4 border-t border-[rgba(245,168,0,0.3)] pt-4">
                        <div className="grid gap-3 text-sm leading-6 text-slate-600 md:grid-cols-3">
                          {[
                            ["1", "Post the text publicly on X."],
                            ["2", "Return here after posting."],
                            ["3", "Let the site find the post or paste the link."],
                          ].map(([step, body]) => (
                            <div key={step} className="rounded-md border bg-white/80 p-3">
                              <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--brand-ink)] text-xs font-semibold text-[var(--zcash-gold)]">
                                {step}
                              </div>
                              {body}
                            </div>
                          ))}
                        </div>
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">POST THIS TEXT ON X</div>
                          <pre className="mt-2 whitespace-pre-wrap rounded-md bg-slate-950 p-4 text-sm leading-6 text-white">
                            {challenge.suggestedPost}
                          </pre>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" variant="outline" onClick={copyProofText}>
                            <Clipboard className="h-4 w-4" />
                            Copy text
                          </Button>
                          <Button type="button" variant="outline" asChild>
                            <Link href={buildIntentUrl(challenge.suggestedPost)} target="_blank" rel="noopener noreferrer">
                              Open X composer
                              <ExternalLink className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button type="button" variant="outline" onClick={findProofPost} disabled={findLoading}>
                            {findLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
                            Find my X post
                          </Button>
                        </div>
                        <div className="space-y-2">
                          <label htmlFor="postUrl" className="text-sm font-medium">
                            X post URL
                          </label>
                          <input
                            id="postUrl"
                            value={postUrl}
                            onChange={(event) => setPostUrl(event.target.value)}
                            placeholder="https://x.com/yourhandle/status/..."
                            className="w-full rounded-md border px-3 py-2 text-sm"
                          />
                        </div>
                        <Button onClick={verifyProof} disabled={verifyLoading || !postUrl.trim()}>
                          {verifyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
                          Complete X verification
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  <div className="rounded-lg border bg-white/80 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                          MANUAL APPROVAL
                        </div>
                        <h3 className="text-base font-semibold text-[var(--brand-ink)]">
                          Prefer not to link X?
                        </h3>
                        <p className="text-sm leading-6 text-slate-600">
                          Request manual review and a PGPZ admin will evaluate your membership request.
                        </p>
                        {manualApprovalPending && manualApprovalRequestedAt ? (
                          <p className="text-xs font-medium text-[var(--brand-denim)]">
                            Requested {formatDate(manualApprovalRequestedAt)}
                          </p>
                        ) : null}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={manualApprovalLoading || manualApprovalPending}
                        onClick={requestManualApproval}
                      >
                        {manualApprovalLoading
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <ShieldCheck className="h-4 w-4" />}
                        {manualApprovalPending ? "Request pending" : "Request manual approval"}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <aside className="muted-card p-6">
              <p className="section-eyebrow text-[var(--brand-denim)]">COMMUNITY</p>
              <h2 className="mt-2 text-xl font-semibold text-[var(--brand-ink)]">What this space is for</h2>
              <div className="mt-4 space-y-4 text-sm leading-6 text-slate-600">
                <p>
                  The PGPZ Community is an early member space for people who want to follow, support, and coordinate around privacy-focused Zcash policy work.
                </p>
                <ul className="list-disc space-y-2 pl-5">
                  <li>Project updates from PGPZ</li>
                  <li>Resources for Zcash policy education</li>
                  <li>Information about focused convenings and events</li>
                  <li>Community-led coordination around policy priorities</li>
                  <li>Pathways to participate in future PGPZ working groups</li>
                </ul>
                <p>
                  We are starting small and building in public. Expect this space to grow as PGPZ programming, resources, and member tools come online.
                </p>
              </div>
            </aside>
          </section>

          {isMember ? <CommunityMemberResources resources={memberResources} /> : null}

          <CommunityPillars resources={memberResources} />

          <CommunityClosingCards />
        </>
      )}
    </div>
  );
}
