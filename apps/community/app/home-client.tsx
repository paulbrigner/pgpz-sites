"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { BadgeCheck, CheckCircle2, Clipboard, ExternalLink, Loader2, Mail, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { HomeShellSkeleton } from "@/components/home/Skeletons";

type ProofStatus = {
  membershipStatus: "active" | "none";
  membershipProvider: string | null;
  membershipVerifiedAt: string | null;
  membershipProofPostUrl: string | null;
  membershipProofPostId: string | null;
  xHandle: string | null;
  proofRetentionPolicy: string | null;
};

type XChallenge = {
  challengeId: string;
  challenge: string;
  expiresAt: string;
  suggestedPost: string;
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

export default function HomeClient() {
  const { data: session, status, update } = useSession();
  const searchParams = useSearchParams();
  const authenticated = status === "authenticated";
  const loading = status === "loading";
  const sessionUser = session?.user as any | undefined;
  const isSocialProofOnboarding = searchParams?.get("next") === "social-proof";
  const signupProfileId = searchParams?.get("signupProfileId") || "";

  const [proofStatus, setProofStatus] = useState<ProofStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<XChallenge | null>(null);
  const [challengeLoading, setChallengeLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [postUrl, setPostUrl] = useState("");
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
  const activeFromStatus = proofStatus?.membershipStatus === "active";
  const isMember = activeFromSession || activeFromStatus;
  const showOnboardingFirst = authenticated && !isMember;
  const verifiedAt =
    proofStatus?.membershipVerifiedAt || sessionUser?.membershipVerifiedAt || null;
  const proofUrl =
    proofStatus?.membershipProofPostUrl || sessionUser?.membershipProofPostUrl || null;
  const xHandle = proofStatus?.xHandle || sessionUser?.xHandle || null;
  const retentionPolicy =
    proofStatus?.proofRetentionPolicy || sessionUser?.proofRetentionPolicy || "valid_if_deleted";

  const refreshStatus = useCallback(async () => {
    if (!authenticated) return;
    try {
      setStatusError(null);
      const res = await fetch("/api/social-proof/status", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Unable to load proof status");
      }
      setProofStatus(await res.json());
    } catch (err: any) {
      setStatusError(err?.message || "Unable to load proof status");
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

  const generateChallenge = async () => {
    setChallengeLoading(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/social-proof/x/challenge", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Unable to generate proof code");
      setChallenge(body);
      setMessage("Proof code generated. Post the text on X, then paste the post URL here.");
    } catch (err: any) {
      setError(err?.message || "Unable to generate proof code");
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
      if (!res.ok) throw new Error(body?.error || "Unable to verify X proof");
      setMessage("X proof verified. Your PGPZ community membership is active.");
      setChallenge(null);
      setPostUrl("");
      await update({});
      await refreshStatus();
    } catch (err: any) {
      setError(err?.message || "Unable to verify X proof");
    } finally {
      setVerifyLoading(false);
    }
  };

  const copyProofText = async () => {
    if (!challenge?.suggestedPost) return;
    await navigator.clipboard.writeText(challenge.suggestedPost);
    setMessage("Proof text copied.");
  };

  if (loading) {
    return <HomeShellSkeleton />;
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5">
      {!showOnboardingFirst ? (
        <section className="community-hero">
          <div className="community-hero__frame">
            <div className="community-hero__content max-w-3xl space-y-5">
              <p className="section-eyebrow text-white/70">PGPZ Community</p>
              <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
                A community home for PGPZ.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-white/78">
                A place for early members to connect, follow project updates, and
                coordinate around privacy-focused Zcash work as PGPZ takes shape.
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
          </div>
        </section>
      ) : null}

      {showOnboardingFirst ? (
        <Alert>
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>{isSocialProofOnboarding ? "Email confirmed" : "Finish membership setup"}</AlertTitle>
          <AlertDescription>
            Link your X account to activate your PGPZ community membership.
          </AlertDescription>
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
        <section className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
          <div className="glass-surface p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
                <p className="section-eyebrow text-[var(--brand-denim)]">Membership</p>
                <h2 className="text-2xl font-semibold text-[var(--brand-ink)]">
                  {isMember ? `Welcome, ${displayName}.` : `Hi ${displayName}, finish setting up your access.`}
                </h2>
                <p className="max-w-2xl text-sm leading-6 text-slate-600">
                  {isMember
                    ? "Your PGPZ community membership is active."
                    : "Confirm the X account you want associated with your PGPZ profile."}
                </p>
              </div>
              <div className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${
                isMember ? "bg-teal-50 text-[var(--brand-teal)]" : "bg-[var(--zcash-gold-soft)] text-[var(--zcash-gold-deep)]"
              }`}>
                {isMember ? <BadgeCheck className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                {isMember ? "Active member" : "Proof needed"}
              </div>
            </div>

            {isMember ? (
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border bg-white/75 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Verified account</div>
                  <div className="mt-2 text-lg font-semibold text-[var(--brand-ink)]">{xHandle || "X account"}</div>
                </div>
                <div className="rounded-lg border bg-white/75 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Verified at</div>
                  <div className="mt-2 text-sm font-medium text-[var(--brand-ink)]">{formatDate(verifiedAt)}</div>
                </div>
                <div className="rounded-lg border bg-white/75 p-4 sm:col-span-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Proof record</div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                    {proofUrl ? (
                      <Link className="font-medium text-[var(--brand-denim)] underline" href={proofUrl} target="_blank" rel="noopener noreferrer">
                        View verified X post
                      </Link>
                    ) : (
                      <span className="text-slate-600">Proof URL unavailable</span>
                    )}
                    <span className="text-slate-500">
                      Policy: {retentionPolicy === "valid_if_deleted" ? "membership remains valid if the post is later deleted" : retentionPolicy}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-6 space-y-5">
                <Button onClick={generateChallenge} disabled={challengeLoading}>
                  {challengeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  Generate X proof text
                </Button>

                {challenge ? (
                  <div className="space-y-4 rounded-lg border bg-white/80 p-4">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Post this text on X</div>
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
                      Verify and activate membership
                    </Button>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <aside className="muted-card p-6">
            <p className="section-eyebrow text-[var(--brand-denim)]">Community</p>
            <h2 className="mt-2 text-xl font-semibold text-[var(--brand-ink)]">Early member home</h2>
            <div className="mt-4 space-y-4 text-sm leading-6 text-slate-600">
              <p>
                This space can grow into project updates, resource links, member notes, and access to community materials.
              </p>
              <p>
                Profile fields are intentionally simple for now, with room to add richer member context later.
              </p>
              <p>
                The underlying membership checks stay out of the spotlight so the site can feel like a community space first.
              </p>
            </div>
          </aside>
        </section>
      )}
    </div>
  );
}
