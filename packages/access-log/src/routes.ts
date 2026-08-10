import type {
  AccessEventType,
  ListAccessLogOptions,
  RecordAccessEventParams,
} from "./runtime";

type JsonResponse = {
  readonly status: number;
  json(): Promise<any>;
};

export type AccessLogAdminRequest = {
  nextUrl: { searchParams: { get(name: string): string | null } };
};

export type AccessLogPageViewRequest = {
  headers: Headers;
  json(): Promise<any>;
};

export function createAccessLogAdminRouteHandler<ResponseType extends JsonResponse>({
  jsonResponse,
  requireAdminSession,
  isAdminAccessError,
  listAccessLog,
  logError = console.error,
}: {
  jsonResponse(body: unknown, init?: { status?: number }): ResponseType;
  requireAdminSession(): Promise<any>;
  isAdminAccessError(error: unknown): boolean;
  listAccessLog(options: ListAccessLogOptions): Promise<any>;
  logError?: (...values: any[]) => void;
}) {
  return async function GET(request: AccessLogAdminRequest) {
    try {
      await requireAdminSession();
      const eventTypeParam = request.nextUrl.searchParams.get("eventType");
      const eventType: AccessEventType | "all" =
        eventTypeParam === "login" || eventTypeParam === "page_view"
          ? eventTypeParam
          : "all";
      const userId = request.nextUrl.searchParams.get("userId") || null;
      const omitAdmins = request.nextUrl.searchParams.get("omitAdmins") === "true";
      const limit = Number(request.nextUrl.searchParams.get("limit") || 200);
      const days = Math.min(
        Math.max(Number(request.nextUrl.searchParams.get("days") || 30), 1),
        90,
      );
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      return jsonResponse(
        await listAccessLog({ eventType, userId, omitAdmins, limit, since }),
      );
    } catch (error) {
      if (isAdminAccessError(error)) {
        return jsonResponse({ error: "Admin access required" }, { status: 403 });
      }
      logError("Failed to load access log", error);
      return jsonResponse({ error: "Failed to load access log" }, { status: 500 });
    }
  };
}

export function createAccessLogPageViewRouteHandler<ResponseType extends JsonResponse>({
  jsonResponse,
  emptyResponse,
  resolveAppSession,
  getAccessLogRequestMetadata,
  getUserDisplayName,
  recordAccessEvent,
  logError = console.error,
}: {
  jsonResponse(body: unknown, init?: { status?: number }): ResponseType;
  emptyResponse(status: number): ResponseType;
  resolveAppSession(headers: Headers): Promise<any>;
  getAccessLogRequestMetadata(headers: Headers): {
    ipAddress: string | null;
    userAgent: string | null;
  };
  getUserDisplayName(user: any): string | null;
  recordAccessEvent(params: RecordAccessEventParams): Promise<any>;
  logError?: (...values: any[]) => void;
}) {
  return async function POST(request: AccessLogPageViewRequest) {
    try {
      const session = await resolveAppSession(request.headers);
      const user = session?.user || null;
      const userId = typeof user?.id === "string" ? user.id : "";
      if (!userId) return emptyResponse(204);

      const body = await request.json().catch(() => ({}));
      const metadata = getAccessLogRequestMetadata(request.headers);
      await recordAccessEvent({
        eventType: "page_view",
        authProvider: session?.authProvider || null,
        userId,
        isAdmin: user?.isAdmin === true,
        email: typeof user?.email === "string" ? user.email : null,
        name: user ? getUserDisplayName(user) : null,
        membershipStatus:
          typeof user?.membershipStatus === "string" ? user.membershipStatus : null,
        path: typeof body?.path === "string" ? body.path : null,
        title: typeof body?.title === "string" ? body.title : null,
        referrer: typeof body?.referrer === "string" ? body.referrer : null,
        ...metadata,
      });
      return jsonResponse({ ok: true });
    } catch (error) {
      logError("Failed to record access page view", error);
      return jsonResponse({ error: "Failed to record page view" }, { status: 500 });
    }
  };
}
