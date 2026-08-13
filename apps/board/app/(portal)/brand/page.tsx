import { redirect } from "next/navigation";
import { requireBoardMember } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Document Library",
  robots: { index: false, follow: false, nocache: true },
};

export default async function BrandMarketingPage() {
  await requireBoardMember("/brand");
  redirect("/documents");
}
