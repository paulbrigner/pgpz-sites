import { redirect } from "next/navigation";
import { PUBLIC_POLICY_UPDATES_URL } from "@/lib/policy-update-urls";

export const dynamic = "force-dynamic";

export default function UpdatesPage() {
  redirect(PUBLIC_POLICY_UPDATES_URL);
}
