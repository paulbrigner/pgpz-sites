"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Mail } from "lucide-react";
import {
  COMMUNITY_GUIDELINES_PATH,
  LEGAL_DOCUMENT_VERSION,
  PRIVACY_PATH,
  TERMS_PATH,
} from "@/lib/legal-config";
import { BETTER_AUTH_BASE_PATH } from "@/lib/better-auth-constants";
import { policyInterestGroupOptions } from "@/lib/policy-interest-groups";

const membershipRequestCallback = "/?next=membership-request";

const sanitizeCallbackUrl = (value: string | null | undefined, reason: string | null) => {
  const trimmed = (value || "").trim();
  const fallback = reason === "signup" ? membershipRequestCallback : "/";

  if (!trimmed) return fallback;
  if (reason === "signup" && trimmed === "/") return membershipRequestCallback;
  if (/^\/signin(?:\/|\?|$)/.test(trimmed)) return fallback;
  if (/^\/api\/auth(?:\/|\?|$)/.test(trimmed)) return fallback;

  return trimmed;
};

const buildSignInUrl = ({
  callbackUrl,
  reason,
  sent,
}: {
  callbackUrl: string;
  reason: string | null;
  sent?: boolean;
}) => {
  const params = new URLSearchParams();
  params.set("callbackUrl", callbackUrl);
  if (reason) params.set("reason", reason);
  if (sent) params.set("sent", "1");
  return `/signin?${params.toString()}`;
};

const appendSignupProfileId = (callbackUrl: string, signupProfileId: string) => {
  const [path, query = ""] = callbackUrl.split("?");
  const params = new URLSearchParams(query);
  params.set("signupProfileId", signupProfileId);
  const nextQuery = params.toString();
  return nextQuery ? `${path || "/"}?${nextQuery}` : path || "/";
};

const savePendingSignupProfile = async (profile: {
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  jobTitle: string;
  linkedinUrl: string;
  xHandle: string;
  memberDirectoryOptIn: boolean;
  policyInterestGroups: string[];
  legalAccepted: boolean;
  legalDocumentVersion: string;
}) => {
  const res = await fetch("/api/signup/pending", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.signupProfileId) {
    throw new Error(body?.error || "Could not save signup profile.");
  }
  return String(body.signupProfileId);
};

const requestEmailLink = async ({
  email,
  callbackUrl,
  name,
}: {
  email: string;
  callbackUrl: string;
  name?: string;
}) => {
  const preflight = await fetch("/api/signin/email/preflight", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      callbackURL: callbackUrl,
    }),
  });
  const preflightBody = await preflight.json().catch(() => ({}));
  if (!preflight.ok) {
    throw new Error(preflightBody?.message || preflightBody?.error || "Could not request a sign-in email.");
  }

  const res = await fetch(`${BETTER_AUTH_BASE_PATH}/sign-in/magic-link`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      name,
      callbackURL: callbackUrl,
      errorCallbackURL: "/signin",
    }),
  });
  const responseBody = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      responseBody?.message ||
        responseBody?.error ||
        "Failed to send sign-in email. Please try again or contact admin@pgpz.org.",
    );
  }
};

export default function SignInPage() {
  const searchParams = useSearchParams();
  const reason = searchParams?.get("reason") || null;
  const sent = searchParams?.get("sent") === "1";
  const callbackUrl = useMemo(() => {
    return sanitizeCallbackUrl(searchParams?.get("callbackUrl"), reason);
  }, [reason, searchParams]);

  return (
    <EmailSignIn
      callbackUrl={callbackUrl}
      mode={reason === "signup" ? "signup" : "signin"}
      reason={reason}
      sent={sent}
    />
  );
}

