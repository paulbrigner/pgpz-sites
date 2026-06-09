import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { createXChallenge, SocialProofError } from "@/lib/social-proof";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const session = await getServerSession(authOptions as any);
    const userId = (session as any)?.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
