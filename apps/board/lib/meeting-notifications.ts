import contract from "@/config/meeting-notifications.json";
export const MEETING_NOTIFICATION_CATEGORIES = contract.categories;
export type MeetingNotificationCategory = keyof typeof contract.categories;
export interface MeetingNotificationPreference {
  enabled: boolean;
  scope: "meeting" | "items";
  ballotIds: string[];
  categories: MeetingNotificationCategory[];
  includeOwn: boolean;
  version: number;
}
export const DEFAULT_MEETING_NOTIFICATION_PREFERENCE: MeetingNotificationPreference = {
  enabled: false, scope: "meeting", ballotIds: [],
  categories: Object.keys(contract.categories) as MeetingNotificationCategory[], includeOwn: false, version: 0,
};
export function parseNotificationPreference(value: unknown, visibleBallotIds: readonly string[]): MeetingNotificationPreference {
  const body = value as Partial<MeetingNotificationPreference> | null;
  if (!body || typeof body.enabled !== "boolean" || typeof body.includeOwn !== "boolean" ||
      !["meeting", "items"].includes(body.scope || "") || !Number.isSafeInteger(body.version) || body.version! < 0 ||
      !Array.isArray(body.categories) || body.categories.some((c) => typeof c !== "string" || !Object.hasOwn(contract.categories, c)) ||
      !Array.isArray(body.ballotIds) || body.ballotIds.some((id) => typeof id !== "string") || body.ballotIds.length > 100) {
    throw new Error("Choose valid notification settings.");
  }
  const preference = { enabled: body.enabled, includeOwn: body.includeOwn, scope: body.scope!, version: body.version!, categories: [...new Set(body.categories)], ballotIds: body.scope === "items" ? [...new Set(body.ballotIds)] : [] };
  if (preference.scope === "items") preference.categories = preference.categories.filter((c) => ["materials", "resolutions", "discussion", "reviews", "consents"].includes(c));
  if (preference.enabled && (!preference.categories.length || (preference.scope === "items" && !preference.ballotIds.length))) throw new Error("Choose at least one category and, for selected resolutions, at least one resolution.");
  if (preference.enabled && preference.ballotIds.some((id) => !visibleBallotIds.includes(id))) throw new Error("A selected resolution is no longer available. Refresh your settings.");
  return preference;
}
