import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import type {
  ActivityTrendsResponse,
  FeedResponse,
  WindowSummary,
} from "@pgpz/x-monitor-core/contracts";
import { Button } from "@/components/ui/button";
import { XMonitorActivity } from "@/components/x-monitor/XMonitorActivity";
import { XMonitorFeed } from "@/components/x-monitor/XMonitorFeed";
import { XMonitorFilters } from "@/components/x-monitor/XMonitorFilters";
import { XMonitorSummaries } from "@/components/x-monitor/XMonitorSummaries";
import { XMonitorSectionNav } from "@/components/x-monitor/XMonitorSectionNav";
import { getMemberAccess } from "@/lib/member-access";
import { canAccessCommunityXMonitor } from "@/lib/x-monitor-access";
import {
  buildCommunityXMonitorHref,
  communityXMonitorActivityFeedQuery,
  parseCommunityXMonitorQuery,
  type CommunityXMonitorSearchParams,
} from "@/lib/x-monitor-query";
import {
  isCommunityXMonitorBriefingsEnabled,
  isCommunityXMonitorEnabled,
} from "@/lib/x-monitor-public";
import {
  createCommunityXMonitorClient,
} from "@/lib/x-monitor-server";
import {
  CommunityXMonitorSemanticBusyError,
  CommunityXMonitorSemanticLimitError,
  queryCommunityXMonitorSemanticForMember,
} from "@/lib/x-monitor-semantic-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata = {
  title: "X Monitor | PGPZ Community",
  description: "Read-only monitoring of focused Zcash conversations on X for PGPZ Community members.",
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
              X Monitor is available to active PGPZ Community members and administrators.
              Complete membership verification from the home page to open the monitored feed.
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

function UnavailableNotice({ anchor = false }: { anchor?: boolean }) {
  return (
    <section
      className={`muted-card p-6${anchor ? " scroll-mt-24" : ""}`}
      id={anchor ? "x-monitor-feed" : undefined}
      role="status"
    >
      <h2 className="text-lg font-semibold text-[var(--brand-ink)]">X Monitor is temporarily unavailable</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Fresh X Monitor data is not available right now. Please try again shortly.
      </p>
    </section>
  );
}

function SemanticLimitNotice() {
  return (
    <section className="muted-card scroll-mt-24 p-6" id="x-monitor-feed" role="status">
      <h2 className="text-lg font-semibold text-[var(--brand-ink)]">
        Semantic search limit reached
      </h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Semantic search has a usage limit to protect the shared service. Please wait and try again;
        keyword search remains available now.
      </p>
    </section>
  );
}

function SemanticBusyNotice() {
  return (
    <section className="muted-card scroll-mt-24 p-6" id="x-monitor-feed" role="status">
      <h2 className="text-lg font-semibold text-[var(--brand-ink)]">
        Semantic search is already running
      </h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        An identical search is still being prepared. Please retry in a moment;
        keyword search remains available now.
      </p>
    </section>
  );
}

export default async function XMonitorPage({
  searchParams,
}: {
  searchParams?: Promise<CommunityXMonitorSearchParams>;
}) {
  if (!isCommunityXMonitorEnabled()) notFound();

  const access = await getMemberAccess();
  if (!access.authenticated) {
    redirect(`/signin?callbackUrl=${encodeURIComponent("/x-monitor")}`);
  }
  if (!canAccessCommunityXMonitor(access.session?.capabilities)) {
    return <MembershipRequired />;
  }

  const query = parseCommunityXMonitorQuery((await searchParams) || {});
  let feed: FeedResponse | null = null;
  let summaries: WindowSummary[] = [];
  let trends: ActivityTrendsResponse | null = null;
  let configurationAvailable = true;
  let semanticBusy = false;
  let semanticLimitReached = false;

  try {
    const client = createCommunityXMonitorClient();
    const feedRequest = query.searchMode === "semantic"
      ? queryCommunityXMonitorSemanticForMember(query.feed, access.user?.id || "")
      : client.feed(query.feed);
    const [feedResult, summaryResult, trendsResult] = await Promise.allSettled([
      feedRequest,
      client.latestSummaries(),
      client.activityTrends(communityXMonitorActivityFeedQuery(query), {
        searchMode: query.searchMode,
        trendRange: query.trendRange,
      }),
    ]);

    if (feedResult.status === "fulfilled") feed = feedResult.value;
    if (
      feedResult.status === "rejected" &&
      feedResult.reason instanceof CommunityXMonitorSemanticLimitError
    ) {
      semanticLimitReached = true;
    }
    if (
      feedResult.status === "rejected" &&
      feedResult.reason instanceof CommunityXMonitorSemanticBusyError
    ) {
      semanticBusy = true;
    }
    if (summaryResult.status === "fulfilled") summaries = summaryResult.value.items;
    if (trendsResult.status === "fulfilled") trends = trendsResult.value;
  } catch {
    configurationAvailable = false;
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-7 px-5 pb-14">
      <section className="community-hero">
        <div className="community-hero__frame">
          <div className="max-w-3xl space-y-5">
            <p className="section-eyebrow text-white/70">PGPZ member intelligence</p>
            <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">X Monitor</h1>
            <p className="max-w-2xl text-base leading-7 text-white/78">
              Explore the Zcash conversation on X through focused posts, concise summaries, and
              activity trends organized for the PGPZ community.
            </p>
          </div>
        </div>
      </section>

      {isCommunityXMonitorBriefingsEnabled() ? <XMonitorSectionNav active="monitor" /> : null}

      <XMonitorFilters key={buildCommunityXMonitorHref(query)} query={query} />

      {!configurationAvailable ? <UnavailableNotice /> : null}

      {configurationAvailable ? (
        <>
          <XMonitorSummaries summaries={summaries} />
          <XMonitorActivity query={query} trends={trends} />
          {semanticBusy ? (
            <SemanticBusyNotice />
          ) : semanticLimitReached ? (
            <SemanticLimitNotice />
          ) : feed ? (
            <XMonitorFeed items={feed.items} nextCursor={feed.next_cursor} query={query} />
          ) : (
            <UnavailableNotice anchor />
          )}
        </>
      ) : null}
    </div>
  );
}
