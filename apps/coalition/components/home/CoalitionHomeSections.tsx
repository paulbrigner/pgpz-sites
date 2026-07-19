import Link from "next/link";
import {
  Code2,
  ExternalLink,
  FileText,
  Globe2,
  Landmark,
  Mail,
  Megaphone,
  Scale,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const policyPriorities = [
  {
    number: "01",
    icon: Landmark,
    title: "Primary policy contact",
    body: "Establish PGPZ as the clear home for policymakers, regulators, and industry stakeholders seeking to learn about Zcash.",
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
            <p className="section-eyebrow text-white/70">PGPZ COALITION</p>
            {authenticated ? (
              <span className="rounded-full border border-[rgba(245,168,0,0.45)] bg-[rgba(245,168,0,0.14)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--zcash-gold-soft)]">
                Partner workspace
              </span>
            ) : null}
          </div>
          <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
            A policy coordination home for Zcash ecosystem partners.
          </h1>
          <p className="max-w-2xl text-base leading-7 text-white/78">
            Join us in sharing resources, aligning messaging, and organizing coalition campaigns that help advance Zcash-focused policy in Washington, DC.
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
      <div className="overflow-hidden rounded-xl border border-[rgba(245,168,0,0.24)] bg-[linear-gradient(135deg,var(--brand-ink),#163E3C_58%,#2F6F68)] p-5 text-white shadow-[0_26px_48px_-32px_rgba(16,40,39,0.56)] md:p-6">
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
            <div className="absolute h-36 w-36 rounded-full border border-[rgba(245,168,0,0.32)]" aria-hidden="true" />
            <div className="relative flex h-28 w-28 flex-col items-center justify-center rounded-full border border-[rgba(245,168,0,0.64)] bg-[rgba(255,255,255,0.12)] text-center shadow-[0_20px_34px_-24px_rgba(0,0,0,0.58)]">
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
            <article key={priority.number} className="mt-4 rounded-lg border border-[rgba(245,168,0,0.32)] bg-[rgba(245,168,0,0.1)] p-4 lg:mx-auto lg:max-w-3xl">
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
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(245,168,0,0.16)] text-[var(--brand-denim)]">
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
