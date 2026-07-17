import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/LegalDocumentPage";
import { referencePrivacy } from "@/content/legal";

export const metadata: Metadata = {
  title: "Reference Privacy Notice",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return <LegalDocumentPage document={referencePrivacy} />;
}
