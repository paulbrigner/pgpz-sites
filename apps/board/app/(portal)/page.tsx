import { headers } from "next/headers";
import { BoardDashboard, type BoardMember } from "@/components/dashboard/BoardDashboard";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function BoardHomePage() {
  const session = await auth.api.getSession({
    headers: await headers(),
    query: { disableRefresh: true },
  });

  const member: BoardMember = {
    name: session?.user?.name || "Board member",
    email: session?.user?.email || "director@pgpz.org",
  };

  return <BoardDashboard member={member} />;
}
