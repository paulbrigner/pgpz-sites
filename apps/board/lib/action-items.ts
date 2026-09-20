import type { BoardMeetingActionItem, BoardActionItemStatus } from "./meetings";

export type ActionItemChanges = { -readonly [K in "description" | "ownerName" | "dueAt" | "status"]?: BoardMeetingActionItem[K] };

export function validateActionItemChanges(value: unknown): ActionItemChanges {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Provide task changes.");
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !["description", "ownerName", "dueAt", "status"].includes(key))) throw new Error("Unsupported task field.");
  const changes: ActionItemChanges = {};
  for (const key of ["description", "ownerName"] as const) {
    if (!(key in input)) continue;
    if (typeof input[key] !== "string" || !input[key].trim() || input[key].trim().length > (key === "description" ? 4000 : 200)) throw new Error(`Enter a valid task ${key === "description" ? "description" : "owner"}.`);
    changes[key] = input[key].trim();
  }
  if ("status" in input) {
    if (typeof input.status !== "string" || !["open", "completed", "cancelled"].includes(input.status)) throw new Error("Choose a valid task status.");
    changes.status = input.status as BoardActionItemStatus;
  }
  if ("dueAt" in input) {
    if (input.dueAt === null) changes.dueAt = null;
    else {
      const date = input.dueAt;
      if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date.slice(0, 10)).toISOString().slice(0, 10) !== date.slice(0, 10)) throw new Error("Enter a valid due date.");
      changes.dueAt = date;
    }
  }
  return changes;
}

export function validateActionItemTransition(current: BoardActionItemStatus, changes: ActionItemChanges) {
  if (changes.status && changes.status !== current && current !== "open" && changes.status !== "open") throw new Error("Reopen the task before changing its outcome.");
  if (current !== "open" && ["description", "ownerName", "dueAt"].some((key) => key in changes)) throw new Error("Reopen the task before editing it.");
}

/** New due dates are calendar dates. Legacy timestamps retain the meeting timezone. */
export function actionItemDateInput(value: string | null, timeZone: string) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}
