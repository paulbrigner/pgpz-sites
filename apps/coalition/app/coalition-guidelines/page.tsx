import { LegalDocumentPage } from "@/components/legal/LegalDocumentPage";
import { coalitionGuidelinesDocument } from "@/lib/legal";

export const metadata = {
  title: "Coalition Guidelines | PGPZ Coalition",
  description: "Coalition Guidelines for PGPZ Coalition.",
};

export default function CommunityGuidelinesPage() {
  return <LegalDocumentPage document={coalitionGuidelinesDocument} />;
}
