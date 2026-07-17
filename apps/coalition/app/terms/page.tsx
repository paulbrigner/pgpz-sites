import { LegalDocumentPage } from "@/components/legal/LegalDocumentPage";
import { termsDocument } from "@/lib/legal";

export const metadata = {
  title: "Terms of Service | PGPZ Coalition",
  description: "Terms of Service for PGPZ Coalition.",
};

export default function TermsPage() {
  return <LegalDocumentPage document={termsDocument} />;
}
