import { NextRequest, NextResponse } from "next/server";
import { recordNewsletterOpen, trackingClientInfoFromHeaders } from "@/lib/admin/email-tracking";

export const dynamic = "force-dynamic";

const transparentPixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);

type Props = {
  params: Promise<{ trackingId: string }>;
};

export async function GET(request: NextRequest, { params }: Props) {
  const { trackingId } = await params;
  await recordNewsletterOpen(trackingId, trackingClientInfoFromHeaders(request.headers)).catch((err) => {
    console.error("Newsletter open tracking failed", err);
  });

  return new NextResponse(transparentPixel, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store, no-cache, max-age=0",
    },
  });
}
