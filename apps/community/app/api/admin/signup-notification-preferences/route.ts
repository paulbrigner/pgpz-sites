import { createSignupNotificationPreferenceRouteHandlers } from "@pgpz/signup-notifications/routes";
import { NextResponse } from "next/server";
import { AdminAccessError, requireAdminSession } from "@/lib/admin/auth";
import {
  AdminSignupNotificationPreferenceError,
  getAdminSignupNotificationPreferences,
  updateAdminSignupNotificationPreferences,
} from "@/lib/admin/signup-notifications";

export const dynamic = "force-dynamic";

const handlers = createSignupNotificationPreferenceRouteHandlers({
  jsonResponse: (body, init) => NextResponse.json(body, init),
  requireAdminSession,
  createAdminAccessError: () => new AdminAccessError(),
  isAdminAccessError: (error) => error instanceof AdminAccessError,
  isPreferenceError: (error): error is AdminSignupNotificationPreferenceError =>
    error instanceof AdminSignupNotificationPreferenceError,
  getPreferences: getAdminSignupNotificationPreferences,
  updatePreferences: updateAdminSignupNotificationPreferences,
});

export function GET() {
  return handlers.GET();
}

export function PATCH(request: Request) {
  return handlers.PATCH(request);
}
