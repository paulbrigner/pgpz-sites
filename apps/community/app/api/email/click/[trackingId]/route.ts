import { NextRequest, NextResponse } from "next/server";
import { recordNewsletterClick } from "@/lib/admin/email-tracking";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ trackingId: string }>;
};

const fallbackUrl = "https://community.pgpz.org";

function safeRedirectUrl(value: string | null) {
  if (!value) return fallbackUrl;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return fallbackUrl;
    return url.toString();
  } catch {
    return fallbackUrl;
  }
}

export async function GET(request: NextRequest, { params }: Props) {
  const { trackingId } = await params;
  const redirectUrl = safeRedirectUrl(request.nextUrl.searchParams.get("url"));

  await recordNewsletterClick(trackingId, redirectUrl).catch((err) => {
    console.error("Newsletter click tracking failed", err);
  });

  return NextResponse.redirect(redirectUrl, {
    headers: {
      "Cache-Control": "no-store, no-cache, max-age=0",
    },
  });
}
