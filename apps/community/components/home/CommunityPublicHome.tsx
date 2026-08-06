"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  BookOpenText,
  CheckCircle2,
  ExternalLink,
  FileText,
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
import type { CommunityFeaturedPolicyUpdate } from "./CommunityHomeSections";

const COMMUNITY_HOME_CALLBACK = "/";
const CURATED_WEEKLY_FALLBACK = {
  publishedAt: "2026-07-27",
  emailPreheader: "Highlights from the week and what’s on our radar.",
} as const;

const statements = [
  {
    label: "CLARITY Act statement",
    href: "https://community.pgpz.org/resources/statements-for-the-record/2026-07-17-hfsc-clarity-act-statement-for-the-record.pdf",
  },
  {
    label: "FinCEN oversight statement",
    href: "https://community.pgpz.org/resources/statements-for-the-record/2026-07-21-hfsc-fincen-oversight-statement-for-the-record.pdf",
  },
] as const;

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

const formatRecentWorkDate = (publishedAt: string | null | undefined) => {
  if (!publishedAt) return null;
  const date = new Date(`${publishedAt}T12:00:00Z`);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
};

export function CommunityPublicHome({
  signupHref,
  featuredPolicyUpdates,
}: {
  signupHref: string;
  featuredPolicyUpdates: CommunityFeaturedPolicyUpdate[];
}) {
  const latestWeekly = featuredPolicyUpdates.find(
    (update) => update.categoryLabel === "Weekly Policy Memo",
  );
  const displayedWeekly =
    latestWeekly && latestWeekly.publishedAt >= CURATED_WEEKLY_FALLBACK.publishedAt
      ? latestWeekly
      : CURATED_WEEKLY_FALLBACK;
  const latestWeeklyDate = formatRecentWorkDate(displayedWeekly.publishedAt);

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

      <section className="relative grid gap-10 pt-4 lg:grid-cols-[minmax(0,1.18fr)_minmax(24rem,0.82fr)] lg:items-start lg:gap-8 lg:pt-9">
        <div className="pt-2 lg:pt-1">
          <p className="section-eyebrow text-[var(--brand-teal)]">PRETTY GOOD POLICY FOR ZCASH · COMMUNITY</p>
          <h1 className="mt-5 max-w-[39rem] text-[2.55rem] font-semibold leading-[1.08] tracking-[-0.045em] text-[var(--brand-ink)] sm:text-5xl">
            A member home for <br className="hidden lg:block" />Zcash policy engagement.
          </h1>
          <p className="mt-8 max-w-[39rem] text-base leading-7 text-slate-600 sm:text-lg sm:leading-7">
            Follow Pretty Good Policy for Zcash updates, access member resources, and help coordinate clear,
            privacy-focused policy work across the Zcash ecosystem.
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
                  <h2 className="text-xs font-semibold leading-5 text-[var(--brand-ink)]">{title}</h2>
                  <p className="mt-0.5 text-xs leading-5 text-slate-600">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <CommunityMemberSignIn signupHref={signupHref} />
      </section>

      <section aria-labelledby="recent-community-work" className="mt-10">
        <div className="text-center">
          <p className="section-eyebrow text-[var(--brand-teal)]">Recent work</p>
          <h2 id="recent-community-work" className="mt-2 text-2xl font-semibold tracking-[-0.025em] text-[var(--brand-ink)] sm:text-3xl">
            A preview of our latest policy work
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Member access includes policy updates, coordination spaces, and early resources.
          </p>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <RecentWorkCard
            eyebrow="Weekly policy memo"
            title={`Weekly Policy Memo${latestWeeklyDate ? ` · ${latestWeeklyDate}` : ""}`}
            summary={displayedWeekly.emailPreheader}
            icon={BookOpenText}
          >
            <Link
              href="#member-sign-in"
              className="inline-flex w-full items-center gap-2 rounded-lg bg-[rgba(245,168,0,0.11)] px-3 py-2 text-xs font-semibold text-[var(--brand-slate)] transition hover:bg-[rgba(245,168,0,0.18)]"
            >
              <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
              Members only
            </Link>
          </RecentWorkCard>

          <RecentWorkCard
            eyebrow="Statements for the record"
            title="Statements for the Record · Jul 24"
            summary="Public statements following the July 17 CLARITY Act and July 21 FinCEN oversight hearings."
            icon={FileText}
          >
            <div className="flex flex-wrap gap-x-3 gap-y-2 text-xs font-semibold">
              {statements.map((statement) => (
                <Link
                  key={statement.href}
                  href={statement.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={statement.label}
                  className="inline-flex items-center gap-1 text-[var(--brand-denim)] underline decoration-[rgba(71,85,105,0.45)] underline-offset-4 hover:text-[var(--brand-ink)]"
                >
                  {statement.label === "CLARITY Act statement" ? "July 17 statement" : "July 21 statement"}
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </Link>
              ))}
            </div>
          </RecentWorkCard>

          <RecentWorkCard
            eyebrow="Explainer"
            title="How Zcash Works · Updated Aug 2"
            summary="A clear, source-backed guide to shielded transactions, proofs, and settlement."
            icon={FileText}
          >
            <Link
              href="/zec-shelf/how-zcash-works.html"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-between gap-2 rounded-lg bg-[rgba(47,111,104,0.08)] px-3 py-2 text-xs font-semibold text-[var(--brand-denim)] transition hover:bg-[rgba(47,111,104,0.14)] hover:text-[var(--brand-ink)]"
            >
              Read the public guide
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
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
