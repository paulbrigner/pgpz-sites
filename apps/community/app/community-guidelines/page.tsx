import { LegalDocumentPage } from "@/components/legal/LegalDocumentPage";
import { communityGuidelinesDocument } from "@/lib/legal";

export const metadata = {
  title: "Community Guidelines | PGPZ Community",
  description: "Community Guidelines for PGPZ Community.",
};

export default function CommunityGuidelinesPage() {
  return <LegalDocumentPage document={communityGuidelinesDocument} />;
}
