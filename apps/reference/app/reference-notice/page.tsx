import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/LegalDocumentPage";
import { referenceNotice } from "@/content/legal";

export const metadata: Metadata = {
  title: "Reference Environment Notice",
  alternates: { canonical: "/reference-notice" },
};

export default function ReferenceNoticePage() {
  return <LegalDocumentPage document={referenceNotice} />;
}
