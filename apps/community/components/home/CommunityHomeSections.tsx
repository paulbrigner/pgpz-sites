import Image from "next/image";
import Link from "next/link";
import { Activity, ExternalLink, FileText, Mail, MessageCircle } from "lucide-react";
import { ReferralInviteCard } from "@/components/referrals/ReferralInviteCard";
import { Button } from "@/components/ui/button";

export type CommunityHeroFeature = {
  title: string;
  href: string;
  caption: string;
  imageSrc: string;
  imageAlt: string;
  imageFit: string;
};

export type CommunityMemberResource = {
  href: string;
  label: string;
  detail: string;
  category: string;
};

export function CommunityHero({
  authenticated,
  signupHref,
  feature,
  features,
  activeIndex,
}: {
  authenticated: boolean;
  signupHref: string;
  feature: CommunityHeroFeature;
  features: CommunityHeroFeature[];
  activeIndex: number;
}) {
  const featureImage = (
    <Image
      src={feature.imageSrc}
      alt={feature.imageAlt}
      width={520}
      height={360}
      priority={activeIndex === 0}
      className={`h-full w-full ${feature.imageFit === "contain" ? "object-contain" : "object-cover"}`}
    />
  );

  return (
    <section className="community-hero">
      <div className="community-hero__frame community-hero__frame--with-report">
        <div className="community-hero__content max-w-3xl space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <p className="section-eyebrow text-white/70">PGPZ COMMUNITY</p>
            {authenticated ? (
              <span className="rounded-full border border-[rgba(245,168,0,0.45)] bg-[rgba(245,168,0,0.14)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--zcash-gold-soft)]">
                Early beta
              </span>
            ) : null}
          </div>
          <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
            A member home for Zcash policy engagement.
          </h1>
          <p className="max-w-2xl text-base leading-7 text-white/78">
            Follow PGPZ updates, access member resources, and help coordinate
            privacy-focused policy work for Zcash as PGP* for Zcash takes shape.
          </p>
          {!authenticated ? (
            <div className="flex flex-wrap gap-3">
              <Button
                size="lg"
                className="bg-[var(--zcash-gold)] text-[var(--brand-ink)] hover:bg-[var(--zcash-gold-soft)]"
                asChild
              >
                <Link href={signupHref}>
                  <Mail className="h-4 w-4" aria-hidden="true" />
                  Join with email
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
        <div className="community-hero__visual" aria-label="Featured PGPZ updates">
          {feature.href ? (
            <Link
              href={feature.href}
              className="community-hero__feature-card"
              aria-label={`View ${feature.title}`}
            >
              {featureImage}
            </Link>
          ) : (
            <div className="community-hero__feature-card" aria-label={feature.title}>
              {featureImage}
            </div>
          )}
          {feature.href ? (
            <Link href={feature.href} className="community-hero__feature-caption">
              {feature.caption}
            </Link>
          ) : (
            <p className="community-hero__feature-caption">{feature.caption}</p>
          )}
          <div className="flex gap-2" aria-hidden="true">
            {features.map((slide, index) => (
              <span
                key={slide.title}
                className={`h-1.5 rounded-full transition-all ${
                  index === activeIndex ? "w-8 bg-[var(--zcash-gold)]" : "w-3 bg-white/35"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function CommunityMemberResources({
  resources,
  xMonitorEnabled = false,
}: {
  resources: CommunityMemberResource[];
  xMonitorEnabled?: boolean;
}) {
  return (
    <>
      <ReferralInviteCard />

      {xMonitorEnabled ? (
        <section className="glass-surface flex flex-col gap-5 p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--brand-ink)] text-[var(--zcash-gold)]">
              <Activity className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="section-eyebrow text-[var(--brand-denim)]">Community intelligence</p>
              <h2 className="mt-3 text-xl font-semibold text-[var(--brand-ink)]">
                Follow focused Zcash conversation on X
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                X Monitor brings captured posts, generated summaries, and activity trends into a
                read-only member view with no direct access to the monitoring backend.
              </p>
            </div>
          </div>
          <Button className="shrink-0" asChild>
            <Link href="/x-monitor">
              Open X Monitor
              <Activity className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </section>
      ) : null}

      <section className="glass-surface grid gap-6 p-6 lg:grid-cols-[1fr_220px] lg:items-center">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--brand-ink)] text-[var(--zcash-gold)]">
            <MessageCircle className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="section-eyebrow text-[var(--brand-denim)]">SIGNAL GROUP</p>
            <h2 className="mt-3 text-xl font-semibold text-[var(--brand-ink)]">
              Join the members-only Signal group
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Scan the QR code from your phone or open the secure Signal link for timely PGPZ community
              coordination, quick updates, and member-to-member conversation.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button asChild>
                <Link
                  href="https://signal.group/#CjQKIEvyw3Ze5YXfGya1u442-BQLrXrN8s7dHoTRk3Jh-8r9EhAhSfVI2Umy4mA1Hq2VFDe_"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open Signal link
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
        <div className="justify-self-start rounded-2xl border border-[rgba(245,168,0,0.34)] bg-white p-3 shadow-[0_18px_36px_-28px_rgba(30,30,30,0.48)] lg:justify-self-end">
          <Image
            src="/community-signal-qr.png"
            alt="QR code to join the PGPZ Community Signal group"
            width={192}
            height={192}
            className="h-48 w-48 rounded-xl"
          />
        </div>
      </section>

      <section className="glass-surface p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <p className="section-eyebrow text-[var(--brand-denim)]">Member policy updates</p>
            <h2 className="text-2xl font-semibold text-[var(--brand-ink)]">
              Weekly memos and special updates
            </h2>
            <p className="max-w-3xl text-sm leading-6 text-slate-600">
              PGPZ members can read the latest weekly policy memo, browse special reports, and return
              to prior updates at any time from the archive.
            </p>
          </div>
          <Button asChild>
            <Link href="/updates">
              View full archive
              <FileText className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {resources.map((resource) => (
            <Link
              key={resource.href}
              href={resource.href}
              className="group rounded-2xl border bg-white/85 p-5 transition hover:border-[rgba(245,168,0,0.55)] hover:shadow-[0_20px_36px_-28px_rgba(30,30,30,0.4)]"
            >
              <div className="mb-3 inline-flex rounded-full bg-[var(--brand-ink)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--zcash-gold)]">
                {resource.category}
              </div>
              <h3 className="text-lg font-semibold text-[var(--brand-ink)] group-hover:text-[var(--brand-denim)]">
                {resource.label}
              </h3>
              <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">
                {resource.detail}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}

export function CommunityPillars({ resources }: { resources: CommunityMemberResource[] }) {
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-[var(--brand-ink)]">The three pillars of PGPZ</h2>
      <div className="grid gap-4 lg:grid-cols-3">
        {[
          {
            eyebrow: "FOCUSED CONVENINGS",
            title: "Bringing policy conversations into focus",
            body: "PGPZ will continue the PGP* policy convening series in a more Zcash-focused format, bringing policymakers together with experts on privacy-preserving digital cash, practical compliance, civil liberties, and public-interest technology.",
            note: "The Cypherpunk Policy Dinner is one example of this pillar in action.",
          },
          {
            eyebrow: "MEMBER RESOURCES",
            title: "A shared home for Zcash policy work",
            body: "This community site will grow into a place for updates, resource links, member notes, event materials, and practical tools for people supporting Zcash policy engagement.",
            resourceLinks: resources,
          },
          {
            eyebrow: "PGPZ COALITION",
            title: "Coordinated policy engagement",
            body: "PGPZ will also include a smaller, action-oriented coalition of policy professionals and active advocates focused on policymaker education, advocacy strategy, and practical coordination around Zcash.",
          },
        ].map((pillar) => (
          <article key={pillar.eyebrow} className="muted-card flex flex-col p-5">
            <p className="section-eyebrow text-[var(--brand-denim)]">{pillar.eyebrow}</p>
            <h3 className="mt-3 text-lg font-semibold text-[var(--brand-ink)]">{pillar.title}</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">{pillar.body}</p>
            {pillar.resourceLinks ? (
              <div className="mt-5 space-y-3 border-t border-[rgba(245,168,0,0.24)] pt-4">
                {pillar.resourceLinks.map((resource) => (
                  <Link
                    key={resource.href}
                    href={resource.href}
                    className="flex items-center gap-3 text-sm font-medium text-[var(--brand-denim)] transition-colors hover:text-[var(--zcash-gold-deep)]"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--brand-ink)] text-[var(--zcash-gold)]">
                      <FileText className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block">{resource.label}</span>
                      <span className="block truncate text-xs font-normal text-slate-600">
                        {resource.detail}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            ) : null}
            {pillar.note ? (
              <p className="mt-5 border-t border-[rgba(245,168,0,0.24)] pt-4 text-xs font-medium leading-5 text-[var(--brand-denim)]">
                {pillar.note}
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

export function CommunityClosingCards() {
  return (
    <section className="grid gap-5 lg:grid-cols-2">
      <article className="glass-item p-6">
        <p className="section-eyebrow text-[var(--brand-denim)]">COMING NEXT</p>
        <h2 className="mt-3 text-xl font-semibold text-[var(--brand-ink)]">Building the next version</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Future versions of the PGPZ Community will add richer member profiles, additional sign-up and verification options beyond X, resource libraries, event pages, and more ways for members to participate in Zcash policy work.
        </p>
      </article>

      <article className="glass-item p-6">
        <p className="section-eyebrow text-[var(--brand-denim)]">GET INVOLVED</p>
        <h2 className="mt-3 text-xl font-semibold text-[var(--brand-ink)]">Help shape the policy community</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Have a policy resource, event idea, research question, or introduction that could help policymakers better understand Zcash? Share it with the PGPZ team as we build the next version of the community site.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button asChild>
            <Link href="mailto:admin@pgpz.org?subject=PGPZ%20Community%20Feedback">
              Share feedback
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="https://pgpz.org" target="_blank" rel="noopener noreferrer">
              Visit PGPZ.org
              <ExternalLink className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </article>
    </section>
  );
}
