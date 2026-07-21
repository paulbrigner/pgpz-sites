import Link from "next/link";
import { BookOpenText, LockKeyhole } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import type { CuratedBriefing } from "@pgpz/x-monitor-core/contracts";
import { Button } from "@/components/ui/button";
import { XMonitorBriefings } from "@/components/x-monitor/XMonitorBriefings";
import { XMonitorSectionNav } from "@/components/x-monitor/XMonitorSectionNav";
import { getMemberAccess } from "@/lib/member-access";
import { canAccessCommunityXMonitor } from "@/lib/x-monitor-access";
import { isCommunityXMonitorBriefingsEnabled } from "@/lib/x-monitor-public";
import { createCommunityXMonitorClient } from "@/lib/x-monitor-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata = {
  title: "Topic Briefings | X Monitor | PGPZ Community",
  description: "PGPZ-curated, reviewed answers generated from monitored Zcash conversation on X.",
  robots: { index: false, follow: false },
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
            <p className="section-eyebrow text-[var(--brand-denim)]">Community intelligence</p>
            <h1 className="text-3xl font-semibold text-[var(--brand-ink)]">Membership required</h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-600">
              Topic Briefings are available to active PGPZ Community members and administrators.
              Complete membership verification from the home page to read published answers.
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

function UnavailableNotice() {
  return (
    <section className="muted-card p-8 text-center" role="status">
      <BookOpenText className="mx-auto h-8 w-8 text-[var(--brand-denim)]" aria-hidden="true" />
      <h2 className="mt-4 text-xl font-semibold text-[var(--brand-ink)]">
        Topic Briefings are temporarily unavailable
      </h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
        The last published briefings could not be loaded right now. Please try again shortly.
      </p>
    </section>
  );
}

export default async function XMonitorBriefingsPage() {
  if (!isCommunityXMonitorBriefingsEnabled()) notFound();

  const access = await getMemberAccess();
  if (!access.authenticated) {
    redirect(`/signin?callbackUrl=${encodeURIComponent("/x-monitor/briefings")}`);
  }
  if (!canAccessCommunityXMonitor(access.session?.capabilities)) {
    return <MembershipRequired />;
  }

  let briefings: CuratedBriefing[] | null = null;
  try {
    const result = await createCommunityXMonitorClient().curatedBriefings();
    briefings = result.items
      .filter((item) => item && typeof item.slug === "string" && typeof item.answer_text === "string")
      .sort((a, b) => a.order - b.order || a.question.localeCompare(b.question));
  } catch {
    briefings = null;
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-7 px-5 pb-14">
      <section className="community-hero">
        <div className="community-hero__frame">
          <div className="max-w-3xl space-y-5">
            <p className="section-eyebrow text-white/70">X Monitor · PGPZ reviewed</p>
            <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">Zcash Topic Briefings</h1>
            <p className="max-w-2xl text-base leading-7 text-white/78">
              Read PGPZ-curated answers generated from monitored Zcash conversation on X. Each
              published briefing includes its evidence window, review date, and cited posts.
            </p>
          </div>
        </div>
      </section>

      <XMonitorSectionNav active="briefings" />

      {briefings ? <XMonitorBriefings briefings={briefings} /> : <UnavailableNotice />}
    </div>
  );
}
