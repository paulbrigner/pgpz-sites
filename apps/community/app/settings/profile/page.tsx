"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, Clipboard, Gift } from "lucide-react";
import { useAppSession } from "@/lib/use-app-session";

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

export default function ProfileSettingsPage() {
  const { data: session, status, update } = useAppSession();
  const router = useRouter();
  const ready = status !== "loading";
  const authenticated = status === "authenticated";

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [xHandle, setXHandle] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emailMessage, setEmailMessage] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSubmitting, setEmailSubmitting] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [referralSummary, setReferralSummary] = useState<ReferralSummary | null>(null);
  const [referralLoading, setReferralLoading] = useState(false);
  const [referralError, setReferralError] = useState<string | null>(null);
  const [referralCopied, setReferralCopied] = useState(false);
  const [initial, setInitial] = useState<
    { firstName: string; lastName: string; xHandle: string; linkedinUrl: string } | null
  >(null);

  const sessionUser = session?.user as any | undefined;
  const currentEmail = typeof sessionUser?.email === "string" ? sessionUser.email : "";

  useEffect(() => {
    if (!authenticated || !sessionUser) return;
    const next = {
      firstName: (sessionUser.firstName as string) || "",
      lastName: (sessionUser.lastName as string) || "",
      xHandle: (sessionUser.xHandle as string) || "",
      linkedinUrl: (sessionUser.linkedinUrl as string) || "",
    };
    setFirstName(next.firstName);
    setLastName(next.lastName);
    setXHandle(next.xHandle);
    setLinkedinUrl(next.linkedinUrl);
    setNewEmail(currentEmail || "");
    setInitial(next);
  }, [authenticated, sessionUser, currentEmail]);

  useEffect(() => {
    try {
      router.prefetch("/");
    } catch {
      // ignore prefetch errors
    }
  }, [router]);

  useEffect(() => {
    if (!authenticated) return;
    let cancelled = false;
    const loadReferralSummary = async () => {
      setReferralLoading(true);
      setReferralError(null);
      try {
        const res = await fetch("/api/referrals/summary", { cache: "no-store" });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error || "Failed to load referral link");
        if (!cancelled) setReferralSummary(body);
      } catch (err: any) {
        if (!cancelled) setReferralError(err?.message || "Failed to load referral link");
      } finally {
        if (!cancelled) setReferralLoading(false);
      }
    };

    void loadReferralSummary();
    return () => {
      cancelled = true;
    };
  }, [authenticated]);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      if (!firstName.trim()) throw new Error("First name is required");
      if (!lastName.trim()) throw new Error("Last name is required");
      if (linkedinUrl.trim()) {
        try {
          const url = new URL(linkedinUrl.trim());
          if (!/^https?:$/.test(url.protocol)) throw new Error();
        } catch {
          throw new Error("LinkedIn URL must be http(s)");
        }
      }
      const res = await fetch("/api/profile/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          xHandle: xHandle.trim(),
          linkedinUrl: linkedinUrl.trim(),
        }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail?.error || res.statusText || "Update failed");
      }
      const next = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        xHandle: xHandle.trim(),
        linkedinUrl: linkedinUrl.trim(),
      };
      setMessage("Profile updated");
      setInitial(next);
      await update({});
    } catch (err: any) {
      setError(err?.message || "Unexpected error");
    } finally {
      setSubmitting(false);
    }
  };

  const isDirty = () => {
    if (!initial) return false;
    return (
      firstName.trim() !== initial.firstName ||
      lastName.trim() !== initial.lastName ||
      xHandle.trim() !== initial.xHandle ||
      linkedinUrl.trim() !== initial.linkedinUrl
    );
  };

  const onRequestEmailChange = async (event: React.FormEvent) => {
    event.preventDefault();
    setEmailSubmitting(true);
    setEmailMessage(null);
    setEmailError(null);
    try {
      const target = newEmail.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
        throw new Error("Enter a valid email address.");
      }
      if (currentEmail && target === currentEmail.toLowerCase()) {
        throw new Error("Enter a different email to change it.");
      }
      const res = await fetch("/api/profile/request-email-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: target }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail?.error || res.statusText || "Failed to send verification email");
      }
      setEmailMessage("Check your new email for a confirmation link. We will switch your account after you verify.");
    } catch (err: any) {
      setEmailError(err?.message || "Failed to start email change");
    } finally {
      setEmailSubmitting(false);
    }
  };

  const handleBack = () => {
    if (isDirty()) {
      const proceed = confirm("You have unsaved changes. Leave without saving?");
      if (!proceed) return;
    }
    router.push("/");
  };

  const copyReferralLink = async () => {
    if (!referralSummary?.referralUrl) return;
    try {
      await navigator.clipboard.writeText(referralSummary.referralUrl);
      setReferralCopied(true);
      setReferralError(null);
      window.setTimeout(() => setReferralCopied(false), 1800);
    } catch {
      setReferralError("Could not copy the referral link. Select the link and copy it manually.");
    }
  };

  if (!ready) {
    return <div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>;
  }

  if (!authenticated) {
    return (
      <div className="space-y-4">
        <p>You need to sign in to edit your profile.</p>
        <Button onClick={() => router.push("/signin?callbackUrl=/settings/profile")}>
          Sign in
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button variant="outline" onClick={handleBack}>
          Back to Home
        </Button>
      </div>

      {message ? (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Success</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <section className="rounded-lg border bg-white/80 p-6 shadow-sm">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Profile information</h2>
          <p className="text-sm text-muted-foreground">
            Keep your contact and social details current for PGPZ community membership and updates.
          </p>
        </div>
        <form onSubmit={onSubmit} className="mt-5 space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="firstName" className="text-sm font-medium">
                First name
              </label>
              <input
                id="firstName"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                required
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="lastName" className="text-sm font-medium">
                Last name
              </label>
              <input
                id="lastName"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                required
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="xHandle" className="text-sm font-medium">
              X handle
            </label>
            <input
              id="xHandle"
              value={xHandle}
              onChange={(event) => setXHandle(event.target.value)}
              placeholder="@handle"
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="linkedin" className="text-sm font-medium">
              LinkedIn URL
            </label>
            <input
              id="linkedin"
              value={linkedinUrl}
              onChange={(event) => setLinkedinUrl(event.target.value)}
              placeholder="https://www.linkedin.com/in/username"
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving..." : "Save changes"}
          </Button>
        </form>
      </section>

      <section className="rounded-lg border bg-white/80 p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-[var(--zcash-gold-deep)]" />
              <h2 className="text-lg font-semibold">Member recruitment</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Share your referral link with prospective members. Sign-ups from this link are credited here.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-md border bg-white px-4 py-2">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Sign-ups</div>
              <div className="text-xl font-semibold text-[var(--brand-ink)]">
                {referralSummary?.creditedSignupCount ?? 0}
              </div>
            </div>
            <div className="rounded-md border bg-white px-4 py-2">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Active</div>
              <div className="text-xl font-semibold text-[var(--brand-ink)]">
                {referralSummary?.activeRecruitCount ?? 0}
              </div>
            </div>
          </div>
        </div>

        {referralError ? (
          <Alert className="mt-4" variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Referral link unavailable</AlertTitle>
            <AlertDescription>{referralError}</AlertDescription>
          </Alert>
        ) : null}

        <div className="mt-5 space-y-3">
          <label htmlFor="referralUrl" className="text-sm font-medium">
            Referral link
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="referralUrl"
              value={referralLoading ? "Loading..." : referralSummary?.referralUrl || ""}
              readOnly
              className="min-w-0 flex-1 rounded-md border bg-white px-3 py-2 text-sm"
            />
            <Button
              type="button"
              variant="outline"
              onClick={copyReferralLink}
              disabled={!referralSummary?.referralUrl || referralLoading}
            >
              <Clipboard className="h-4 w-4" />
              {referralCopied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>

        {referralSummary?.recentCredits.length ? (
          <div className="mt-5 rounded-md border bg-white/70">
            <div className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Recent credits
            </div>
            <div className="divide-y">
              {referralSummary.recentCredits.map((credit) => (
                <div key={`${credit.referredUserId}:${credit.creditedAt}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-[var(--brand-ink)]">
                      {credit.referredName || credit.referredEmail || "New member"}
                    </div>
                    <div className="text-xs text-slate-500">
                      {new Date(credit.creditedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <span className="rounded-full bg-[var(--zcash-gold-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--zcash-gold-deep)]">
                    {credit.membershipStatus === "active" ? "Active" : "Signed up"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border bg-white/80 p-6 shadow-sm">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Email</h2>
          <p className="text-sm text-muted-foreground">
            Current email: {currentEmail ? <span className="font-mono">{currentEmail}</span> : "Not set"}.
            We will send a confirmation link to the new address before switching your account.
          </p>
        </div>
        {emailMessage ? (
          <Alert className="mt-4">
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Verification sent</AlertTitle>
            <AlertDescription>{emailMessage}</AlertDescription>
          </Alert>
        ) : null}
        {emailError ? (
          <Alert className="mt-4" variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{emailError}</AlertDescription>
          </Alert>
        ) : null}
        <form onSubmit={onRequestEmailChange} className="mt-5 space-y-3">
          <div className="space-y-2">
            <label htmlFor="newEmail" className="text-sm font-medium">
              New email
            </label>
            <input
              id="newEmail"
              type="email"
              value={newEmail}
              onChange={(event) => setNewEmail(event.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <Button type="submit" disabled={emailSubmitting}>
            {emailSubmitting ? "Sending..." : "Send verification link"}
          </Button>
          <p className="text-xs text-muted-foreground">
            After you click the link we send, sign in again with the new email.
          </p>
        </form>
      </section>
    </div>
  );
}
