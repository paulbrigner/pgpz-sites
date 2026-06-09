import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { createXChallenge, enforceSocialProofRateLimit, SocialProofError } from "@/lib/social-proof";

export const dynamic = "force-dynamic";

const clientIp = (request: NextRequest) => {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    forwardedFor?.split(",")[0]?.trim() ||
    null
  );
};

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions as any);
    const userId = (session as any)?.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await enforceSocialProofRateLimit({
      action: "challenge",
      userId,
      ipAddress: clientIp(request),
    });

    const challenge = await createXChallenge(userId);
    return NextResponse.json(challenge);
  } catch (err) {
    if (err instanceof SocialProofError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Failed to create X proof challenge", err);
    return NextResponse.json({ error: "Failed to create proof challenge" }, { status: 500 });
  }
}
