/** Board-only proposal records; interest and discussion never constitute consent. */
export const IDEA_STATUSES = ["open", "scheduled", "deferred", "closed", "withdrawn"] as const;
export type IdeaStatus = (typeof IDEA_STATUSES)[number];
export interface AgendaIdea {
  id: string;
  title: string;
  description: string;
  presenter: string;
  preferredMeetingId: string | null;
  documentIds: string[];
  authorAccessId: string;
  authorName: string;
  status: IdeaStatus;
  reason: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  editedAt: string | null;
  scheduledMeetingId: string | null;
  agendaItemId: string | null;
}
export interface IdeaMessage {
  id: string;
  authorAccessId: string;
  authorName: string;
  body: string;
  replyToId: string | null;
  createdAt: string;
  editedAt: string | null;
}
export interface IdeaRevision {
  id: string;
  action: string;
  actorName: string;
  occurredAt: string;
  idea: AgendaIdea;
  message: IdeaMessage | null;
}
export interface IdeaChoices {
  meetings: { id: string; title: string; version: number; startAt: string; timeZone: string }[];
  documents: { id: string; title: string }[];
}
export interface IdeaDetail {
  idea: AgendaIdea;
  messages: IdeaMessage[];
  history: IdeaRevision[];
  viewerAccessId: string;
  canManage: boolean;
  documents: { id: string; title: string }[];
  preferredMeeting: { id: string; title: string } | null;
  scheduledMeeting: { id: string; title: string; status: string; agendaItemActive: boolean } | null;
}
export const ideaStatusLabel = (status: IdeaStatus) => status.charAt(0).toUpperCase() + status.slice(1);
export const ideaDiscussionOpen = (idea: AgendaIdea) => !["closed", "withdrawn"].includes(idea.status);
export class IdeaError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
export function ideaText(value: unknown, label: string, max: number, optional = false): string {
  if (typeof value !== "string" || (!optional && !value.trim()) || value.trim().length > max) {
    throw new IdeaError(`${label} must ${optional ? "" : "be provided and "}be at most ${max.toLocaleString()} characters.`);
  }
  return value.trim();
}
export function ideaId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new IdeaError("Invalid record identifier.");
  return value;
}
