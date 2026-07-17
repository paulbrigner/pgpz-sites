import { LegalDocumentPage } from "@/components/legal/LegalDocumentPage";
import { privacyDocument } from "@/lib/legal";

export const metadata = {
  title: "Privacy Policy | PGPZ Coalition",
  description: "Privacy Policy for PGPZ Coalition.",
};

export default function PrivacyPage() {
  return <LegalDocumentPage document={privacyDocument} />;
}
