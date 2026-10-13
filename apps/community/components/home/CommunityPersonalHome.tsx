import Image from "next/image";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  BookOpenText,
  ExternalLink,
  LibraryBig,
  MessageCircle,
  Settings2,
} from "lucide-react";
import {
  PersonalHome,
  PersonalHomeAction,
  PersonalHomeColumn,
  PersonalHomeGrid,
  PersonalHomeHeader,
  PersonalHomePanel,
} from "@pgpz/ui";
import { ReferralInviteCard } from "@/components/referrals/ReferralInviteCard";
import { Button } from "@/components/ui/button";
import { PUBLIC_POLICY_UPDATES_URL } from "@/lib/policy-update-urls";

const SIGNAL_GROUP_URL =
  "https://signal.group/#CjQKIEvyw3Ze5YXfGya1u442-BQLrXrN8s7dHoTRk3Jh-8r9EhAhSfVI2Umy4mA1Hq2VFDe_";

const iconFrame =
  "flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand-ink)] text-[var(--zcash-gold)]";

export function CommunityPersonalHome({
  displayName,
  memberSince,
  xMonitorEnabled,
  xMonitorBriefingsEnabled,
}: {
  displayName: string;
  memberSince: string;
  xMonitorEnabled: boolean;
  xMonitorBriefingsEnabled: boolean;
}) {
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

  ];

  return (
    <PersonalHome aria-label="Your PGPZ Community home">
      <PersonalHomeHeader
        eyebrow="Your Community home"
        title={`Welcome back, ${displayName}.`}
        description="Connect with other members, explore your resources, and choose where to participate."
        className="community-personal-home__header border-[rgba(71,85,105,0.34)] text-white shadow-[0_28px_60px_-36px_rgba(30,30,30,0.65)]"
        status={(
          <div className="inline-flex items-center gap-2 rounded-full border border-white/18 bg-white/10 px-4 py-2 text-sm font-semibold text-white">
            <BadgeCheck className="h-4 w-4 text-[var(--zcash-gold-soft)]" aria-hidden="true" />
            Active member
            <span className="font-normal text-white/66">since {memberSince}</span>
          </div>
        )}
        actions={(
          <>
            <Button size="sm" className="bg-[var(--zcash-gold)] text-[var(--brand-ink)] hover:bg-[var(--zcash-gold-soft)]" asChild>
              <Link href="/settings/profile#member-recruitment">Invite someone <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
            </Button>
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
        <PersonalHomeColumn className="lg:col-span-7">
          <PersonalHomePanel
            eyebrow="Choose your path"
            title="Quick actions"
            description="Move directly into the Community tools that are ready now."
            className="community-personal-home__panel"
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              {quickActions.map(({ href, eyebrow, title, description, icon: Icon }) => (
                <PersonalHomeAction
                  key={href}
                  href={href}
                  eyebrow={eyebrow}
                  title={title}
                  description={description}
                  className="border-[rgba(71,85,105,0.24)] text-[var(--brand-ink)] hover:border-[rgba(71,85,105,0.62)]"
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


          <ReferralInviteCard />
        </PersonalHomeColumn>

        <PersonalHomeColumn className="lg:col-span-5">
          <PersonalHomePanel eyebrow="Open to everyone" title="Policy updates now live on PGPZ" description="Read and share every published Weekly Policy Memo and Special Update at pgpz.org. Your Community email preferences still apply." className="community-personal-home__panel">
            <Button asChild><Link href={PUBLIC_POLICY_UPDATES_URL}>Visit the public archive <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></Button>
          </PersonalHomePanel>


          <PersonalHomePanel
            eyebrow="Member conversation"
            title="Stay connected in Signal"
            description="Use the members-only Signal group for timely coordination and member-to-member conversation."
            className="community-personal-home__panel"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <Image
                src="/community-signal-qr.png"
                alt="QR code to join the PGPZ Community Signal group"
                width={112}
                height={112}
                className="h-28 w-28 shrink-0 rounded-xl border border-[rgba(71,85,105,0.28)] bg-white p-2"
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
        </PersonalHomeColumn>
      </PersonalHomeGrid>
    </PersonalHome>
  );
}
