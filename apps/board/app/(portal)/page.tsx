import { BoardDashboard } from "@/components/dashboard/BoardDashboard";
import { requireBoardMember } from "@/lib/session";
import { getBoardPasskeyCount } from "@/lib/passkey-enrollment";

export const dynamic = "force-dynamic";

export default async function BoardHomePage() {
  const member = await requireBoardMember("/");
  if (!member) return null;

  const passkeyCount = await getBoardPasskeyCount(member.id);
  return <BoardDashboard member={member} passkeyCount={passkeyCount} />;
}
