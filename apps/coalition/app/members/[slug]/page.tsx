import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getMemberAccess } from "@/lib/member-access";
import { resolveVisibleMemberProfile } from "@/lib/member-profiles";
import { policyInterestGroupLabel } from "@/lib/policy-interest-groups";

export const dynamic = "force-dynamic";
export const metadata = { title: "Member Profile | PGPZ Coalition", robots: { index: false, follow: false } };

export default async function MemberProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await getMemberAccess();
  if (!access.authenticated) redirect(`/signin?callbackUrl=${encodeURIComponent(`/members/${slug}`)}`);
  if (!access.isMember) notFound();
  const profile = await resolveVisibleMemberProfile(slug).catch(() => null);
  if (!profile) notFound();
  return <div className="mx-auto w-full max-w-4xl px-5 pb-14"><article className="rounded-lg border bg-white/90 p-8 shadow-sm"><Link href="/members" className="text-sm font-medium underline">← Member directory</Link><h1 className="mt-6 text-4xl font-semibold text-[var(--brand-ink)]">{profile.name}</h1><p className="mt-2 text-lg text-slate-600">{[profile.jobTitle, profile.company].filter(Boolean).join(" at ") || "Coalition member"}</p><div className="mt-5 flex flex-wrap gap-2">{profile.policyInterestGroups.map((id) => <Link key={id} href={`/groups/${id}`} className="rounded-full bg-[var(--zcash-gold-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--zcash-gold-deep)]">{policyInterestGroupLabel(id)}</Link>)}</div><div className="mt-7 flex flex-wrap gap-4 text-sm"><a href={`mailto:${profile.email}`} className="underline">Email</a>{profile.linkedinUrl ? <a href={profile.linkedinUrl} target="_blank" rel="noopener noreferrer" className="underline">LinkedIn</a> : null}{profile.xHandle ? <a href={`https://x.com/${profile.xHandle.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer" className="underline">{profile.xHandle}</a> : null}</div></article></div>;
}
