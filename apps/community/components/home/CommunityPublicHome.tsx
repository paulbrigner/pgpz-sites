"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  BookOpenText,
  CheckCircle2,
  LockKeyhole,
  Mail,
  Scale,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { SecureLinkSubmitButton } from "@pgpz/ui";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { BETTER_AUTH_BASE_PATH } from "@/lib/better-auth-constants";
import { PUBLIC_POLICY_UPDATES_URL } from "@/lib/policy-update-urls";

const COMMUNITY_HOME_CALLBACK = "/";
async function requestCommunityMagicLink(email: string) {
  const response = await fetch(`${BETTER_AUTH_BASE_PATH}/sign-in/magic-link`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      callbackURL: COMMUNITY_HOME_CALLBACK,
      errorCallbackURL: "/signin",
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.message || body?.error || "Failed to send sign-in email.");
  }
}

function CommunityMemberSignIn({ signupHref }: { signupHref: string }) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    setError(null);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError("Enter a valid email address.");
      return;
    }

    setSubmitting(true);
    try {
      await requestCommunityMagicLink(normalizedEmail);
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send sign-in email.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      id="member-sign-in"
      aria-labelledby="member-sign-in-title"
      className="scroll-mt-28 rounded-3xl border border-[rgba(71,85,105,0.22)] bg-white/88 p-5 shadow-[0_28px_56px_-34px_rgba(13,31,32,0.46)] backdrop-blur-sm sm:p-7"
    >
      <div className="space-y-2">
        <p className="section-eyebrow text-[var(--brand-teal)]">Member access</p>
        <h2 id="member-sign-in-title" className="text-2xl font-semibold tracking-[-0.02em] text-[var(--brand-ink)]">
          Member sign in
        </h2>
        <p className="max-w-md text-sm leading-6 text-slate-600">
          We’ll email a secure one-time link for access to your community account.
        </p>
      </div>

      {sent ? (
        <div className="mt-6 space-y-4">
          <Alert className="border-[rgba(47,111,104,0.28)] bg-[rgba(246,250,242,0.88)]">
            <CheckCircle2 className="h-4 w-4 text-[var(--brand-teal)]" aria-hidden="true" />
            <AlertTitle>Email sent</AlertTitle>
            <AlertDescription>
              Check your inbox for a secure sign-in link. You can leave this page open while it arrives.
            </AlertDescription>
          </Alert>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setSent(false);
              setEmail("");
            }}
          >
            Use another email
          </Button>
        </div>
      ) : (
        <form className="mt-4 space-y-3" onSubmit={onSubmit} noValidate>
          <div className="space-y-2">
            <label htmlFor="community-home-email" className="text-sm font-semibold text-[var(--brand-ink)]">
              Email
            </label>
            <input
              id="community-home-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              aria-describedby={error ? "community-home-email-error" : undefined}
              aria-invalid={error ? "true" : undefined}
              className="min-h-11 w-full rounded-xl border border-[rgba(71,85,105,0.58)] bg-white px-4 py-2.5 text-base text-[var(--brand-ink)] shadow-inner outline-none transition focus:border-[var(--brand-teal)] focus:ring-2 focus:ring-[rgba(47,111,104,0.2)]"
              required
            />
          </div>

          {error ? (
            <p id="community-home-email-error" role="alert" className="text-sm font-medium text-red-700">
              {error}
            </p>
          ) : null}

          <SecureLinkSubmitButton type="submit" disabled={submitting}>
            <Mail className="h-5 w-5" aria-hidden="true" />
            {submitting ? "Sending…" : "Send secure link"}
          </SecureLinkSubmitButton>

          <div className="flex items-start gap-2 rounded-xl border border-[rgba(71,85,105,0.18)] bg-[rgba(246,250,242,0.72)] px-4 py-2.5 text-xs leading-5 text-slate-600">
            <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-slate)]" aria-hidden="true" />
            <span>No password needed. One-time link only.</span>
          </div>
        </form>
      )}

      <p className="mt-4 text-sm text-slate-600">
        New to the Community?{" "}
        <Link className="inline-flex items-center gap-1 font-semibold text-[var(--brand-ink)] underline underline-offset-4" href={signupHref}>
          Join now
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </p>
    </section>
  );
}

type RecentWorkCardProps = {
  eyebrow: string;
  title: string;
  summary: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  children: React.ReactNode;
};

function RecentWorkCard({ eyebrow, title, summary, icon: Icon, children }: RecentWorkCardProps) {
  return (
    <article className="flex min-w-0 flex-col rounded-2xl border border-[rgba(71,85,105,0.2)] bg-white/82 p-4 shadow-[0_18px_40px_-34px_rgba(13,31,32,0.42)] sm:flex-row sm:gap-4 lg:flex-col xl:flex-row">
      <div className="mb-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[rgba(47,111,104,0.09)] text-[var(--brand-ink)] sm:mb-0 lg:mb-3 xl:mb-0">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="section-eyebrow text-[var(--brand-teal)]">{eyebrow}</p>
        <h3 className="mt-1.5 text-base font-semibold leading-6 text-[var(--brand-ink)]">{title}</h3>
        <p className="mt-1 text-sm leading-5 text-slate-600">{summary}</p>
        <div className="mt-auto pt-3">{children}</div>
      </div>
    </article>
  );
}

