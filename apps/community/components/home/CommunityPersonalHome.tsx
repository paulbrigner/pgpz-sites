import Image from "next/image";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  BookOpenText,
  ExternalLink,
  FileText,
  LibraryBig,
  MessageCircle,
  Settings2,
} from "lucide-react";
import {
  PersonalHome,
  PersonalHomeAction,
  PersonalHomeGrid,
  PersonalHomeHeader,
  PersonalHomePanel,
} from "@pgpz/ui";
import { ReferralInviteCard } from "@/components/referrals/ReferralInviteCard";
import { Button } from "@/components/ui/button";
import type { CommunityFeaturedPolicyUpdate } from "./CommunityHomeSections";

const SIGNAL_GROUP_URL =
  "https://signal.group/#CjQKIEvyw3Ze5YXfGya1u442-BQLrXrN8s7dHoTRk3Jh-8r9EhAhSfVI2Umy4mA1Hq2VFDe_";

const formatPublishedDate = (value: string) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
};

const iconFrame =
  "flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand-ink)] text-[var(--zcash-gold)]";

export function CommunityPersonalHome({
  displayName,
  memberSince,
  updates,
  xMonitorEnabled,
  xMonitorBriefingsEnabled,
}: {
  displayName: string;
  memberSince: string;
  updates: CommunityFeaturedPolicyUpdate[];
  xMonitorEnabled: boolean;
  xMonitorBriefingsEnabled: boolean;
}) {
  const orderedUpdates = [...updates].sort((left, right) =>
    right.publishedAt.localeCompare(left.publishedAt),
  );
  const [latestUpdate, ...otherUpdates] = orderedUpdates;

  const quickActions = [
    ...(xMonitorBriefingsEnabled
      ? [{
          href: "/x-monitor/briefings",
          eyebrow: "Policy context",
          title: "Topic Briefings",
          description: "Read curated, evidence-linked answers.",
          icon: BookOpenText,
        }]
      : []),
    ...(xMonitorEnabled
      ? [{
          href: "/x-monitor",
          eyebrow: "Community intelligence",
          title: "X Monitor",
          description: "Review summaries, trends, and significant posts.",
          icon: Activity,
        }]
      : []),
    {
      href: "/zec-shelf",
      eyebrow: "Member library",
      title: "ZEC Shelf",
      description: "Browse useful Zcash research, tools, and references.",
      icon: LibraryBig,
    },
    {
      href: "/updates",
      eyebrow: "Policy archive",
      title: "All updates",
      description: "Return to weekly memos and special reports.",
      icon: FileText,
    },
  ];

  return (
    <PersonalHome aria-label="Your PGPZ Community home">
      <PersonalHomeHeader
        eyebrow="Your Community home"
        title={`Welcome back, ${displayName}.`}
        description="Start with the most useful current policy context, then choose where you want to participate."
        className="community-personal-home__header border-[rgba(245,168,0,0.34)] text-white shadow-[0_28px_60px_-36px_rgba(30,30,30,0.65)]"
        status={(
          <div className="inline-flex items-center gap-2 rounded-full border border-white/18 bg-white/10 px-4 py-2 text-sm font-semibold text-white">
            <BadgeCheck className="h-4 w-4 text-[var(--zcash-gold-soft)]" aria-hidden="true" />
            Active member
            <span className="font-normal text-white/66">since {memberSince}</span>
          </div>
        )}
        actions={(
          <>
            {latestUpdate ? (
              <Button
                size="sm"
                className="bg-[var(--zcash-gold)] text-[var(--brand-ink)] hover:bg-[var(--zcash-gold-soft)]"
                asChild
              >
                <Link href={latestUpdate.portalPath}>
                  Read latest update
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              className="border-white/35 bg-transparent text-white hover:bg-white/10"
              asChild
            >
              <Link href="/settings/profile">
                <Settings2 className="h-4 w-4" aria-hidden="true" />
                Profile
              </Link>
            </Button>
          </>
        )}
      />

      <PersonalHomeGrid>
        <PersonalHomePanel
          eyebrow="Recommended next"
          title="Start with the latest policy update"
          description="The newest member briefing is your fastest route into the current policy conversation."
          className="community-personal-home__panel lg:col-span-7"
        >
          {latestUpdate ? (
            <div className="grid gap-5 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:items-center">
              <Link
                href={latestUpdate.portalPath}
                className="block overflow-hidden rounded-2xl border border-[rgba(245,168,0,0.28)] bg-[var(--brand-ice)]"
                aria-label={`Read ${latestUpdate.title}`}
              >
                <Image
                  src={latestUpdate.coverImage}
                  alt={`${latestUpdate.shortTitle} cover`}
                  width={304}
                  height={220}
                  className="aspect-[4/3] h-full w-full object-contain"
                  priority
                />
              </Link>
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--brand-denim)]">
                  <span>{latestUpdate.categoryLabel}</span>
                  <span aria-hidden="true">·</span>
                  <span>{formatPublishedDate(latestUpdate.publishedAt)}</span>
                </div>
                <h3 className="mt-2 text-xl font-semibold leading-7 text-[var(--brand-ink)]">
                  {latestUpdate.shortTitle}
                </h3>
                <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">
                  {latestUpdate.summary}
                </p>
                <Button className="mt-4" asChild>
                  <Link href={latestUpdate.portalPath}>
                    Read update
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm leading-6 text-slate-600">
              The latest policy update will appear here when it is published.
            </p>
          )}
        </PersonalHomePanel>

        <PersonalHomePanel
          eyebrow="Choose your path"
          title="Quick actions"
          description="Move directly into the Community tools that are ready now."
          className="community-personal-home__panel lg:col-span-5"
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {quickActions.map(({ href, eyebrow, title, description, icon: Icon }) => (
              <PersonalHomeAction
                key={href}
                href={href}
                eyebrow={eyebrow}
                title={title}
                description={description}
                className="border-[rgba(245,168,0,0.24)] text-[var(--brand-ink)] hover:border-[rgba(245,168,0,0.62)]"
                leading={(
                  <span className={iconFrame}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                )}
                trailing={<ArrowRight className="h-4 w-4 text-[var(--brand-denim)]" aria-hidden="true" />}
              />
            ))}
          </div>
        </PersonalHomePanel>

        <PersonalHomePanel
          eyebrow="More policy work"
          title="Continue exploring"
          description="Return to the other current member briefing when you are ready."
          className="community-personal-home__panel lg:col-span-7"
          action={(
            <Button variant="outline" size="sm" asChild>
              <Link href="/updates">Full archive</Link>
            </Button>
          )}
        >
          {otherUpdates.length ? (
            <div className="grid gap-3">
              {otherUpdates.map((update) => (
                <PersonalHomeAction
                  key={update.slug}
                  href={update.portalPath}
                  eyebrow={`${update.categoryLabel} · ${formatPublishedDate(update.publishedAt)}`}
                  title={update.shortTitle}
                  description={update.summary}
                  className="border-[rgba(245,168,0,0.24)] text-[var(--brand-ink)] hover:border-[rgba(245,168,0,0.62)]"
                  leading={(
                    <span className={iconFrame}>
                      <FileText className="h-5 w-5" aria-hidden="true" />
                    </span>
                  )}
                  trailing={<ArrowRight className="h-4 w-4 text-[var(--brand-denim)]" aria-hidden="true" />}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm leading-6 text-slate-600">
              Additional member updates will appear here as they are published.
            </p>
          )}
        </PersonalHomePanel>

        <PersonalHomePanel
          eyebrow="Member conversation"
          title="Stay connected in Signal"
          description="Use the members-only Signal group for timely coordination and member-to-member conversation."
          className="community-personal-home__panel lg:col-span-5"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Image
              src="/community-signal-qr.png"
              alt="QR code to join the PGPZ Community Signal group"
              width={112}
              height={112}
              className="h-28 w-28 shrink-0 rounded-xl border border-[rgba(245,168,0,0.28)] bg-white p-2"
            />
            <div>
              <div className="flex items-center gap-3">
                <span className={iconFrame}>
                  <MessageCircle className="h-5 w-5" aria-hidden="true" />
                </span>
                <p className="text-sm leading-6 text-slate-600">
                  Scan from another device or open Signal directly.
                </p>
              </div>
              <Button className="mt-4" variant="outline" asChild>
                <Link href={SIGNAL_GROUP_URL} target="_blank" rel="noopener noreferrer">
                  Open Signal
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>
        </PersonalHomePanel>

        <ReferralInviteCard className="lg:col-span-12" />
      </PersonalHomeGrid>
    </PersonalHome>
  );
}
