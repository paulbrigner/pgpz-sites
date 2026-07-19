import { NextRequest, NextResponse } from "next/server";
import {
  recordLegacyNewsletterSameSiteClick,
  recordNewsletterClick,
} from "@/lib/admin/email-tracking";
import {
  safeHttpDestination,
  verifyTrackedClickDestination,
} from "@/lib/email-link-security";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ trackingId: string }>;
};

const fallbackUrl = "https://community.pgpz.org";

export async function GET(request: NextRequest, { params }: Props) {
  const { trackingId } = await params;
  const requestedDestination = request.nextUrl.searchParams.get("url");
  const redirectUrl = safeHttpDestination(requestedDestination);
  const signature = request.nextUrl.searchParams.get("sig");
  const validSignature =
    !!requestedDestination &&
    !!redirectUrl &&
    verifyTrackedClickDestination({
      trackingId,
      destination: requestedDestination,
      signature,
    });
  const legacySameSiteDestination =
    !signature &&
    !!redirectUrl &&
    new URL(redirectUrl).origin === new URL(fallbackUrl).origin;

  const recordClick = validSignature
    ? recordNewsletterClick
    : legacySameSiteDestination
      ? recordLegacyNewsletterSameSiteClick
      : null;
  const tracking = recordClick && redirectUrl
    ? await recordClick(trackingId, redirectUrl).catch((err) => {
        console.error("Newsletter click tracking failed", err);
        return null;
      })
    : null;

  const resolvedRedirectUrl: string = tracking && redirectUrl ? redirectUrl : fallbackUrl;
  return NextResponse.redirect(resolvedRedirectUrl, {
    headers: {
      "Cache-Control": "no-store, no-cache, max-age=0",
    },
  });
}
