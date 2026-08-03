import { LegalDocumentPage } from "@/components/LegalDocumentPage";
import { boardPrivacy } from "@/content/legal";
import { requireBoardMember } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Board Portal Privacy Notice",
  robots: { index: false, follow: false, nocache: true },
};

export default async function PrivacyPage() {
  const member = await requireBoardMember("/privacy");
  if (!member) return null;

  return <LegalDocumentPage document={boardPrivacy} />;
}
