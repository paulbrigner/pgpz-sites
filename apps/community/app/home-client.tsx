"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BadgeCheck, CheckCircle2, Clipboard, ExternalLink, FileText, Loader2, Mail, MessageCircle, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { HomeShellSkeleton } from "@/components/home/Skeletons";
import { ReferralInviteCard } from "@/components/referrals/ReferralInviteCard";
import { getPolicyUpdate } from "@/lib/policy-updates";
import { REFERRAL_QUERY_PARAM, normalizeReferralCode } from "@/lib/referral-code";
import { useAppSession } from "@/lib/use-app-session";

type ProofStatus = {
  membershipStatus: "active" | "none";
  membershipProvider: string | null;
  membershipVerifiedAt: string | null;
  membershipProofPostUrl: string | null;
  membershipProofPostId: string | null;
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

const specialPolicyUpdate = getPolicyUpdate("1H2026-us-digital-asset-policy")!;
const weeklyPolicyUpdate = getPolicyUpdate("2026-06-08-weekly-policy-memo")!;

const memberResources = [
  {
    href: weeklyPolicyUpdate.portalPath,
    label: weeklyPolicyUpdate.shortTitle,
    detail: weeklyPolicyUpdate.summary,
    category: weeklyPolicyUpdate.categoryLabel,
  },
  {
    href: specialPolicyUpdate.portalPath,
    label: specialPolicyUpdate.shortTitle,
    detail: specialPolicyUpdate.summary,
    category: specialPolicyUpdate.categoryLabel,
  },
];

const heroFeatureSlides = [
  {
    eyebrow: specialPolicyUpdate.categoryLabel,
    title: "U.S. Digital Asset Policy",
    body: specialPolicyUpdate.emailPreheader,
    href: specialPolicyUpdate.portalPath,
    caption: specialPolicyUpdate.title,
    imageSrc: specialPolicyUpdate.coverImage,
    imageAlt: "U.S. Digital Asset Policy report cover",
    imageFit: "contain",
  },
  {
    eyebrow: weeklyPolicyUpdate.categoryLabel,
    title: "Weekly Policy Memo",
    body: weeklyPolicyUpdate.emailPreheader,
    href: weeklyPolicyUpdate.portalPath,
    caption: weeklyPolicyUpdate.title,
    imageSrc: weeklyPolicyUpdate.coverImage,
    imageAlt: "Weekly Policy Memo cover",
    imageFit: "contain",
  },
];

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

export default function HomeClient() {
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
  const xHandle = proofStatus?.xHandle || sessionUser?.xHandle || null;
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
    const interval = window.setInterval(() => {
      setHeroFeatureIndex((current) => (current + 1) % heroFeatureSlides.length);
    }, 5500);

    return () => window.clearInterval(interval);
  }, []);

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

  const heroFeature = heroFeatureSlides[heroFeatureIndex];
  const heroFeatureImage = (
    <Image
      src={heroFeature.imageSrc}
      alt={heroFeature.imageAlt}
      width={520}
      height={360}
      priority={heroFeatureIndex === 0}
      className={`h-full w-full ${heroFeature.imageFit === "contain" ? "object-contain" : "object-cover"}`}
    />
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5">
      {!showOnboardingFirst ? (
        <section className="community-hero">
          <div className="community-hero__frame community-hero__frame--with-report">
            <div className="community-hero__content max-w-3xl space-y-5">
              <div className="flex flex-wrap items-center gap-3">
                <p className="section-eyebrow text-white/70">PGPZ COMMUNITY</p>
                {authenticated ? (
                  <span className="rounded-full border border-[rgba(245,168,0,0.45)] bg-[rgba(245,168,0,0.14)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--zcash-gold-soft)]">
                    Early beta
                  </span>
                ) : null}
              </div>
              <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
                A member home for Zcash policy engagement.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-white/78">
                Follow PGPZ updates, access member resources, and help coordinate
                privacy-focused policy work for Zcash as PGP* for Zcash takes shape.
              </p>
              {!authenticated ? (
                <div className="flex flex-wrap gap-3">
                  <Button
                    size="lg"
                    className="bg-[var(--zcash-gold)] text-[var(--brand-ink)] hover:bg-[var(--zcash-gold-soft)]"
                    asChild
                  >
                    <Link href={signupHref}>
                      <Mail className="h-4 w-4" aria-hidden="true" />
                      Join with email
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
            <div className="community-hero__visual" aria-label="Featured PGPZ updates">
              {heroFeature.href ? (
                <Link
                  href={heroFeature.href}
                  className="community-hero__feature-card"
                  aria-label={`View ${heroFeature.title}`}
                >
                  {heroFeatureImage}
                </Link>
              ) : (
                <div className="community-hero__feature-card" aria-label={heroFeature.title}>
                  {heroFeatureImage}
                </div>
              )}
              {heroFeature.href ? (
                <Link
                  href={heroFeature.href}
                  className="community-hero__feature-caption"
                >
                  {heroFeature.caption}
                </Link>
              ) : (
                <p className="community-hero__feature-caption">{heroFeature.caption}</p>
              )}
              <div className="flex gap-2" aria-hidden="true">
                {heroFeatureSlides.map((slide, index) => (
                  <span
                    key={slide.title}
                    className={`h-1.5 rounded-full transition-all ${
                      index === heroFeatureIndex ? "w-8 bg-[var(--zcash-gold)]" : "w-3 bg-white/35"
                    }`}
                  />
                ))}
              </div>
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
                      {manuallyApproved ? "Manual approval" : xHandle || "X account"}
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

          {isMember ? (
            <>
              <ReferralInviteCard />

              <section className="glass-surface grid gap-6 p-6 lg:grid-cols-[1fr_220px] lg:items-center">
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--brand-ink)] text-[var(--zcash-gold)]">
                    <MessageCircle className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="section-eyebrow text-[var(--brand-denim)]">SIGNAL GROUP</p>
                    <h2 className="mt-3 text-xl font-semibold text-[var(--brand-ink)]">
                      Join the members-only Signal group
                    </h2>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                      Scan the QR code from your phone or open the secure Signal link for timely PGPZ community
                      coordination, quick updates, and member-to-member conversation.
                    </p>
                    <div className="mt-5 flex flex-wrap gap-3">
                      <Button asChild>
                        <Link
                          href="https://signal.group/#CjQKIEvyw3Ze5YXfGya1u442-BQLrXrN8s7dHoTRk3Jh-8r9EhAhSfVI2Umy4mA1Hq2VFDe_"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Open Signal link
                          <ExternalLink className="h-4 w-4" aria-hidden="true" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="justify-self-start rounded-2xl border border-[rgba(245,168,0,0.34)] bg-white p-3 shadow-[0_18px_36px_-28px_rgba(30,30,30,0.48)] lg:justify-self-end">
                  <Image
                    src="/community-signal-qr.png"
                    alt="QR code to join the PGPZ Community Signal group"
                    width={192}
                    height={192}
                    className="h-48 w-48 rounded-xl"
                  />
                </div>
              </section>

              <section className="glass-surface p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div className="space-y-2">
                    <p className="section-eyebrow text-[var(--brand-denim)]">Member policy updates</p>
                    <h2 className="text-2xl font-semibold text-[var(--brand-ink)]">
                      Weekly memos and special updates
                    </h2>
                    <p className="max-w-3xl text-sm leading-6 text-slate-600">
                      PGPZ members can read the latest weekly policy memo, browse special reports, and return
                      to prior updates at any time from the archive.
                    </p>
                  </div>
                  <Button asChild>
                    <Link href="/updates">
                      View full archive
                      <FileText className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </Button>
                </div>
                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  {memberResources.map((resource) => (
                    <Link
                      key={resource.href}
                      href={resource.href}
                      className="group rounded-2xl border bg-white/85 p-5 transition hover:border-[rgba(245,168,0,0.55)] hover:shadow-[0_20px_36px_-28px_rgba(30,30,30,0.4)]"
                    >
                      <div className="mb-3 inline-flex rounded-full bg-[var(--brand-ink)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--zcash-gold)]">
                        {resource.category}
                      </div>
                      <h3 className="text-lg font-semibold text-[var(--brand-ink)] group-hover:text-[var(--brand-denim)]">
                        {resource.label}
                      </h3>
                      <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">
                        {resource.detail}
                      </p>
                    </Link>
                  ))}
                </div>
              </section>
            </>
          ) : null}

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-[var(--brand-ink)]">The three pillars of PGPZ</h2>
            <div className="grid gap-4 lg:grid-cols-3">
              {[
                {
                  eyebrow: "FOCUSED CONVENINGS",
                  title: "Bringing policy conversations into focus",
                  body: "PGPZ will continue the PGP* policy convening series in a more Zcash-focused format, bringing policymakers together with experts on privacy-preserving digital cash, practical compliance, civil liberties, and public-interest technology.",
                  note: "The Cypherpunk Policy Dinner is one example of this pillar in action.",
                },
                {
                  eyebrow: "MEMBER RESOURCES",
                  title: "A shared home for Zcash policy work",
                  body: "This community site will grow into a place for updates, resource links, member notes, event materials, and practical tools for people supporting Zcash policy engagement.",
                  resourceLinks: memberResources,
                },
                {
                  eyebrow: "PGPZ COALITION",
                  title: "Coordinated policy engagement",
                  body: "PGPZ will also include a smaller, action-oriented coalition of policy professionals and active advocates focused on policymaker education, advocacy strategy, and practical coordination around Zcash.",
                },
              ].map((pillar) => (
                <article key={pillar.eyebrow} className="muted-card flex flex-col p-5">
                  <p className="section-eyebrow text-[var(--brand-denim)]">{pillar.eyebrow}</p>
                  <h3 className="mt-3 text-lg font-semibold text-[var(--brand-ink)]">{pillar.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{pillar.body}</p>
                  {pillar.resourceLinks ? (
                    <div className="mt-5 space-y-3 border-t border-[rgba(245,168,0,0.24)] pt-4">
                      {pillar.resourceLinks.map((resource) => (
                        <Link
                          key={resource.href}
                          href={resource.href}
                          className="flex items-center gap-3 text-sm font-medium text-[var(--brand-denim)] transition-colors hover:text-[var(--zcash-gold-deep)]"
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--brand-ink)] text-[var(--zcash-gold)]">
                            <FileText className="h-4 w-4" aria-hidden="true" />
                          </span>
                          <span className="min-w-0">
                            <span className="block">{resource.label}</span>
                            <span className="block truncate text-xs font-normal text-slate-600">
                              {resource.detail}
                            </span>
                          </span>
                        </Link>
                      ))}
                    </div>
                  ) : null}
                  {pillar.note ? (
                    <p className="mt-5 border-t border-[rgba(245,168,0,0.24)] pt-4 text-xs font-medium leading-5 text-[var(--brand-denim)]">
                      {pillar.note}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <article className="glass-item p-6">
              <p className="section-eyebrow text-[var(--brand-denim)]">COMING NEXT</p>
              <h2 className="mt-3 text-xl font-semibold text-[var(--brand-ink)]">Building the next version</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Future versions of the PGPZ Community will add richer member profiles, additional sign-up and verification options beyond X, resource libraries, event pages, and more ways for members to participate in Zcash policy work.
              </p>
            </article>

            <article className="glass-item p-6">
              <p className="section-eyebrow text-[var(--brand-denim)]">GET INVOLVED</p>
              <h2 className="mt-3 text-xl font-semibold text-[var(--brand-ink)]">Help shape the policy community</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Have a policy resource, event idea, research question, or introduction that could help policymakers better understand Zcash? Share it with the PGPZ team as we build the next version of the community site.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button asChild>
                  <Link href="mailto:admin@pgpz.org?subject=PGPZ%20Community%20Feedback">
                    Share feedback
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
