export const COMMUNITY_X_MONITOR_PATH = "/x-monitor";
export const COMMUNITY_X_MONITOR_BRIEFINGS_PATH = "/x-monitor/briefings";

export function isCommunityXMonitorEnabled(): boolean {
  return process.env.NEXT_PUBLIC_XMONITOR_ENABLED?.trim().toLowerCase() === "true";
}

export function isCommunityXMonitorBriefingsEnabled(): boolean {
  return isCommunityXMonitorEnabled() &&
    process.env.NEXT_PUBLIC_XMONITOR_BRIEFINGS_ENABLED?.trim().toLowerCase() === "true";
}
