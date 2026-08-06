import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  Code2,
  FileCheck2,
  FileText,
  Globe2,
  Handshake,
  Landmark,
  LogIn,
  Mail,
  Megaphone,
  Scale,
  ShieldCheck,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const publicCoalitionWork = [
  {
    icon: FileCheck2,
    eyebrow: "CLARITY ACT COORDINATION",
    title: "Senate sign-on coordination · July 27",
    body: "Partner alignment around a CLARITY Act sign-on for Senate leadership.",
    status: "Coordination in progress",
  },
  {
    icon: TrendingUp,
    eyebrow: "MARKET STRUCTURE",
    title: "Market structure coordination · July 28",
    body: "Continued partner discussion on a workable policy framework for digital assets.",
    status: "Partner alignment in progress",
  },
  {
    icon: UsersRound,
    eyebrow: "POLICY WORKING GROUPS",
    title: "Eight policy groups · Ongoing",
    body: "Focused groups advancing privacy, tax, market structure, developer policy, and more.",
    status: "Ongoing working groups",
  },
];

const coalitionPrinciples = [
  {
    icon: Handshake,
    title: "Aligned action",
    body: "Coordinate evidence and messaging across the Zcash ecosystem.",
  },
  {
    icon: ShieldCheck,
    title: "Privacy by design",
    body: "Advance policy that protects privacy, security, and financial freedom.",
  },
  {
    icon: UsersRound,
    title: "Partner led",
    body: "Built for independent, mission-focused ecosystem partners.",
  },
];

