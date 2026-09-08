import Link from "next/link";
import { Container, Badge } from "@pgpz/ui";
import { requireBoardMember } from "@/lib/session";
import { disclosureActor, disclosureDirectory, disclosurePolicyOptions, disclosureRegister } from "@/lib/disclosures-service";
import { disclosureChair } from "@/lib/disclosures";
import { DisclosuresIndex } from "@/components/disclosures/DisclosuresIndex";
export const dynamic = "force-dynamic";
export const metadata = { title: "Disclosures", robots: { index: false, follow: false, nocache: true } };
export default async function DisclosuresPage() {
  const member = await requireBoardMember("/disclosures"); if (!member) return null;
  const actor = await disclosureActor(member);
  const [rows, candidates, policies] = await Promise.all([disclosureRegister(member), disclosureDirectory(member), disclosurePolicyOptions()]);
  return <Container className="max-w-6xl py-8 sm:py-12"><Link href="/" className="text-sm underline underline-offset-4">Board home</Link><div className="mt-6"><Badge tone="accent">Private governance records</Badge></div><h1 className="mt-4 text-4xl font-semibold tracking-tight">Conflict disclosures</h1><p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">Complete your annual acknowledgment, disclose a specific matter, or update a signed disclosure when circumstances change. Disclose relevant conflicts before participating in an affected decision.</p><DisclosuresIndex rows={rows} candidates={candidates} policies={policies} actorId={actor.id} canAssign={disclosureChair(actor.role)}/></Container>;
}