function EmailSignIn({
  callbackUrl,
  mode,
  reason,
  sent,
}: {
  callbackUrl: string;
  mode: "signin" | "signup";
  reason: string | null;
  sent: boolean;
}) {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [company, setCompany] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [xHandle, setXHandle] = useState("");
  const [memberDirectoryOptIn, setMemberDirectoryOptIn] = useState(false);
  const [policyInterestGroups, setPolicyInterestGroups] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sentVisible, setSentVisible] = useState(sent);
  const [legalAccepted, setLegalAccepted] = useState(false);

  const isSignup = mode === "signup";
  const showSentState = sentVisible || !!message;
  const activatedInvite = reason === "invitation-activated";
  const expiredInvite = reason === "invitation-expired";
  const invalidInvite = reason === "invitation-invalid";

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    setError(null);

    try {
      const normalizedEmail = email.trim().toLowerCase();
      let emailCallbackUrl = callbackUrl;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        throw new Error("Enter a valid email address.");
      }

      if (isSignup) {
        if (!firstName.trim()) throw new Error("First name is required.");
        if (!lastName.trim()) throw new Error("Last name is required.");
        if (!company.trim()) throw new Error("Corporate affiliation is required.");
        if (!jobTitle.trim()) throw new Error("Job title is required.");
        if (!legalAccepted) {
          throw new Error(
            "Please accept the Terms of Service, Privacy Policy, and Coalition Guidelines before creating an account."
          );
        }
        if (linkedinUrl.trim()) {
          try {
            const url = new URL(linkedinUrl.trim());
            if (!/^https?:$/.test(url.protocol)) throw new Error();
          } catch {
            throw new Error("LinkedIn URL must be http(s).");
          }
        }

        const pendingProfile = {
          email: normalizedEmail,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          company: company.trim(),
          jobTitle: jobTitle.trim(),
          linkedinUrl: linkedinUrl.trim(),
          xHandle: xHandle.trim(),
          memberDirectoryOptIn,
          policyInterestGroups,
          legalAccepted: true,
          legalDocumentVersion: LEGAL_DOCUMENT_VERSION,
        };
        const signupProfileId = await savePendingSignupProfile(pendingProfile);
        emailCallbackUrl = appendSignupProfileId(callbackUrl, signupProfileId);
        try {
          localStorage.setItem("pendingProfile", JSON.stringify(pendingProfile));
        } catch {
          // If storage is blocked, the user can still complete profile details after sign-in.
        }
      }

      await requestEmailLink({
        email: normalizedEmail,
        callbackUrl: emailCallbackUrl,
        name: [firstName.trim(), lastName.trim()].filter(Boolean).join(" ") || undefined,
      });

      setSentVisible(true);
      setMessage("Check your email for a secure sign-in link.");
      window.history.replaceState(null, "", buildSignInUrl({ callbackUrl: emailCallbackUrl, reason, sent: true }));
    } catch (err: any) {
      setError(err?.message || "Failed to send sign-in email.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl px-5 py-8">
      <section className="glass-surface p-6">
        <div className="space-y-2">
          <p className="section-eyebrow text-[var(--brand-denim)]">PGPZ Coalition</p>
          <h1 className="text-3xl font-semibold text-[var(--brand-ink)]">
            {isSignup
              ? "Request access with email"
              : activatedInvite
                ? "Account activated"
                : reason === "email-updated"
                  ? "Sign in with your new email"
                  : "Sign in"}
          </h1>
          <p className="text-sm leading-6 text-slate-600">
            {activatedInvite
              ? "Your coalition account is active. Use your email to receive a secure sign-in link."
              : "We use email magic links for account access and a short profile to set up your coalition access request."}
          </p>
        </div>

        {expiredInvite || invalidInvite ? (
          <Alert className="mt-5" variant="destructive">
            <AlertTitle>{expiredInvite ? "Invitation expired" : "Invitation unavailable"}</AlertTitle>
            <AlertDescription>
              Ask a PGPZ Coalition admin to send a fresh invitation email.
            </AlertDescription>
          </Alert>
        ) : null}

        {activatedInvite ? (
          <Alert className="mt-5">
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Account activated</AlertTitle>
            <AlertDescription>
              Your coalition membership is active. Send yourself a secure link below to sign in.
            </AlertDescription>
          </Alert>
        ) : null}

        {showSentState ? (
          <Alert className="mt-5">
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Email sent</AlertTitle>
            <AlertDescription>
              Check your email for a secure sign-in link. After you open it, we will bring you back to continue.
            </AlertDescription>
          </Alert>
        ) : null}

        {error ? (
          <Alert className="mt-5" variant="destructive">
            <AlertTitle>Could not continue</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {showSentState ? (
          <div className="mt-6 space-y-3 rounded-lg border bg-white/70 p-4 text-sm leading-6 text-slate-600">
            <p>
              The link can take a moment to arrive. You can leave this page open while you check your inbox.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setMessage(null);
                setSentVisible(false);
                window.history.replaceState(null, "", buildSignInUrl({ callbackUrl, reason }));
              }}
            >
              Use another email
            </Button>
          </div>
        ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          {isSignup ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="firstName" className="text-sm font-medium">
                  First name
                </label>
                <input
                  id="firstName"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  required
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
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  required
                />
              </div>
            </div>
          ) : null}

          {isSignup ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="company" className="text-sm font-medium">
                  Corporate affiliation
                </label>
                <input
                  id="company"
                  value={company}
                  onChange={(event) => setCompany(event.target.value)}
                  placeholder="Organization or company"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="jobTitle" className="text-sm font-medium">
                  Job title
                </label>
                <input
                  id="jobTitle"
                  value={jobTitle}
                  onChange={(event) => setJobTitle(event.target.value)}
                  placeholder="Policy lead, counsel, founder..."
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  required
                />
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-md border px-3 py-2 text-sm"
              required
            />
          </div>

          {isSignup ? (
            <>
              <div className="space-y-2">
                <label htmlFor="linkedinUrl" className="text-sm font-medium">
                  LinkedIn URL
                </label>
                <input
                  id="linkedinUrl"
                  value={linkedinUrl}
                  onChange={(event) => setLinkedinUrl(event.target.value)}
                  placeholder="https://www.linkedin.com/in/username"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="xHandle" className="text-sm font-medium">
                  X handle
                </label>
                <input
                  id="xHandle"
                  value={xHandle}
                  onChange={(event) => setXHandle(event.target.value)}
                  placeholder="@pgpz"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-3 rounded-lg border bg-white/70 p-4">
                <div className="text-sm font-medium">Policy interest groups</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {policyInterestGroupOptions.map((option) => (
                    <label key={option.id} className="flex gap-2 text-sm leading-5 text-slate-600">
                      <input
                        type="checkbox"
                        checked={policyInterestGroups.includes(option.id)}
                        onChange={(event) =>
                          setPolicyInterestGroups((current) =>
                            event.target.checked
                              ? [...current, option.id]
                              : current.filter((id) => id !== option.id),
                          )
                        }
                        className="mt-0.5 h-4 w-4 accent-[var(--zcash-gold)]"
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border bg-white/70 p-4">
                <div className="flex gap-3">
                  <input
                    id="memberDirectoryOptIn"
                    type="checkbox"
                    checked={memberDirectoryOptIn}
                    onChange={(event) => setMemberDirectoryOptIn(event.target.checked)}
                    className="mt-1 h-4 w-4 accent-[var(--zcash-gold)]"
                  />
                  <label htmlFor="memberDirectoryOptIn" className="text-sm leading-6 text-slate-600">
                    Show my name, affiliation, title, email, LinkedIn URL, and X handle to other active coalition members after I am approved.
                  </label>
                </div>
              </div>
              <div className="rounded-lg border bg-white/70 p-4">
                <div className="flex gap-3">
                  <input
                    id="legalAccepted"
                    type="checkbox"
                    checked={legalAccepted}
                    onChange={(event) => setLegalAccepted(event.target.checked)}
                    className="mt-1 h-4 w-4 accent-[var(--zcash-gold)]"
                    required
                  />
                  <label htmlFor="legalAccepted" className="text-sm leading-6 text-slate-600">
                    I have read and agree to the{" "}
                    <Link
                      className="font-medium text-[var(--brand-denim)] underline"
                      href={TERMS_PATH}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Terms of Service
                    </Link>
                    ,{" "}
                    <Link
                      className="font-medium text-[var(--brand-denim)] underline"
                      href={PRIVACY_PATH}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Privacy Policy
                    </Link>
                    , and{" "}
                    <Link
                      className="font-medium text-[var(--brand-denim)] underline"
                      href={COMMUNITY_GUIDELINES_PATH}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Coalition Guidelines
                    </Link>
                    .
                  </label>
                </div>
              </div>
            </>
          ) : null}

          <Button className="w-full" type="submit" disabled={submitting || (isSignup && !legalAccepted)}>
            <Mail className="h-4 w-4" />
            {submitting ? "Sending..." : "Send secure link"}
          </Button>
        </form>
        )}

        <div className="mt-5 text-center text-sm text-slate-600">
          {isSignup ? (
            <Link className="font-medium text-[var(--brand-denim)] underline" href={buildSignInUrl({ callbackUrl, reason: null })}>
              Already have an account?
            </Link>
          ) : (
            <Link className="font-medium text-[var(--brand-denim)] underline" href={buildSignInUrl({ callbackUrl, reason: "signup" })}>
              New to the coalition?
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
