import { handleCommunityXMonitorApiRequest } from "@/lib/x-monitor-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ statusId: string }> },
) {
  const { statusId } = await context.params;
  const normalizedStatusId = statusId?.trim() || "";
  return handleCommunityXMonitorApiRequest(
    request,
    /^[0-9]{1,32}$/.test(normalizedStatusId) ? `posts/${normalizedStatusId}` : null,
  );
}
