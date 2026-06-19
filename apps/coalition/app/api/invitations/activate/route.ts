import { NextRequest, NextResponse } from "next/server";
import { activateInvitation, InvitationError } from "@/lib/admin/invitations";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") || "";
  const redirectUrl = new URL("/signin", request.nextUrl.origin);
  redirectUrl.searchParams.set("callbackUrl", "/");

  try {
    await activateInvitation(token);
    redirectUrl.searchParams.set("reason", "invitation-activated");
  } catch (err) {
    if (err instanceof InvitationError) {
      redirectUrl.searchParams.set(
        "reason",
        err.status === 410 ? "invitation-expired" : "invitation-invalid",
      );
    } else {
      console.error("Invitation activation failed", err);
      redirectUrl.searchParams.set("reason", "invitation-invalid");
    }
  }

  return NextResponse.redirect(redirectUrl);
}
