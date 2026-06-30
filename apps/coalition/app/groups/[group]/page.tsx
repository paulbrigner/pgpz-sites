import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2, LockKeyhole, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMemberAccess } from "@/lib/member-access";
import {
  normalizePolicyInterestGroups,
  policyInterestGroupById,
  policyInterestGroupOptions,
  policyInterestGroupPath,
} from "@/lib/policy-interest-groups";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ group: string }>;
};

export function generateStaticParams() {
  return policyInterestGroupOptions.map((group) => ({ group: group.id }));
}

export async function generateMetadata({ params }: Props) {
  const { group: groupId } = await params;
  const group = policyInterestGroupById(groupId);
  if (!group) return {};
  return {
    title: `${group.label} Policy Group | PGPZ Coalition`,
    description: group.description,
  };
}

function MembershipRequired() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-5">
      <section className="glass-surface p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--brand-ink)] text-[var(--zcash-gold)]">
            <LockKeyhole className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="space-y-3">
            <p className="section-eyebrow text-[var(--brand-denim)]">Policy group</p>
            <h1 className="text-3xl font-semibold text-[var(--brand-ink)]">Membership required</h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-600">
              Topic pages are available to active PGPZ Coalition members.
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

export default async function PolicyGroupPage({ params }: Props) {
  const { group: groupId } = await params;
  const group = policyInterestGroupById(groupId);
  if (!group) notFound();

  const access = await getMemberAccess();
  const path = policyInterestGroupPath(group.id);
  if (!access.authenticated) {
    redirect(`/signin?callbackUrl=${encodeURIComponent(path)}`);
  }

  if (!access.isMember) {
    return <MembershipRequired />;
  }

  const selected = normalizePolicyInterestGroups(access.user?.policyInterestGroups);
  const isSelected = selected.includes(group.id);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 pb-14">
      <section className="coalition-hero">
        <div className="coalition-hero__frame">
          <div className="max-w-3xl space-y-5">
            <Link href="/groups" className="inline-flex items-center gap-2 text-sm font-semibold text-white/78 underline">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Policy groups
            </Link>
            <p className="section-eyebrow text-white/70">Topic group</p>
            <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">{group.label}</h1>
            <p className="max-w-2xl text-base leading-7 text-white/78">{group.description}</p>
            <div className="flex flex-wrap gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-1 text-sm text-[var(--zcash-gold-soft)]">
                {isSelected ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <Settings2 className="h-4 w-4" aria-hidden="true" />}
                {isSelected ? "Selected in your profile" : "Not selected yet"}
              </span>
              <Button size="sm" asChild>
                <Link href="/groups">Edit groups</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        <article className="rounded-lg border bg-white/90 p-6 shadow-sm">
          <p className="section-eyebrow text-[var(--brand-denim)]">Focus areas</p>
          <h2 className="mt-2 text-2xl font-semibold text-[var(--brand-ink)]">{group.label} priorities</h2>
          <div className="mt-5 space-y-3">
            {group.focusAreas.map((focus) => (
              <div key={focus} className="rounded-lg border bg-white p-4 text-sm font-medium text-[var(--brand-ink)]">
                {focus}
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-lg border bg-white/90 p-6 shadow-sm">
          <p className="section-eyebrow text-[var(--brand-denim)]">Workspace</p>
          <h2 className="mt-2 text-2xl font-semibold text-[var(--brand-ink)]">Coordination notes</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {[
              ["Current watch items", "Bills, hearings, agency actions, and partner asks tied to this topic."],
              ["Member leads", "Members who select this topic can be identified from the directory and admin roster."],
              ["Useful materials", "Relevant memos, explainers, and links can be routed into this topic area."],
            ].map(([title, body]) => (
              <div key={title} className="rounded-lg border bg-white p-4">
                <h3 className="text-sm font-semibold text-[var(--brand-ink)]">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button variant="outline" asChild>
              <Link href="/updates">Browse updates</Link>
            </Button>
            <Button asChild>
              <Link href="/groups">Manage topic selections</Link>
            </Button>
          </div>
        </article>
      </section>
    </div>
  );
}
