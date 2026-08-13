import { notFound, redirect } from "next/navigation";
import { canManageBoardDocuments, requireBoardMember } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Document Library",
  robots: { index: false, follow: false, nocache: true },
};

export default async function AdminDocumentsPage() {
  const member = await requireBoardMember("/admin/documents");
  if (!member || !canManageBoardDocuments(member)) notFound();
  redirect("/documents");
}
