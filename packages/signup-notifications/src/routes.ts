import type { AdminSignupNotificationPreferences } from "./runtime";

type JsonResponse = {
  readonly status: number;
  json(): Promise<any>;
};

export function createSignupNotificationPreferenceRouteHandlers<
  ResponseType extends JsonResponse,
>({
  jsonResponse,
  requireAdminSession,
  createAdminAccessError,
  isAdminAccessError,
  isPreferenceError,
  getPreferences,
  updatePreferences,
  logError = console.error,
}: {
  jsonResponse(body: unknown, init?: { status?: number }): ResponseType;
  requireAdminSession(): Promise<any>;
  createAdminAccessError(): Error;
  isAdminAccessError(error: unknown): boolean;
  isPreferenceError(error: unknown): error is Error & { status: number };
  getPreferences(adminUserId: string): Promise<any>;
  updatePreferences(input: {
    adminUserId: string;
    preferences: AdminSignupNotificationPreferences;
  }): Promise<any>;
  logError?: (...values: any[]) => void;
}) {
  const errorResponse = (error: unknown, fallback: string) => {
    if (isAdminAccessError(error)) {
      return jsonResponse({ error: "Admin access required" }, { status: 403 });
    }
    if (isPreferenceError(error)) {
      return jsonResponse({ error: error.message }, { status: error.status });
    }
    logError(fallback, error);
    return jsonResponse({ error: fallback }, { status: 500 });
  };

  async function GET() {
    try {
      const session = await requireAdminSession();
      if (!session.user.id) throw createAdminAccessError();
      return jsonResponse(await getPreferences(session.user.id));
    } catch (error) {
      return errorResponse(error, "Failed to load notification preferences");
    }
  }

  async function PATCH(request: { json(): Promise<any> }) {
    try {
      const session = await requireAdminSession();
      if (!session.user.id) throw createAdminAccessError();
      const body = await request.json().catch(() => null);
      if (
        !body ||
        typeof body.approvalRequested !== "boolean" ||
        typeof body.successfulJoin !== "boolean"
      ) {
        return jsonResponse(
          { error: "Notification preferences must be true or false." },
          { status: 400 },
        );
      }
      return jsonResponse(
        await updatePreferences({
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

  return { GET, PATCH };
}
