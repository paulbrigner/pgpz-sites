import { LegalDocumentPage } from "@/components/legal/LegalDocumentPage";
import { privacyDocument } from "@/lib/legal";

export const metadata = {
  title: "Privacy Policy | PGPZ Community",
  description: "Privacy Policy for PGPZ Community.",
};

export default function PrivacyPage() {
  return <LegalDocumentPage document={privacyDocument} />;
}
