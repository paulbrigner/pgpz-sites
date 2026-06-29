import { NextResponse } from "next/server";
import { resolveAppSession } from "@/lib/app-session";
import { getUserProofStatus, SocialProofError } from "@/lib/social-proof";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await resolveAppSession();
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const status = await getUserProofStatus(userId);
    return NextResponse.json(status);
  } catch (err) {
    if (err instanceof SocialProofError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Failed to load member verification status", err);
    return NextResponse.json({ error: "Failed to load member verification status" }, { status: 500 });
  }
}
