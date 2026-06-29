import { NextRequest, NextResponse } from "next/server";
import { getSignedUrl } from "@/lib/cloudFrontSigner";
import {
  CLOUDFRONT_DOMAIN,
  KEY_PAIR_ID,
  PRIVATE_KEY_SECRET
} from "@/lib/config"; // Environment-specific constants
import { resolveAppSession } from "@/lib/app-session";

export const revalidate = 0;
export const runtime = "nodejs";


export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ file: string }> }
) {
  const { file } = await params;
  if (!file) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }

  const session = await resolveAppSession(request.headers);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.membershipStatus !== "active") {
    return NextResponse.json({ error: "Membership required" }, { status: 403 });
  }

  if (!CLOUDFRONT_DOMAIN || !KEY_PAIR_ID || !PRIVATE_KEY_SECRET) {
    console.error(
      "Missing required env: CLOUDFRONT_DOMAIN/KEY_PAIR_ID/PRIVATE_KEY_SECRET"
    );
    return NextResponse.json(
      { error: "Server misconfiguration" },
      { status: 500 }
    );
  }

  // Generate signed URL
  const privateKey = PRIVATE_KEY_SECRET;
  const expires = Math.floor(Date.now() / 1000) + 60 * 5; // 5 minutes from now
  const url = getSignedUrl({
    url: `https://${CLOUDFRONT_DOMAIN}/${file}`,
    keyPairId: KEY_PAIR_ID,
    privateKey,
    expires,
  });

  return NextResponse.json({ url });
}
