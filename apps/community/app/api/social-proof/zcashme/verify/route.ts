import { NextRequest, NextResponse } from "next/server";
import { resolveAppSession } from "@/lib/app-session";
import {
  enforceSocialProofRateLimit,
  SocialProofError,
  verifyZcashMeProof,
} from "@/lib/social-proof";

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
    const session = await resolveAppSession(request.headers);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await enforceSocialProofRateLimit({
      action: "verify",
      userId,
      ipAddress: clientIp(request),
    });

    const proof = await verifyZcashMeProof(userId);
    return NextResponse.json({ ok: true, proof });
  } catch (err) {
    if (err instanceof SocialProofError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Failed to verify ZcashMe proof", err);
    return NextResponse.json({ error: "Failed to verify ZcashMe proof" }, { status: 500 });
  }
}
