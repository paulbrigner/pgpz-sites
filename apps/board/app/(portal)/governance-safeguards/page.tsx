import { Container } from "@pgpz/ui";
import { GovernanceSafeguardsOverview } from "@/components/governance/GovernanceSafeguardsOverview";
import { canReviewBoardAudit, requireBoardMember } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Governance Safeguards",
  robots: { index: false, follow: false, nocache: true },
};

export default async function GovernanceSafeguardsPage() {
  const member = await requireBoardMember("/governance-safeguards");
  if (!member) return null;

  return (
    <Container className="max-w-6xl py-8 sm:py-12">
      <GovernanceSafeguardsOverview showTechnicalDetails={canReviewBoardAudit(member)} />
    </Container>
  );
}
