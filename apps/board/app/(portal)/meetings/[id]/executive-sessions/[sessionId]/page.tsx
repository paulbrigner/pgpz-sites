import { notFound } from "next/navigation";
import { Container } from "@pgpz/ui";
import { requireBoardMember } from "@/lib/session";
import { requireExecutiveAccess } from "@/lib/executive-session-access";
import { executiveSessionsRepository } from "@/lib/executive-sessions-repository";
import { executiveMaterialView, ExecutiveSessionError } from "@/lib/executive-sessions";
import { ExecutiveSessionWorkspace } from "@/components/meetings/ExecutiveSessionWorkspace";

export const dynamic = "force-dynamic";
export const metadata = { title: "Restricted Board Session", robots: { index: false, follow: false, nocache: true } };

export default async function ExecutiveSessionPage({ params }: { params: Promise<{ id: string; sessionId: string }> }) {
  const { id, sessionId } = await params;
  const member = await requireBoardMember(`/meetings/${encodeURIComponent(id)}/executive-sessions/${encodeURIComponent(sessionId)}`);
  if (!member) return null;
  let access;
  try { access = await requireExecutiveAccess(member, id, sessionId); }
  catch (error) { if (error instanceof ExecutiveSessionError && error.status === 404) notFound(); throw error; }
  const [messages, materials] = await Promise.all([executiveSessionsRepository.messages(sessionId), executiveSessionsRepository.materials(sessionId)]);
  return <Container className="max-w-5xl py-8 sm:py-12">
    <ExecutiveSessionWorkspace session={access.session} messages={messages} canManage={access.canManage} materials={materials.map(executiveMaterialView)} />
  </Container>;
}
