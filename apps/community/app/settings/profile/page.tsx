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
    displayLabel: string;
    membershipStatus: "active" | "none";
    creditedAt: string;
  }>;
};

type EmailPreferences = {
  newsletter: boolean;
  policyUpdates: boolean;
  globallySuppressed: boolean;
  suppressionReason: string | null;
  canSelfResubscribe: boolean;
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
  const [emailPreferences, setEmailPreferences] = useState<EmailPreferences | null>(null);
  const [emailPreferencesLoading, setEmailPreferencesLoading] = useState(false);
  const [emailPreferencesSaving, setEmailPreferencesSaving] = useState(false);
  const [emailPreferencesMessage, setEmailPreferencesMessage] = useState<string | null>(null);
  const [emailPreferencesError, setEmailPreferencesError] = useState<string | null>(null);
  const [initial, setInitial] = useState<
    { firstName: string; lastName: string; xHandle: string; linkedinUrl: string } | null
  >(null);

  const sessionUser = session?.user as any | undefined;
  const isMember = session?.capabilities.member === true;
  const currentEmail = typeof sessionUser?.email === "string" ? sessionUser.email : "";
  const membershipVerifiedAt = typeof sessionUser?.membershipVerifiedAt === "string"
    ? sessionUser.membershipVerifiedAt
    : null;
  const membershipProvider = typeof sessionUser?.membershipProvider === "string"
    ? sessionUser.membershipProvider
    : null;
  const membershipProofPostUrl = typeof sessionUser?.membershipProofPostUrl === "string"
    ? sessionUser.membershipProofPostUrl
    : null;
  const memberSince = membershipVerifiedAt && Number.isFinite(Date.parse(membershipVerifiedAt))
    ? new Date(membershipVerifiedAt).toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
    })
    : "Date unavailable";

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
    if (!authenticated || !isMember) return;
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
  }, [authenticated, isMember]);

  useEffect(() => {
    if (!authenticated) return;
    let cancelled = false;
    const loadEmailPreferences = async () => {
      setEmailPreferencesLoading(true);
      setEmailPreferencesError(null);
      try {
        const response = await fetch("/api/profile/email-preferences", { cache: "no-store" });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || "Failed to load email preferences");
        if (!cancelled) setEmailPreferences(body);
      } catch (err: any) {
        if (!cancelled) setEmailPreferencesError(err?.message || "Failed to load email preferences");
      } finally {
        if (!cancelled) setEmailPreferencesLoading(false);
      }
    };
    void loadEmailPreferences();
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

  const saveEmailPreferences = async () => {
    if (!emailPreferences) return;
    setEmailPreferencesSaving(true);
    setEmailPreferencesMessage(null);
    setEmailPreferencesError(null);
    try {
      const response = await fetch("/api/profile/email-preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newsletter: emailPreferences.newsletter,
          policyUpdates: emailPreferences.policyUpdates,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "Failed to save email preferences");
      setEmailPreferences(body);
      setEmailPreferencesMessage("Email preferences saved.");
    } catch (err: any) {
      setEmailPreferencesError(err?.message || "Failed to save email preferences");
    } finally {
      setEmailPreferencesSaving(false);
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

      {isMember ? (
        <section className="rounded-lg border bg-white/80 p-6 shadow-sm">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Membership record</h2>
            <p className="text-sm text-muted-foreground">Member since {memberSince}</p>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border bg-white px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Verification</div>
              <div className="mt-2 text-sm font-medium text-[var(--brand-ink)]">
                {membershipProvider === "manual"
                  ? "Manual approval"
                  : sessionUser?.membershipProofHandle || "Verified member"}
              </div>
            </div>
            <div className="rounded-md border bg-white px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Proof record</div>
              <div className="mt-2 text-sm">
                {membershipProofPostUrl ? (
                  <a
                    className="font-medium text-[var(--brand-denim)] underline"
                    href={membershipProofPostUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View verified X post
                  </a>
                ) : membershipProvider === "manual" ? (
                  <span className="text-slate-600">Manual approval by PGPZ admin</span>
                ) : (
                  <span className="text-slate-600">Proof URL unavailable</span>
                )}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section className="rounded-lg border bg-white/80 p-6 shadow-sm">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Member email preferences</h2>
          <p className="text-sm text-muted-foreground">
            Choose which optional Community messages you want to receive. Account and security messages are unaffected.
          </p>
        </div>
        {emailPreferencesError ? (
          <Alert className="mt-4" variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Email preferences unavailable</AlertTitle>
            <AlertDescription>{emailPreferencesError}</AlertDescription>
          </Alert>
        ) : null}
        {emailPreferencesMessage ? (
          <Alert className="mt-4">
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Preferences updated</AlertTitle>
            <AlertDescription>{emailPreferencesMessage}</AlertDescription>
          </Alert>
        ) : null}
        {emailPreferences?.globallySuppressed && !emailPreferences.canSelfResubscribe ? (
          <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Delivery is currently suppressed for an administrative or delivery reason. Contact admin@pgpz.org to restore it.
          </p>
        ) : null}
        <div className="mt-5 space-y-3">
          <label className="flex items-start gap-3 rounded-md border bg-white px-4 py-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={emailPreferences?.newsletter ?? false}
              disabled={emailPreferencesLoading || !emailPreferences || (emailPreferences.globallySuppressed && !emailPreferences.canSelfResubscribe)}
              onChange={(event) =>
                setEmailPreferences((current) => current ? { ...current, newsletter: event.target.checked } : current)
              }
            />
            <span>
              <span className="block text-sm font-medium">Community newsletters</span>
              <span className="block text-xs text-muted-foreground">General Community news and member announcements.</span>
            </span>
          </label>
          <label className="flex items-start gap-3 rounded-md border bg-white px-4 py-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={emailPreferences?.policyUpdates ?? false}
              disabled={emailPreferencesLoading || !emailPreferences || (emailPreferences.globallySuppressed && !emailPreferences.canSelfResubscribe)}
              onChange={(event) =>
                setEmailPreferences((current) => current ? { ...current, policyUpdates: event.target.checked } : current)
              }
            />
            <span>
              <span className="block text-sm font-medium">Policy updates</span>
              <span className="block text-xs text-muted-foreground">Weekly policy memos and special policy reports.</span>
            </span>
          </label>
        </div>
        <Button
          type="button"
          className="mt-4"
          onClick={saveEmailPreferences}
          disabled={emailPreferencesLoading || emailPreferencesSaving || !emailPreferences || (emailPreferences.globallySuppressed && !emailPreferences.canSelfResubscribe)}
        >
          {emailPreferencesSaving ? "Saving..." : "Save email preferences"}
        </Button>
      </section>

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
              Profile X handle
            </label>
            <input
              id="xHandle"
              value={xHandle}
              onChange={(event) => setXHandle(event.target.value)}
              placeholder="@handle"
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
            <p className="text-xs text-muted-foreground">
              This editable profile field does not change the X identity used for membership verification.
            </p>
            {sessionUser?.membershipProofHandle ? (
              <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm">
                <span className="font-medium">Verified X identity:</span>{" "}
                {sessionUser.membershipProofHandle}
              </div>
            ) : null}
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

      {isMember ? <section id="member-recruitment" className="rounded-lg border bg-white/80 p-6 shadow-sm">
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
              {referralSummary.recentCredits.map((credit, index) => (
                <div key={`${credit.creditedAt}:${index}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-[var(--brand-ink)]">
                      {credit.displayLabel}
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
      </section> : null}

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