export function CommunityPublicHome({ signupHref }: { signupHref: string }) {
  return (
    <div className="relative mx-auto flex w-full max-w-[82rem] flex-col overflow-hidden px-5 pb-2 sm:px-7 lg:px-5">
      <Image
        src="/brand/pgpz-circle-motif-on-light.svg"
        alt=""
        width={1600}
        height={900}
        aria-hidden="true"
        className="pointer-events-none absolute -right-72 -top-28 h-auto w-[44rem] max-w-none opacity-[0.14]"
        priority
        unoptimized
      />

      <section className="relative grid gap-10 rounded-3xl bg-[var(--brand-evergreen)] p-6 lg:grid-cols-[minmax(0,1.18fr)_minmax(24rem,0.82fr)] lg:items-start lg:gap-8 lg:p-9">
        <div className="pt-2 lg:pt-1">
          <p className="section-eyebrow text-[var(--zcash-gold-soft)]">PRETTY GOOD POLICY FOR ZCASH · COMMUNITY</p>
          <h1 className="mt-5 max-w-[39rem] text-[2.55rem] font-semibold leading-[1.08] tracking-[-0.045em] text-white sm:text-5xl">
            Connect. Learn. <br className="hidden lg:block" />Help shape Zcash policy.
          </h1>
          <p className="mt-8 max-w-[39rem] text-base leading-7 text-white/80 sm:text-lg sm:leading-7">
            Meet people working on privacy-focused policy, explore the member library, and take part in the Zcash conversation.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button
              size="lg"
              className="min-h-12 bg-[var(--zcash-gold)] px-6 text-[var(--brand-ink)] shadow-[0_16px_32px_-22px_rgba(138,90,0,0.8)] hover:bg-[var(--zcash-gold-soft)]"
              asChild
            >
              <Link href={signupHref}>
                <Mail className="h-4 w-4" aria-hidden="true" />
                Join the Community
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="min-h-12 border-[rgba(13,31,32,0.58)] bg-white/60 px-6" asChild>
              <Link href="#member-sign-in">
                Member sign in
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>

          <div className="mt-8 grid gap-5 sm:grid-cols-3">
            {[
              {
                title: "Secure access",
                body: "Sign in with a one-time secure link. No password needed.",
                icon: LockKeyhole,
              },
              {
                title: "Independent & nonpartisan",
                body: "A focused community for informed Zcash policy engagement.",
                icon: UsersRound,
              },
              {
                title: "Privacy-aware by design",
                body: "A short profile supports access to member resources.",
                icon: ShieldCheck,
              },
            ].map(({ title, body, icon: Icon }) => (
              <div key={title} className="flex min-w-0 items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgba(47,111,104,0.09)] text-[var(--brand-ink)]">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-xs font-semibold leading-5 text-white">{title}</h2>
                  <p className="mt-0.5 text-xs leading-5 text-white/75">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <CommunityMemberSignIn signupHref={signupHref} />
      </section>

      <section aria-labelledby="community-tools" className="my-8">
        <p className="section-eyebrow text-[var(--brand-teal)]">Get involved</p>
        <h2 id="community-tools" className="mt-2 text-2xl font-semibold text-[var(--brand-ink)]">A place to participate</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <RecentWorkCard eyebrow="Member resources" title="Build your understanding" summary="Explore the ZEC Shelf, a curated library of Zcash research, explainers, and practical tools." icon={BookOpenText}>
            <Link href={signupHref} className="font-semibold text-[var(--brand-teal)] underline underline-offset-4">Join to explore</Link>
          </RecentWorkCard>
          <RecentWorkCard eyebrow="Community connections" title="Take part in the conversation" summary="Connect with other members, join focused discussions, and invite people who care about financial privacy." icon={UsersRound}>
            <Link href="#member-sign-in" className="font-semibold text-[var(--brand-teal)] underline underline-offset-4">Sign in to participate</Link>
          </RecentWorkCard>
          <RecentWorkCard eyebrow="Public policy analysis" title="Read and share PGPZ updates" summary="Weekly Policy Memos and Special Updates are now on pgpz.org, open to everyone. No login required." icon={BookOpenText}>
            <Link href={PUBLIC_POLICY_UPDATES_URL} className="inline-flex items-center gap-2 font-semibold text-[var(--brand-teal)] underline underline-offset-4">Read policy updates <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
          </RecentWorkCard>
        </div>
      </section>

      <aside className="mt-2 flex flex-col gap-4 rounded-2xl border border-[rgba(71,85,105,0.18)] bg-[rgba(246,250,242,0.9)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[rgba(47,111,104,0.22)] bg-white/70 text-[var(--brand-ink)]">
            <Scale className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-[var(--brand-ink)]">Independent & nonpartisan</h2>
            <p className="mt-1 max-w-[46rem] text-xs leading-5 text-slate-600">
              Pretty Good Policy for Zcash is independent, nonpartisan, and not an official Zcash or
              Zcash Foundation website, service, or product.
            </p>
          </div>
        </div>
        <Link
          href="https://pgpz.org"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-2 self-start text-sm font-semibold text-[var(--brand-teal)] underline underline-offset-4 sm:self-center"
        >
          Learn more about Pretty Good Policy for Zcash
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </aside>
    </div>
  );
}
