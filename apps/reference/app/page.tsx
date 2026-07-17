import { Badge, Container, SectionHeading, Surface, buttonStyles } from "@pgpz/ui";
import {
  ArrowRight,
  Blocks,
  Check,
  Database,
  LockKeyhole,
  MailX,
  Settings2,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { ReferenceMark } from "@/components/ReferenceMark";

const proofPoints = [
  {
    icon: Settings2,
    title: "Configuration is the product boundary",
    body: "Identity, navigation, legal links, membership mode, and feature availability come from one validated public contract.",
  },
  {
    icon: Blocks,
    title: "Packages stay brand-neutral",
    body: "The application imports shared contracts and components without inheriting a branded alias, asset, workflow, or content record.",
  },
  {
    icon: Database,
    title: "Infrastructure remains replaceable",
    body: "Server resources sit behind app-owned adapters. This demo intentionally connects none of them to production systems.",
  },
] as const;

const safeDefaults = [
  ["Membership", "Externally managed demo"],
  ["Catalog", "Public and read-only"],
  ["Email delivery", "Disabled"],
  ["Search indexing", "Disabled"],
] as const;

export default function HomePage() {
  return (
    <>
      <Container className="pb-16 pt-8 sm:pb-24 sm:pt-14">
        <section className="reference-hero">
          <div className="reference-hero__copy">
            <div className="flex flex-wrap gap-2">
              <Badge tone="accent">Executable example</Badge>
              <Badge>Configuration first</Badge>
            </div>
            <h1 className="mt-7 max-w-4xl text-5xl font-semibold leading-[0.98] tracking-[-0.055em] text-[var(--foreground)] sm:text-6xl lg:text-7xl">
              A clean starting point for the next PGPZ site.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--muted)]">
              This neutral application proves that shared packages can travel without carrying Community or Coalition branding, membership logic, content, or infrastructure with them.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/zec-shelf" className={buttonStyles({ size: "lg" })}>
                Explore the reference shelf
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link href="/architecture" className={buttonStyles({ variant: "outline", size: "lg" })}>
                Inspect the boundaries
              </Link>
            </div>
          </div>

          <div className="reference-map" aria-label="Reference application dependency boundary">
            <div className="reference-map__heading">
              <ReferenceMark />
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/55">Dependency direction</p>
                <p className="mt-1 text-lg font-semibold text-white">Application → contracts → adapters</p>
              </div>
            </div>
            <div className="reference-map__stack">
              <div className="reference-map__node reference-map__node--active">
                <span>apps/reference</span>
                <Badge tone="success">Owns identity</Badge>
              </div>
              <span className="reference-map__connector" aria-hidden="true" />
              <div className="reference-map__node">
                <span>@pgpz/core · @pgpz/ui · @pgpz/zec-shelf</span>
                <Badge>Shared contracts</Badge>
              </div>
              <span className="reference-map__connector" aria-hidden="true" />
              <div className="reference-map__node reference-map__node--muted">
                <span>App-owned infrastructure adapters</span>
                <Badge tone="warning">Not connected</Badge>
              </div>
            </div>
            <div className="mt-5 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs leading-5 text-white/70">
              <LockKeyhole className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden="true" />
              Shared packages cannot import back into an application.
            </div>
          </div>
        </section>
      </Container>

      <section className="border-y border-[var(--border)] bg-white/55 py-16 sm:py-20">
        <Container>
          <SectionHeading
            eyebrow="What this proves"
            title="Reusable without becoming universal."
            description="The common surface is intentionally narrow. Each real site still owns the decisions that make its membership and operations distinct."
          />
          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {proofPoints.map(({ icon: Icon, title, body }, index) => (
              <Surface key={title} className="group p-6 sm:p-7">
                <div className="flex items-center justify-between">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="font-mono text-xs text-slate-400">0{index + 1}</span>
                </div>
                <h2 className="mt-8 text-xl font-semibold tracking-[-0.025em] text-[var(--foreground)]">{title}</h2>
                <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{body}</p>
              </Surface>
            ))}
          </div>
        </Container>
      </section>

      <Container className="py-16 sm:py-24">
        <div className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
          <Surface tone="subtle" className="p-7 sm:p-9">
            <Badge tone="success">Safe by default</Badge>
            <h2 className="mt-6 text-3xl font-semibold tracking-[-0.04em] text-[var(--foreground)]">
              Nothing here can reach a member or alter a production record.
            </h2>
            <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
              The deployed reference omits sign-in, admin routes, write handlers, and outbound delivery. Its ZEC Shelf is public, app-owned, and read-only.
            </p>
            <div className="mt-7 flex flex-wrap gap-3 text-sm font-semibold text-[var(--foreground)]">
              <span className="safe-chip"><MailX className="h-4 w-4" aria-hidden="true" /> Email off</span>
              <span className="safe-chip"><LockKeyhole className="h-4 w-4" aria-hidden="true" /> No accounts</span>
            </div>
          </Surface>

          <Surface className="overflow-hidden">
            <div className="border-b border-[var(--border)] px-6 py-5 sm:px-8">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--primary)]">Runtime posture</p>
            </div>
            <dl className="divide-y divide-[var(--border)]">
              {safeDefaults.map(([label, value]) => (
                <div key={label} className="flex flex-col gap-2 px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
                  <dt className="text-sm text-[var(--muted)]">{label}</dt>
                  <dd className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
                    <Check className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </Surface>
        </div>
      </Container>

      <Container className="pb-16 sm:pb-24">
        <Surface tone="dark" className="reference-cta overflow-hidden p-8 sm:p-12">
          <div className="relative z-10 max-w-3xl">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-[var(--accent)]">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </span>
            <h2 className="mt-7 font-display text-4xl leading-tight tracking-[-0.035em] sm:text-5xl">
              A starter should begin with choices, not cleanup.
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-7 text-white/68">
              Once this reference remains green through shared-package changes, it can become the source for a generator—without asking a new project to strip another site&apos;s assumptions first.
            </p>
            <Link href="/architecture" className={buttonStyles({ variant: "secondary", size: "lg", className: "mt-8" })}>
              See the configuration surface
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </Surface>
      </Container>
    </>
  );
}
