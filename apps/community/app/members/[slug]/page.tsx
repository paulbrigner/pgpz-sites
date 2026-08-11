import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isFeatureEnabled } from "@/config/features";
import { getMemberAccess } from "@/lib/member-access";
import { resolveVisibleMemberProfile } from "@/lib/member-profiles";

export const dynamic = "force-dynamic";
export const metadata = { title: "Member Profile | PGPZ Community", robots: { index: false, follow: false } };

export default async function MemberProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  if (!isFeatureEnabled("memberDirectory")) notFound();
  const { slug } = await params;
  const access = await getMemberAccess();
  if (!access.authenticated) redirect(`/signin?callbackUrl=${encodeURIComponent(`/members/${slug}`)}`);
  if (!access.isMember) notFound();
  const profile = await resolveVisibleMemberProfile(slug).catch(() => null);
  if (!profile) notFound();
  return <div className="mx-auto w-full max-w-4xl px-5 pb-14"><article className="glass-surface p-8"><Link href="/members" className="text-sm font-medium underline">← Member directory</Link><h1 className="mt-6 text-4xl font-semibold">{profile.name}</h1><p className="mt-2 text-lg text-slate-600">{profile.headline || "Community member"}</p>{profile.bio ? <p className="mt-6 max-w-2xl whitespace-pre-line leading-7 text-slate-700">{profile.bio}</p> : null}<div className="mt-6 flex gap-4 text-sm">{profile.linkedinUrl ? <a href={profile.linkedinUrl} target="_blank" rel="noopener noreferrer" className="underline">LinkedIn</a> : null}{profile.xHandle ? <a href={`https://x.com/${profile.xHandle.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer" className="underline">{profile.xHandle}</a> : null}</div></article></div>;
}
