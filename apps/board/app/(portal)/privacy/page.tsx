import { LegalDocumentPage } from "@/components/LegalDocumentPage";
import { boardPrivacy } from "@/content/legal";

export const metadata = {
  title: "Board Portal Privacy Notice",
  robots: { index: false, follow: false, nocache: true },
};

export default function PrivacyPage() {
  return <LegalDocumentPage document={boardPrivacy} />;
}
