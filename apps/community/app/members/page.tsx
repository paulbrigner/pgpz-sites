import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { isFeatureEnabled } from "@/config/features";
import { getMemberAccess } from "@/lib/member-access";
import { listVisibleMemberProfiles } from "@/lib/member-profiles";
import MembersClient from "./members-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Member Directory | PGPZ Community", robots: { index: false, follow: false } };

export default async function MembersPage() {
  if (!isFeatureEnabled("memberDirectory")) notFound();
  const access = await getMemberAccess();
  if (!access.authenticated) redirect(`/signin?callbackUrl=${encodeURIComponent("/members")}`);
  if (!access.isMember) return <div className="mx-auto max-w-4xl px-5 pb-14"><section className="glass-surface p-8"><h1 className="text-3xl font-semibold">Membership required</h1><p className="mt-3 text-sm text-slate-600">The opt-in directory is available only to active Community members.</p><Button asChild className="mt-5"><Link href="/">Return home</Link></Button></section></div>;
  return <MembersClient initialMembers={await listVisibleMemberProfiles()} />;
}
