import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/LegalDocumentPage";
import { referenceTerms } from "@/content/legal";

export const metadata: Metadata = {
  title: "Reference Terms",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return <LegalDocumentPage document={referenceTerms} />;
}
