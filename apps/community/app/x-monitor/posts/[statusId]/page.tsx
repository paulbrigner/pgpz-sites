import Link from "next/link";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import type { PostDetail } from "@pgpz/x-monitor-core/contracts";
import { Button } from "@/components/ui/button";
import { XMonitorPostCard } from "@/components/x-monitor/XMonitorFeed";
import { getMemberAccess } from "@/lib/member-access";
import { canAccessCommunityXMonitor } from "@/lib/x-monitor-access";
import { isCommunityXMonitorEnabled } from "@/lib/x-monitor-public";
import {
  safeCommunityXMonitorReturnHref,
  type CommunityXMonitorSearchParams,
} from "@/lib/x-monitor-query";
import { createCommunityXMonitorClient } from "@/lib/x-monitor-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata = {
  title: "Captured post | X Monitor | PGPZ Community",
  robots: { index: false, follow: false },
};

function formatDetailDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "America/New_York",
  }).format(date);
}

function MembershipRequired() {
  return (
    <div className="mx-auto w-full max-w-4xl px-5">
      <section className="glass-surface p-8">
        <div className="flex gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--brand-ink)] text-[var(--zcash-gold)]">
            <LockKeyhole className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-[var(--brand-ink)]">Membership required</h1>
            <p className="mt-2 text-sm text-slate-600">This captured post is available to PGPZ Community members.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

export default async function XMonitorPostPage({
  params,
  searchParams,
}: {
  params: Promise<{ statusId: string }>;
  searchParams?: Promise<CommunityXMonitorSearchParams>;
}) {
  if (!isCommunityXMonitorEnabled()) notFound();
  const { statusId } = await params;
  if (!/^[0-9]{1,32}$/.test(statusId?.trim() || "")) notFound();

  const rawSearchParams = (await searchParams) || {};
  const rawReturnTo = Array.isArray(rawSearchParams.return_to)
    ? rawSearchParams.return_to[0]
    : rawSearchParams.return_to;
  const returnHref = safeCommunityXMonitorReturnHref(rawReturnTo);
  const detailPath = `/x-monitor/posts/${encodeURIComponent(statusId)}`;
  const callbackPath = rawReturnTo
    ? `${detailPath}?return_to=${encodeURIComponent(returnHref)}`
    : detailPath;
  const access = await getMemberAccess();
  if (!access.authenticated) {
    redirect(`/signin?callbackUrl=${encodeURIComponent(callbackPath)}`);
  }
  if (!canAccessCommunityXMonitor(access.session?.capabilities)) {
    return <MembershipRequired />;
  }

  let detail: PostDetail | null = null;
  let unavailable = false;
  try {
    detail = await createCommunityXMonitorClient().postDetail(statusId);
  } catch {
    unavailable = true;
  }
  if (unavailable) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-5 pb-14">
        <Button variant="outline" asChild>
          <Link href={returnHref}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to X Monitor
          </Link>
        </Button>
        <section className="muted-card p-6" role="status">
          <h1 className="text-xl font-semibold text-[var(--brand-ink)]">Post details are temporarily unavailable</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">The protected read service could not be reached. Please try again shortly.</p>
        </section>
      </div>
    );
  }
  if (!detail) notFound();

  const metadataItems = [
    ["Views", detail.post.views.toLocaleString()],
    ["Followers", detail.post.followers_count?.toLocaleString() || null],
    ["Author location", detail.post.author_location || null],
    ["Account created", formatDetailDate(detail.post.account_created_at)],
    ["Classification", detail.post.classification_status.replaceAll("_", " ")],
    [
      "Confidence",
      typeof detail.post.classification_confidence === "number"
        ? `${Math.round(detail.post.classification_confidence * 100)}%`
        : null,
    ],
  ].filter((item): item is [string, string] => Boolean(item[1]));

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-5 pb-14">
      <div>
        <Button variant="outline" asChild>
          <Link href={returnHref}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to X Monitor
          </Link>
        </Button>
      </div>
      <div>
        <p className="section-eyebrow text-[var(--brand-denim)]">Captured post</p>
        <h1 className="mt-2 text-3xl font-semibold text-[var(--brand-ink)]">Post details</h1>
      </div>
      <XMonitorPostCard item={detail.post} linkToDetail={false} />
      <section className="glass-surface p-5" aria-labelledby="x-monitor-post-metadata">
        <h2 id="x-monitor-post-metadata" className="text-lg font-semibold text-[var(--brand-ink)]">
          Capture details
        </h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {metadataItems.map(([label, value]) => (
            <div className="rounded-xl border border-slate-100 bg-white/75 p-3" key={label}>
              <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</dt>
              <dd className="mt-1 text-sm text-slate-700">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
