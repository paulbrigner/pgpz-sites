import { LegalDocumentPage } from "@/components/legal/LegalDocumentPage";
import { termsDocument } from "@/lib/legal";

export const metadata = {
  title: "Terms of Service | PGPZ Community",
  description: "Terms of Service for PGPZ Community.",
};

export default function TermsPage() {
  return <LegalDocumentPage document={termsDocument} />;
}
