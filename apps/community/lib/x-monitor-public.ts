export const COMMUNITY_X_MONITOR_PATH = "/x-monitor";

export function isCommunityXMonitorEnabled(): boolean {
  return process.env.NEXT_PUBLIC_XMONITOR_ENABLED?.trim().toLowerCase() === "true";
}
