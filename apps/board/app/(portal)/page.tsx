import { BoardDashboard } from "@/components/dashboard/BoardDashboard";
import { requireBoardMember } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function BoardHomePage() {
  const member = await requireBoardMember("/");
  if (!member) return null;

  return <BoardDashboard member={member} />;
}
