"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Mail } from "lucide-react";

const socialProofCallback = "/?next=social-proof";

const sanitizeCallbackUrl = (value: string | null | undefined, reason: string | null) => {
  const trimmed = (value || "").trim();
  const fallback = reason === "signup" ? socialProofCallback : "/";

  if (!trimmed) return fallback;
  if (reason === "signup" && trimmed === "/") return socialProofCallback;
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
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [xHandle, setXHandle] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isSignup = mode === "signup";
  const showSentState = sent || !!message;

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    setError(null);

    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        throw new Error("Enter a valid email address.");
      }

      if (isSignup) {
        if (!firstName.trim()) throw new Error("First name is required.");
        if (!lastName.trim()) throw new Error("Last name is required.");
        if (linkedinUrl.trim()) {
          try {
            const url = new URL(linkedinUrl.trim());
            if (!/^https?:$/.test(url.protocol)) throw new Error();
          } catch {
            throw new Error("LinkedIn URL must be http(s).");
          }
        }

        const pendingProfile = {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          xHandle: xHandle.trim(),
          linkedinUrl: linkedinUrl.trim(),
        };
        try {
          localStorage.setItem("pendingProfile", JSON.stringify(pendingProfile));
        } catch {
          // If storage is blocked, the user can still complete profile details after sign-in.
        }
      }

      const res = await signIn("email", {
        email: normalizedEmail,
        callbackUrl,
        redirect: false,
      });
      if (!res?.ok) {
        throw new Error(res?.error || "Failed to send sign-in email.");
      }

      setMessage("Check your email for a secure sign-in link.");
      router.replace(buildSignInUrl({ callbackUrl, reason, sent: true }));
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
          <p className="section-eyebrow text-[var(--brand-denim)]">PGPZ Community</p>
          <h1 className="text-3xl font-semibold text-[var(--brand-ink)]">
            {isSignup ? "Join with email" : reason === "email-updated" ? "Sign in with your new email" : "Sign in"}
          </h1>
          <p className="text-sm leading-6 text-slate-600">
            We use email magic links for account access and a short profile to set up your community account.
          </p>
        </div>

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
                router.replace(buildSignInUrl({ callbackUrl, reason }));
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
            </>
          ) : null}

          <Button className="w-full" type="submit" disabled={submitting}>
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
              New to the community?
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
