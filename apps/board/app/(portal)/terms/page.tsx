import { LegalDocumentPage } from "@/components/LegalDocumentPage";
import { boardTerms } from "@/content/legal";

export const metadata = {
  title: "Board Portal Terms",
  robots: { index: false, follow: false, nocache: true },
};

export default function TermsPage() {
  return <LegalDocumentPage document={boardTerms} />;
}
