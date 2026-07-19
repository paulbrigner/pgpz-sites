import { NextRequest, NextResponse } from "next/server";
import { inspectInvitationActivationToken, InvitationError } from "@/lib/admin/invitations";
import { SITE_URL } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") || "";
  const redirectUrl = new URL("/signin", SITE_URL);
  redirectUrl.searchParams.set("callbackUrl", "/");

  try {
    await inspectInvitationActivationToken(token);
    redirectUrl.searchParams.set("reason", "invitation-pending");
  } catch (err) {
    if (err instanceof InvitationError) {
      redirectUrl.searchParams.set(
        "reason",
        err.status === 410 ? "invitation-expired" : "invitation-invalid",
      );
    } else {
      console.error("Invitation link validation failed", err);
      redirectUrl.searchParams.set("reason", "invitation-invalid");
    }
  }

  return NextResponse.redirect(redirectUrl);
}
