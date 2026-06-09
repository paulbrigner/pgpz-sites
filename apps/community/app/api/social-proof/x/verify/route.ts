import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { enforceSocialProofRateLimit, SocialProofError, verifyXProof } from "@/lib/social-proof";

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

    const body = await request.json().catch(() => ({}));
    const postUrl = typeof body?.postUrl === "string" ? body.postUrl.trim() : "";
    if (!postUrl) {
      return NextResponse.json({ error: "X post URL is required" }, { status: 400 });
    }

    await enforceSocialProofRateLimit({
      action: "verify",
      userId,
      ipAddress: clientIp(request),
    });

    const proof = await verifyXProof(userId, postUrl);
    return NextResponse.json({ ok: true, proof });
  } catch (err) {
    if (err instanceof SocialProofError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Failed to verify X proof", err);
    return NextResponse.json({ error: "Failed to verify X proof" }, { status: 500 });
  }
}
