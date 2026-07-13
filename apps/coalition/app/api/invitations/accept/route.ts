import { NextRequest, NextResponse } from "next/server";
import { resolveAppSession } from "@/lib/app-session";
import {
  acceptAuthenticatedInvitation,
  InvitationError,
} from "@/lib/admin/invitations";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const session = await resolveAppSession(request.headers);
    const userId = session?.user?.id;
    const email = session?.user?.email;
    if (!userId || !email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await acceptAuthenticatedInvitation({ userId, email });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof InvitationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Authenticated invitation acceptance failed", err);
    return NextResponse.json({ error: "Failed to accept invitation" }, { status: 500 });
  }
}
