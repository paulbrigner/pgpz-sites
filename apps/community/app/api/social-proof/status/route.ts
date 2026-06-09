import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getUserProofStatus, SocialProofError } from "@/lib/social-proof";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions as any);
    const userId = (session as any)?.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const status = await getUserProofStatus(userId);
    return NextResponse.json(status);
  } catch (err) {
    if (err instanceof SocialProofError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Failed to load social proof status", err);
    return NextResponse.json({ error: "Failed to load social proof status" }, { status: 500 });
  }
}
