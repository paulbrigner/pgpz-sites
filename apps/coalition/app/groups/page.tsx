import Link from "next/link";
import { redirect } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMemberAccess } from "@/lib/member-access";
import { normalizePolicyInterestGroups } from "@/lib/policy-interest-groups";
import GroupsClient from "./groups-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Policy Groups | PGPZ Coalition",
  description: "Member topic groups for PGPZ Coalition policy coordination.",
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
            <p className="section-eyebrow text-[var(--brand-denim)]">Policy groups</p>
            <h1 className="text-3xl font-semibold text-[var(--brand-ink)]">Membership required</h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-600">
              Topic groups are available to active PGPZ Coalition members.
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

export default async function GroupsPage() {
  const access = await getMemberAccess();
  if (!access.authenticated) {
    redirect(`/signin?callbackUrl=${encodeURIComponent("/groups")}`);
  }

  if (!access.isMember) {
    return <MembershipRequired />;
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 pb-14">
      <GroupsClient
        displayName={access.displayName}
        initialSelected={normalizePolicyInterestGroups(access.user?.policyInterestGroups)}
      />
    </div>
  );
}
