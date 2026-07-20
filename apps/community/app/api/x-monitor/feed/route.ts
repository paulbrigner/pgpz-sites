import { handleCommunityXMonitorApiRequest } from "@/lib/x-monitor-api";
import { buildCommunityXMonitorProxySearch } from "@/lib/x-monitor-query";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleCommunityXMonitorApiRequest(
    request,
    "feed",
    buildCommunityXMonitorProxySearch(request.url, "feed"),
  );
}
