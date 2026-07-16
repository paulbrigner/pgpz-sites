import Link from "next/link";
import { redirect } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { ZecShelfClient } from "@/components/zec-shelf/ZecShelfClient";
import { Button } from "@/components/ui/button";
import { getMemberAccess } from "@/lib/member-access";
import { canManageZecShelf, canViewZecShelf } from "@/lib/zec-shelf-access";
import { getZecShelfResources } from "@/lib/zec-shelf";
import { isEffectiveAdmin } from "@/lib/admin/member-preview";
import { isMemberPreviewRequest } from "@/lib/admin/member-preview-server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "ZEC Shelf | PGPZ Community",
  description: "A curated library of important Zcash websites, tools, research, and references.",
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
            <p className="section-eyebrow text-[var(--brand-denim)]">Member resource library</p>
            <h1 className="text-3xl font-semibold text-[var(--brand-ink)]">Membership required</h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-600">
              ZEC Shelf is available to active PGPZ Community members. Complete membership verification from the home page to browse the collection.
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

export default async function ZecShelfPage() {
  const access = await getMemberAccess();
  if (!access.authenticated) redirect(`/signin?callbackUrl=${encodeURIComponent("/zec-shelf")}`);
  const viewAsMember = await isMemberPreviewRequest();
  const effectiveUser = access.user
    ? {
        ...access.user,
        isAdmin: isEffectiveAdmin(access.user.isAdmin === true, viewAsMember),
      }
    : access.user;
  if (!canViewZecShelf(effectiveUser)) return <MembershipRequired />;

  const resources = await getZecShelfResources();
  return <ZecShelfClient initialResources={resources} isAdmin={canManageZecShelf(effectiveUser)} />;
}
