import { notFound, redirect } from "next/navigation";
import { isFeatureEnabled } from "@/config/features";
import { getMemberAccess } from "@/lib/member-access";
import {
  getLetterCampaignBySlug,
  getLetterSignOn,
  listLetterSignOns,
} from "@/lib/letter-signons";
import LetterSignOnClient from "./sign-on-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Coalition letter | PGPZ Coalition",
  description: "Review a PGPZ Coalition letter and formally sign on.",
};

export default async function LetterCampaignPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (!isFeatureEnabled("letterSignons")) notFound();
  const { slug } = await params;
  const access = await getMemberAccess();
  if (!access.authenticated) {
    redirect(
      `/signin?callbackUrl=${encodeURIComponent(`/letters/${slug}`)}`,
    );
  }
  const adminPreview = access.session?.capabilities.admin === true;
  if ((!access.isMember && !adminPreview) || !access.user?.id) {
    redirect("/letters");
  }
  const campaign = await getLetterCampaignBySlug(slug);
  if (
    !campaign ||
    (!adminPreview && campaign.status === "draft") ||
    campaign.status === "archived"
  ) {
    notFound();
  }
  const allSignOns = await listLetterSignOns(campaign);
  const currentSignOn = await getLetterSignOn(campaign, access.user.id);
  const signers = allSignOns
    .filter((signOn) => signOn.current)
    .map((signOn) => ({
      userId: signOn.userId,
      signerKind: signOn.signerKind,
      displayName: signOn.displayName,
      organizationName: signOn.organizationName,
      title: signOn.title,
      affiliation: signOn.affiliation,
      acceptedAt: signOn.acceptedAt,
    }));

  return (
    <LetterSignOnClient
      campaign={campaign}
      initialSignOn={currentSignOn}
      initialSigners={signers}
      member={{
        displayName: access.user.name || access.displayName,
        title: access.user.jobTitle,
        affiliation: access.user.company,
      }}
      adminPreview={adminPreview && campaign.status === "draft"}
    />
  );
}
