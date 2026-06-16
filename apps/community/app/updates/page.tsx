import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, FileText, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMemberAccess } from "@/lib/member-access";
import { getPolicyUpdatesByCategory, policyUpdates } from "@/lib/policy-updates";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Policy Updates | PGPZ Community",
};

function MembershipRequired() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-5">
      <section className="glass-surface p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--brand-ink)] text-[var(--zcash-gold)]">
            <LockKeyhole className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="space-y-3">
            <p className="section-eyebrow text-[var(--brand-denim)]">Member archive</p>
            <h1 className="text-3xl font-semibold text-[var(--brand-ink)]">Membership required</h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-600">
              Weekly policy memos and special updates are available to active PGPZ Community members.
              Complete membership verification from the home page to unlock the archive.
            </p>
            <Button asChild>
              <Link href="/">Return to member home</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
export default async function UpdatesPage() {
  const access = await getMemberAccess();
  if (!access.authenticated) {
    redirect(`/signin?callbackUrl=${encodeURIComponent("/updates")}`);
  }

  if (!access.isMember) {
    return <MembershipRequired />;
  }

  const weekly = getPolicyUpdatesByCategory("weekly");
  const special = getPolicyUpdatesByCategory("special");
  const latest = policyUpdates[0];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 pb-14">
      <section className="community-hero">
        <div className="community-hero__frame">
          <div className="max-w-3xl space-y-5">
            <p className="section-eyebrow text-white/70">Member policy archive</p>
            <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
              Weekly memos and special updates for PGPZ members.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-white/78">
              View the latest policy briefing, browse prior weekly updates, and revisit special reports
              that frame major developments for the Zcash ecosystem.
            </p>
            <div className="flex flex-wrap gap-3 text-sm text-[var(--zcash-gold-soft)]">
              <span className="rounded-full border border-white/20 px-3 py-1">{weekly.length} weekly memo{weekly.length === 1 ? "" : "s"}</span>
              <span className="rounded-full border border-white/20 px-3 py-1">{special.length} special update{special.length === 1 ? "" : "s"}</span>
            </div>
          </div>
        </div>
      </section>

      {latest ? (
        <section className="glass-surface grid gap-5 p-6 lg:grid-cols-[0.42fr_1fr]">
          <Link
            href={latest.portalPath}
            className="relative block min-h-[18rem] overflow-hidden rounded-2xl border border-[rgba(245,168,0,0.28)] bg-white"
          >
            <Image
              src={latest.coverImage}
              alt={`${latest.shortTitle} cover`}
              fill
              sizes="(min-width: 1024px) 420px, 100vw"
              className="object-contain p-4"
              priority
            />
          </Link>
          <div className="flex flex-col justify-center gap-4">
            <p className="section-eyebrow text-[var(--brand-denim)]">Latest update</p>
            <div>
              <div className="mb-3 inline-flex rounded-full bg-[var(--brand-ink)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--zcash-gold)]">
                {latest.categoryLabel}
              </div>
              <h2 className="text-3xl font-semibold leading-tight text-[var(--brand-ink)]">
                {latest.title}
              </h2>
            </div>
            <p className="text-sm leading-6 text-slate-600">{latest.summary}</p>
            <div>
              <Button asChild>
                <Link href={latest.portalPath}>
                  Read update
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      <section className="grid gap-5 lg:grid-cols-2">
        {[
          { eyebrow: "Recurring", heading: "Weekly Policy Memos", updates: weekly },
          { eyebrow: "Featured", heading: "Special Updates", updates: special },
        ].map(({ eyebrow, heading, updates }) => (
          <div key={heading} className="muted-card p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="section-eyebrow text-[var(--brand-denim)]">{eyebrow}</p>
                <h2 className="mt-2 text-2xl font-semibold text-[var(--brand-ink)]">{heading}</h2>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--brand-ink)] text-[var(--zcash-gold)]">
                <FileText className="h-5 w-5" aria-hidden="true" />
              </div>
            </div>
            <div className="space-y-3">
              {updates.map((update) => (
                <Link
                  key={update.slug}
                  href={update.portalPath}
                  className="group block rounded-xl border bg-white/85 p-4 transition hover:border-[rgba(245,168,0,0.55)] hover:shadow-[0_18px_34px_-28px_rgba(30,30,30,0.4)]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                        {update.displayDate}
                      </div>
                      <h3 className="mt-2 text-base font-semibold text-[var(--brand-ink)] group-hover:text-[var(--brand-denim)]">
                        {update.shortTitle}
                      </h3>
                    </div>
                    <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-400 group-hover:text-[var(--brand-denim)]" aria-hidden="true" />
                  </div>
                  <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">{update.summary}</p>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
