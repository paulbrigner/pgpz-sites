import { resolveAppSession } from "@/lib/app-session";
import { canAccessCommunityXMonitor } from "@/lib/x-monitor-access";
import {
  CommunityXMonitorConfigurationError,
  communityXMonitorEnabledForRequest,
  proxyCommunityXMonitorRead,
} from "@/lib/x-monitor-server";

const privateHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex",
};

export async function handleCommunityXMonitorApiRequest(
  request: Request,
  upstreamPath: string | null,
  upstreamSearch = new URLSearchParams(),
): Promise<Response> {
  if (!communityXMonitorEnabledForRequest()) {
    return Response.json({ error: "not found" }, { status: 404, headers: privateHeaders });
  }

  const session = await resolveAppSession(request.headers);
  if (!session) {
    return Response.json({ error: "authentication required" }, { status: 401, headers: privateHeaders });
  }
  if (!canAccessCommunityXMonitor(session.capabilities)) {
    return Response.json({ error: "membership required" }, { status: 403, headers: privateHeaders });
  }
  if (!upstreamPath) {
    return Response.json(
      { error: "a valid status ID is required" },
      { status: 400, headers: privateHeaders },
    );
  }

  try {
    return await proxyCommunityXMonitorRead(upstreamPath, upstreamSearch);
  } catch (error) {
    const status = error instanceof CommunityXMonitorConfigurationError ? 503 : 502;
    return Response.json(
      { error: status === 503 ? "X Monitor is unavailable" : "X Monitor upstream request failed" },
      { status, headers: privateHeaders },
    );
  }
}