export function CoalitionPublicHome() {
  return (
    <section className="coalition-public-home" aria-labelledby="coalition-public-heading">
      <Image
        src="/brand/pgpz-circle-motif-on-light.svg"
        alt=""
        width={1600}
        height={900}
        aria-hidden="true"
        className="pointer-events-none absolute -right-72 -top-28 z-0 h-auto w-[44rem] max-w-none opacity-[0.12]"
        priority
        unoptimized
      />

      <div className="relative z-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(25rem,0.92fr)] lg:items-center lg:gap-7">
        <div>
          <p className="section-eyebrow text-[var(--brand-denim)]">
            PRETTY GOOD POLICY FOR ZCASH · COALITION
          </p>
          <h1
            id="coalition-public-heading"
            className="mt-8 max-w-[36rem] text-[clamp(2.6rem,4.2vw,3.6rem)] font-semibold leading-[1.04] tracking-[-0.045em] text-[var(--brand-ink)]"
          >
            Coordinate policy <br className="hidden lg:block" />action for Zcash.
          </h1>
          <p className="mt-4 max-w-[36rem] text-base leading-7 text-slate-600 sm:text-lg sm:leading-7">
            The Pretty Good Policy for Zcash Coalition brings together partners to align
            messaging, share evidence, and coordinate campaigns that protect privacy and
            advance sound policy.
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button
              size="lg"
              className="min-h-12 justify-center bg-[var(--zcash-gold)] px-6 text-[var(--brand-ink)] shadow-[0_18px_30px_-22px_rgba(13,31,32,0.5)] hover:bg-[var(--zcash-gold-soft)]"
              asChild
            >
              <Link href="/signin?reason=signup">
                <Mail className="h-4 w-4" aria-hidden="true" />
                Request partner access
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="min-h-12 justify-center border-[rgba(13,31,32,0.62)] bg-white/55 px-6 text-[var(--brand-ink)] hover:bg-white"
              asChild
            >
              <Link href="/signin">
                Member sign in
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>

          <div className="mt-7 grid gap-5 sm:grid-cols-3">
            {coalitionPrinciples.map((principle) => {
              const Icon = principle.icon;
              return (
                <div key={principle.title} className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgba(47,111,104,0.1)] text-[var(--brand-denim)] ring-1 ring-[rgba(47,111,104,0.1)]">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div>
                    <h2 className="text-sm font-semibold text-[var(--brand-ink)]">{principle.title}</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-600">{principle.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <article className="coalition-action-card lg:max-w-[37rem] lg:justify-self-start">
          <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_7.5rem] sm:items-start">
            <div>
              <p className="section-eyebrow text-[var(--brand-denim)]">CURRENT COALITION ACTION</p>
              <h2 className="mt-4 text-2xl font-semibold leading-tight tracking-[-0.02em] text-[var(--brand-ink)] sm:text-[1.7rem]">
                CLARITY Act sign-on coordination
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                On July 27, 2026, coalition partners coordinated around a CLARITY Act sign-on for
                Senate leadership, aligning policy context and next steps.
              </p>
              <Button
                variant="outline"
                className="mt-5 min-h-11 border-[rgba(47,111,104,0.26)] bg-[var(--brand-paper)] text-[var(--brand-ink)] hover:bg-white"
                asChild
              >
                <Link href="/signin?reason=signup">
                  Request access to participate
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>

            <div className="relative mx-auto flex h-32 w-28 items-center justify-center rounded-lg border border-[rgba(47,111,104,0.16)] bg-white text-[var(--brand-denim)] shadow-[0_22px_32px_-22px_rgba(13,31,32,0.38)] sm:mt-4">
              <FileCheck2 className="h-14 w-14 stroke-[1.35]" aria-hidden="true" />
              <span className="absolute -bottom-3 -right-3 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--zcash-gold-soft)] text-[var(--brand-denim)] ring-4 ring-white">
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              </span>
            </div>
          </div>

          <div className="mt-6 border-t border-[rgba(47,111,104,0.16)] pt-4">
            <Link
              href="/signin"
              className="group flex items-center justify-between gap-4 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--zcash-gold)] focus-visible:ring-offset-4"
            >
              <span className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgba(47,111,104,0.1)] text-[var(--brand-denim)]">
                  <UsersRound className="h-4 w-4" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-[var(--brand-ink)]">Member workspace</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-600">
                    Sign in to access working resources and coordination materials.
                  </span>
                </span>
              </span>
              <ArrowRight className="h-5 w-5 shrink-0 text-[var(--brand-ink)] transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </Link>
          </div>
        </article>
      </div>

      <section className="relative z-10 mt-8" aria-labelledby="recent-coalition-work-heading">
        <div className="text-center">
          <p className="section-eyebrow text-[var(--brand-denim)]">RECENT COALITION WORK</p>
          <h2 id="recent-coalition-work-heading" className="mt-2 text-2xl font-semibold tracking-[-0.025em] text-[var(--brand-ink)] sm:text-3xl">
            Coordinated policy work in progress
          </h2>
          <p className="mx-auto mt-1 max-w-2xl text-sm leading-5 text-slate-600">
            A public-safe preview of current areas where coalition partners are working together.
          </p>
        </div>

        <div className="mt-3 grid gap-4 md:grid-cols-3">
          {publicCoalitionWork.map((work) => {
            const Icon = work.icon;
            return (
              <article key={work.title} className="coalition-work-card">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[rgba(47,111,104,0.08)] text-[var(--brand-ink)] ring-1 ring-[rgba(47,111,104,0.06)]">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="section-eyebrow text-[var(--brand-denim)]">{work.eyebrow}</p>
                    <h3 className="mt-2 text-base font-semibold leading-6 text-[var(--brand-ink)]">{work.title}</h3>
                    <p className="mt-2 text-sm leading-5 text-slate-600">{work.body}</p>
                    <p className="mt-3 rounded-lg bg-[linear-gradient(90deg,rgba(244,183,40,0.13),rgba(244,183,40,0.05))] px-3 py-1.5 text-xs font-medium text-slate-600">
                      {work.status}
                    </p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <aside className="coalition-independence-strip relative z-10 mt-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[rgba(47,111,104,0.18)] bg-white/65 text-[var(--brand-denim)]">
          <Scale className="h-6 w-6" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-[var(--brand-ink)]">Independent and not affiliated</h2>
          <p className="mt-1 max-w-4xl text-xs leading-5 text-slate-600">
            Pretty Good Policy for Zcash is independent, nonpartisan, and not an official Zcash or
            Zcash Foundation website, service, or product.
          </p>
        </div>
        <Link
          href="https://pgpz.org"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-[var(--brand-denim)] underline decoration-[rgba(47,111,104,0.4)] underline-offset-4 hover:text-[var(--brand-ink)]"
        >
          Learn more about Pretty Good Policy for Zcash
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </aside>
    </section>
  );
}

const policyPriorities = [
  {
    number: "01",
    icon: Landmark,
    title: "Primary policy contact",
    body: "Establish Pretty Good Policy for Zcash as a clear, independent resource for policymakers, regulators, and industry stakeholders seeking to learn about Zcash.",
  },
  {
    number: "02",
    icon: Globe2,
    title: "Global advocacy",
    body: "Coordinate through one vehicle so ecosystem partners can move beyond scattershot outreach and speak with one voice.",
  },
  {
    number: "03",
    icon: Scale,
    title: "Civil liberties",
    body: "Advance the case for privacy-preserving infrastructure as blockchain adoption expands into mainstream systems.",
  },
  {
    number: "04",
    icon: ShieldCheck,
    title: "Policy response",
    body: "Promote Zcash ecosystem growth while responding to policy that could inhibit privacy-preserving networks.",
  },
  {
    number: "05",
    icon: Code2,
    title: "Protect developers",
    body: "Defend clear safe harbors, due process, and limits on enforcement for builders of non-custodial privacy software.",
  },
];

export function CoalitionHero({ authenticated }: { authenticated: boolean }) {
  return (
    <section className="coalition-hero">
      <div className="coalition-hero__frame">
        <div className="coalition-hero__content max-w-3xl space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <p className="section-eyebrow text-white/70">PRETTY GOOD POLICY FOR ZCASH · COALITION</p>
            {authenticated ? (
              <span className="rounded-full border border-[rgba(47,111,104,0.45)] bg-[rgba(47,111,104,0.14)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--zcash-gold-soft)]">
                Partner workspace
              </span>
            ) : null}
          </div>
          <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
            A policy coordination home for Zcash ecosystem partners.
          </h1>
          <p className="max-w-2xl text-base leading-7 text-white/78">
            Share evidence, align messaging, and coordinate practical campaigns that advance privacy-preserving policy for the Zcash ecosystem in Washington and beyond.
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
                  Request access
                </Link>
              </Button>
              <Button size="lg" variant="outline" className="border-white/40 text-white hover:bg-white/10" asChild>
                <Link href="/signin">
                  Member sign in
                  <LogIn className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function CoalitionPolicyPriorities() {
  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="section-eyebrow text-[var(--brand-denim)]">POLICY PRIORITIES</p>
          <h2 className="mt-2 text-2xl font-semibold text-[var(--brand-ink)]">Five priorities guiding coalition work</h2>
        </div>
        <p className="max-w-2xl text-sm leading-6 text-slate-600">
          These priorities connect public education, advocacy, civil liberties, policy response, and developer protection.
        </p>
      </div>
      <div className="overflow-hidden rounded-xl border border-[rgba(47,111,104,0.24)] bg-[linear-gradient(135deg,var(--brand-ink),#163E3C_58%,#2F6F68)] p-5 text-white shadow-[0_26px_48px_-32px_rgba(16,40,39,0.56)] md:p-6">
        <div className="grid gap-4 lg:grid-cols-[1fr_14rem_1fr] lg:items-center">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            {policyPriorities.slice(0, 2).map((priority) => {
              const Icon = priority.icon;
              return (
                <article key={priority.number} className="rounded-lg border border-white/14 bg-white/9 p-4 shadow-[0_18px_32px_-28px_rgba(0,0,0,0.5)] backdrop-blur">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--zcash-gold)] text-xs font-bold text-[var(--brand-ink)]">
                      {priority.number}
                    </span>
                    <Icon className="h-5 w-5 shrink-0 text-[var(--zcash-gold-soft)]" aria-hidden="true" />
                    <h3 className="text-sm font-semibold text-white">{priority.title}</h3>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-white/72">{priority.body}</p>
                </article>
              );
            })}
          </div>

          <div className="relative flex min-h-48 items-center justify-center py-4">
            <div className="absolute h-48 w-48 rounded-full border border-white/12" aria-hidden="true" />
            <div className="absolute h-36 w-36 rounded-full border border-[rgba(47,111,104,0.32)]" aria-hidden="true" />
            <div className="relative flex h-28 w-28 flex-col items-center justify-center rounded-full border border-[rgba(47,111,104,0.64)] bg-[rgba(255,255,255,0.12)] text-center shadow-[0_20px_34px_-24px_rgba(0,0,0,0.58)]">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--zcash-gold-soft)]">PGPZ</span>
              <span className="mt-1 text-sm font-semibold leading-5 text-white">Policy Engine</span>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            {policyPriorities.slice(2, 4).map((priority) => {
              const Icon = priority.icon;
              return (
                <article key={priority.number} className="rounded-lg border border-white/14 bg-white/9 p-4 shadow-[0_18px_32px_-28px_rgba(0,0,0,0.5)] backdrop-blur">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--zcash-gold)] text-xs font-bold text-[var(--brand-ink)]">
                      {priority.number}
                    </span>
                    <Icon className="h-5 w-5 shrink-0 text-[var(--zcash-gold-soft)]" aria-hidden="true" />
                    <h3 className="text-sm font-semibold text-white">{priority.title}</h3>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-white/72">{priority.body}</p>
                </article>
              );
            })}
          </div>
        </div>

        {policyPriorities.slice(4).map((priority) => {
          const Icon = priority.icon;
          return (
            <article key={priority.number} className="mt-4 rounded-lg border border-[rgba(47,111,104,0.32)] bg-[rgba(47,111,104,0.1)] p-4 lg:mx-auto lg:max-w-3xl">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <div className="flex items-center gap-3 sm:min-w-52">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--zcash-gold)] text-xs font-bold text-[var(--brand-ink)]">
                    {priority.number}
                  </span>
                  <Icon className="h-5 w-5 shrink-0 text-[var(--zcash-gold-soft)]" aria-hidden="true" />
                  <h3 className="text-sm font-semibold text-white">{priority.title}</h3>
                </div>
                <p className="text-sm leading-6 text-white/76">{priority.body}</p>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function CoalitionWorkstreams() {
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-[var(--brand-ink)]">Coalition workstreams</h2>
      <div className="grid gap-4 lg:grid-cols-3">
        {[
          {
            icon: FileText,
            eyebrow: "RESOURCE LIBRARY",
            title: "Access policy materials",
            body: "View explainers, backgrounders, meeting notes, and partner-approved materials that help policymakers understand Zcash and the importance of financial privacy.",
          },
          {
            icon: Megaphone,
            eyebrow: "MESSAGING",
            title: "Contribute and refer to key messaging",
            body: "Sync up on messaging and talking points before key hearings, markups, sign-on letters, agency engagement, and public education events.",
          },
          {
            icon: ShieldCheck,
            eyebrow: "CAMPAIGNS",
            title: "Engage in targeted policy work",
            body: "Support coalition policy campaigns, see action items and follow-ups, and keep ecosystem partners moving from shared strategy to action in Washington.",
          },
        ].map((workstream) => {
          const Icon = workstream.icon;
          return (
            <article key={workstream.eyebrow} className="muted-card flex flex-col p-5">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(47,111,104,0.16)] text-[var(--brand-denim)]">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <p className="section-eyebrow text-[var(--brand-denim)]">{workstream.eyebrow}</p>
              <h3 className="mt-3 text-lg font-semibold text-[var(--brand-ink)]">{workstream.title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-600">{workstream.body}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
