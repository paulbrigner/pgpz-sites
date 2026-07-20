import { handleCommunityXMonitorApiRequest } from "@/lib/x-monitor-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleCommunityXMonitorApiRequest(request, "window-summaries/latest");
}
