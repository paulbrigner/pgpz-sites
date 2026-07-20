import type { AccountCapabilities } from "@pgpz/core";

export function canAccessCommunityXMonitor(
  capabilities: Pick<AccountCapabilities, "protectedContent"> | null | undefined,
): boolean {
  return capabilities?.protectedContent === true;
}
