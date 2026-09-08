import Link from "next/link";
import { notFound } from "next/navigation";
import { Container, Badge } from "@pgpz/ui";
import { requireBoardMember } from "@/lib/session";
import { disclosureDirectory, disclosureView } from "@/lib/disclosures-service";
import { DisclosureError } from "@/lib/disclosures";
import { DisclosureWorkspace } from "@/components/disclosures/DisclosureWorkspace";
export const dynamic = "force-dynamic";
export const metadata = { title: "Private disclosure", robots: { index: false, follow: false, nocache: true } };
export default async function DisclosurePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const member = await requireBoardMember(`/disclosures/${id}`); if (!member) return null;
  let view;
  try { view = await disclosureView(member, id); } catch (error) { if (error instanceof DisclosureError && [403, 404].includes(error.status)) notFound(); throw error; }
  const candidates = (await disclosureDirectory(member)).filter((person) => person.status === "active");
  return <Container className="max-w-4xl py-8 sm:py-12"><Link href="/disclosures" className="text-sm underline underline-offset-4">All disclosures</Link><div className="mt-6"><Badge tone="accent">Restricted access</Badge></div><h1 className="mt-4 text-4xl font-semibold tracking-tight">Individual disclosure</h1><p className="mt-3 leading-7 text-[var(--muted)]">A personal signed record with private review, separate from the Board’s resolutions.</p><DisclosureWorkspace initial={view} candidates={candidates}/></Container>;
}
