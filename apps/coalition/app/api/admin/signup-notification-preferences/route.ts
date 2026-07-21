import { NextResponse } from "next/server";
import { AdminAccessError, requireAdminSession } from "@/lib/admin/auth";
import {
  AdminSignupNotificationPreferenceError,
  getAdminSignupNotificationPreferences,
  updateAdminSignupNotificationPreferences,
} from "@/lib/admin/signup-notifications";

export const dynamic = "force-dynamic";

const errorResponse = (error: unknown, fallback: string) => {
  if (error instanceof AdminAccessError) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  if (error instanceof AdminSignupNotificationPreferenceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error(fallback, error);
  return NextResponse.json({ error: fallback }, { status: 500 });
};

export async function GET() {
  try {
    const session = await requireAdminSession();
    if (!session.user.id) throw new AdminAccessError();
    return NextResponse.json(await getAdminSignupNotificationPreferences(session.user.id));
  } catch (error) {
    return errorResponse(error, "Failed to load notification preferences");
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireAdminSession();
    if (!session.user.id) throw new AdminAccessError();
    const body = await request.json().catch(() => null);
    if (
      !body ||
      typeof body.approvalRequested !== "boolean" ||
      typeof body.successfulJoin !== "boolean"
    ) {
      return NextResponse.json(
        { error: "Notification preferences must be true or false." },
        { status: 400 },
      );
    }

    return NextResponse.json(
      await updateAdminSignupNotificationPreferences({
        adminUserId: session.user.id,
        preferences: {
          approvalRequested: body.approvalRequested,
          successfulJoin: body.successfulJoin,
        },
      }),
    );
  } catch (error) {
    return errorResponse(error, "Failed to update notification preferences");
  }
}
