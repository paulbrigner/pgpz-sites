import { LegalDocumentPage } from "@/components/LegalDocumentPage";
import { boardTerms } from "@/content/legal";
import { requireBoardMember } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Board Portal Terms",
  robots: { index: false, follow: false, nocache: true },
};

export default async function TermsPage() {
  const member = await requireBoardMember("/terms");
  if (!member) return null;

  return <LegalDocumentPage document={boardTerms} />;
}
