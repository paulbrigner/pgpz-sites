import Link from "next/link";
import { redirect } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMemberAccess } from "@/lib/member-access";
import { listActiveMemberDirectory } from "@/lib/admin/roster";
import MembersClient from "./members-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Member Directory | PGPZ Coalition",
  description: "Search the opt-in PGPZ Coalition member directory.",
};

export default async function MembersPage() {
  const access = await getMemberAccess();
  if (!access.authenticated) redirect(`/signin?callbackUrl=${encodeURIComponent("/members")}`);
  if (!access.isMember) {
    return (
      <div className="mx-auto w-full max-w-4xl px-5 pb-14">
        <section className="glass-surface p-8">
          <LockKeyhole className="h-6 w-6 text-[var(--brand-denim)]" aria-hidden="true" />
          <h1 className="mt-4 text-3xl font-semibold text-[var(--brand-ink)]">Membership required</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            The opt-in directory is available only to active Coalition members.
          </p>
          <Button asChild className="mt-5"><Link href="/">Return home</Link></Button>
        </section>
      </div>
    );
  }
  return <MembersClient initialMembers={await listActiveMemberDirectory()} />;
}
