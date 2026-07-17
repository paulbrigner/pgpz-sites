import type { Metadata } from "next";
import { Badge, Container, SectionHeading, Surface } from "@pgpz/ui";
import { Check, CircleOff, Code2, Database, MailX, ShieldCheck } from "lucide-react";
import { referenceSiteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "Architecture",
  description: "The configuration and dependency boundaries proven by PGPZ Reference.",
  alternates: { canonical: "/architecture" },
};

const configurationRows = [
  ["Identity", "Name, canonical URL, neutral mark, colors"],
  ["Navigation", "Home, Architecture, feature-gated ZEC Shelf"],
  ["Membership", referenceSiteConfig.membershipMode],
  ["Features", "ZEC Shelf on; updates, newsletters, and directory off"],
  ["Legal", "Reference-owned terms, privacy, and environment notice"],
] as const;

const boundaries = [
  { icon: Database, title: "Data", copy: "No production table, bucket, catalog partition, or member record is referenced." },
  { icon: MailX, title: "Email", copy: "Delivery is explicitly disabled; there are no newsletter, invitation, or welcome handlers." },
  { icon: ShieldCheck, title: "Identity", copy: "The membership contract is declared, but no public authentication or account state is created." },
  { icon: CircleOff, title: "Mutations", copy: "There is no admin surface and the public catalog API exports only a cached GET response." },
] as const;

export default function ArchitecturePage() {
  return (
    <Container className="pb-20 pt-10 sm:pt-14">
      <SectionHeading
        eyebrow="Reference architecture"
        title="One-way dependencies. Explicit configuration. Replaceable adapters."
        description="The reference application is useful only if it proves that shared code remains portable without flattening the real differences between sites."
      />

      <div className="mt-10 grid gap-5 lg:grid-cols-[1.08fr_0.92fr]">
        <Surface className="p-6 sm:p-8">
          <div className="flex items-center justify-between gap-4">
            <Badge tone="accent">Client-safe SiteConfig</Badge>
            <Code2 className="h-5 w-5 text-[var(--primary)]" aria-hidden="true" />
          </div>
          <dl className="mt-7 divide-y divide-[var(--border)] border-y border-[var(--border)]">
            {configurationRows.map(([label, value]) => (
              <div key={label} className="grid gap-2 py-4 sm:grid-cols-[9rem_minmax(0,1fr)]">
                <dt className="text-sm font-semibold text-[var(--foreground)]">{label}</dt>
                <dd className="text-sm leading-6 text-[var(--muted)]">{value}</dd>
              </div>
            ))}
          </dl>
        </Surface>

        <Surface tone="dark" className="p-6 sm:p-8">
          <Badge className="border-white/15 bg-white/8 text-white/72">Dependency rule</Badge>
          <div className="mt-7 space-y-3" aria-label="Allowed dependency flow">
            {["apps/reference", "@pgpz/core + @pgpz/ui", "@pgpz/zec-shelf", "app-owned adapters"].map((label, index) => (
              <div key={label}>
                <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/6 px-4 py-4">
                  <span className="text-sm font-semibold text-white">{label}</span>
                  <span className="font-mono text-[0.65rem] text-white/45">0{index + 1}</span>
                </div>
                {index < 3 ? <div className="mx-auto h-3 w-px bg-white/20" aria-hidden="true" /> : null}
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm leading-7 text-white/65">
            Arrows never point back into an application. Infrastructure values stay in server-only configuration and cannot enter a client bundle.
          </p>
        </Surface>
      </div>

      <section className="mt-16 sm:mt-20">
        <SectionHeading
          eyebrow="Isolation checklist"
          title="The demo surface is intentionally smaller than the contract."
          description="Tests prove the broader configuration model. The deployed example turns on only what can be shown safely without identity, delivery, or writable storage."
        />
        <div className="mt-9 grid gap-4 sm:grid-cols-2">
          {boundaries.map(({ icon: Icon, title, copy }) => (
            <Surface key={title} tone="subtle" className="flex gap-4 p-6">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-[var(--primary)] shadow-sm">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="font-semibold text-[var(--foreground)]">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{copy}</p>
              </div>
            </Surface>
          ))}
        </div>
      </section>

      <Surface className="mt-16 flex flex-col gap-4 p-6 sm:mt-20 sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--primary)]">Acceptance signal</p>
          <p className="mt-2 text-lg font-semibold text-[var(--foreground)]">Both branded apps must remain green when this one changes.</p>
        </div>
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-800">
          <Check className="h-4 w-4" aria-hidden="true" /> Independent deployments preserved
        </span>
      </Surface>
    </Container>
  );
}
