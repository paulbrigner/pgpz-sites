import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Membership proof | PGPZ Community",
  robots: { index: false, follow: false },
};

export default async function MembershipProofLinkPage({
  params,
}: {
  params: Promise<{ challenge: string }>;
}) {
  const { challenge } = await params;
  if (!/^PGPZ-[0-9A-F]{10}$/.test(challenge || "")) notFound();

  return (
    <div className="mx-auto flex w-full max-w-3xl px-5 pb-16">
      <section className="glass-surface w-full p-8 sm:p-10">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--brand-ink)] text-[var(--zcash-gold)]">
            <BadgeCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="space-y-4">
            <p className="section-eyebrow text-[var(--brand-denim)]">ZcashMe membership proof</p>
            <h1 className="text-3xl font-semibold text-[var(--brand-ink)]">PGPZ proof link</h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-600">
              This link associates the proof code <strong>{challenge}</strong> with a public
              ZcashMe profile. Visiting it does not activate membership or reveal a PGPZ account.
              PGPZ verifies the proof only inside an authenticated membership-verification flow.
            </p>
            <Button asChild>
              <Link href="/">Visit PGPZ Community</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
