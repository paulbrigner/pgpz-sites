import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getAccessLogRequestMetadata, recordAccessEvent } from "@/lib/admin/access-log";
import { getUserDisplayName } from "@/lib/user-display-name";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions as any);
    const user = (session as any)?.user || null;
    const userId = typeof user?.id === "string" ? user.id : "";
    if (!userId) return new NextResponse(null, { status: 204 });

    const body = await request.json().catch(() => ({}));
    const metadata = getAccessLogRequestMetadata(request.headers);

    await recordAccessEvent({
      eventType: "page_view",
      userId,
      email: typeof user?.email === "string" ? user.email : null,
      name: getUserDisplayName(user),
      membershipStatus: typeof user?.membershipStatus === "string" ? user.membershipStatus : null,
      path: typeof body?.path === "string" ? body.path : null,
      title: typeof body?.title === "string" ? body.title : null,
      referrer: typeof body?.referrer === "string" ? body.referrer : null,
      ...metadata,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to record access page view", err);
    return NextResponse.json({ error: "Failed to record page view" }, { status: 500 });
  }
}
