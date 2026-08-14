export const BOARD_MEETING_STATUSES = [
  "draft", "scheduled", "materials-published", "completed", "closed", "cancelled",
] as const;
export type BoardMeetingStatus = (typeof BOARD_MEETING_STATUSES)[number];
export type MeetingStatus = BoardMeetingStatus;

export const BOARD_MEETING_TYPES = ["regular", "special", "annual", "committee", "other"] as const;
export type BoardMeetingType = (typeof BOARD_MEETING_TYPES)[number];
export type MeetingType = BoardMeetingType;

export const BOARD_MINUTES_STATUSES = ["not-started", "draft", "pending-approval", "approved", "amended"] as const;
export type BoardMinutesStatus = (typeof BOARD_MINUTES_STATUSES)[number];
export type MinutesStatus = BoardMinutesStatus;

export const BOARD_AGENDA_ITEM_KINDS = ["information", "discussion", "decision", "consent"] as const;
export type BoardAgendaItemKind = (typeof BOARD_AGENDA_ITEM_KINDS)[number];
export type AgendaItemKind = BoardAgendaItemKind;

export const BOARD_ATTENDANCE_STATUSES = ["invited", "accepted", "declined", "tentative", "attended", "absent"] as const;
export type BoardAttendanceStatus = (typeof BOARD_ATTENDANCE_STATUSES)[number];
export type AttendanceStatus = BoardAttendanceStatus;

export const BOARD_ACTION_ITEM_STATUSES = ["open", "completed", "cancelled"] as const;
export type BoardActionItemStatus = (typeof BOARD_ACTION_ITEM_STATUSES)[number];

export const BOARD_DELIVERY_KINDS = ["invitation", "materials-ready", "reminder", "update", "cancellation"] as const;
export type BoardDeliveryKind = (typeof BOARD_DELIVERY_KINDS)[number];
export const BOARD_DELIVERY_STATUSES = ["pending", "sent", "failed"] as const;
export type BoardDeliveryStatus = (typeof BOARD_DELIVERY_STATUSES)[number];

export interface BoardMeeting {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly type: BoardMeetingType;
  readonly status: BoardMeetingStatus;
  readonly startAt: string;
  readonly endAt: string;
  readonly timeZone: string;
  readonly location: string;
  readonly virtualUrl: string | null;
  readonly version: number;
  readonly minutesStatus: BoardMinutesStatus;
  readonly minutesDocumentId: string | null;
  readonly cancellationReason: string | null;
  readonly quorumRequired: number | null;
  readonly quorumConfirmedAt: string | null;
  readonly quorumConfirmedBy: string | null;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly updatedAt: string;
  readonly updatedBy: string;
}

export interface BoardAgendaItem {
  readonly id: string;
  readonly meetingId: string;
  readonly order: number;
  readonly title: string;
  readonly description: string;
  readonly kind: BoardAgendaItemKind;
  readonly presenter: string;
  readonly allottedMinutes: number | null;
  readonly status: "active" | "removed";
  readonly updatedAt: string;
  readonly updatedBy: string;
}

export interface BoardMeetingAttendance {
  readonly meetingId: string;
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  readonly status: BoardAttendanceStatus;
  readonly arrivedAt: string | null;
  readonly departedAt: string | null;
  readonly quorumEligible: boolean;
  readonly notes: string;
  readonly updatedAt: string;
  readonly updatedBy: string;
}

export interface BoardMeetingDecision {
  readonly id: string;
  readonly meetingId: string;
  readonly agendaItemId: string | null;
  readonly title: string;
  readonly motion: string;
  readonly mover: string | null;
  readonly seconder: string | null;
  readonly yes: number;
  readonly no: number;
  readonly abstain: number;
  readonly recused: number;
  readonly outcome: "passed" | "failed" | "withdrawn" | "tabled";
  readonly recordedAt: string;
  readonly recordedBy: string;
  readonly supersedesDecisionId: string | null;
}
export const BOARD_DECISION_OUTCOMES = ["passed", "failed", "withdrawn", "tabled"] as const;

export interface BoardMeetingActionItem {
  readonly id: string;
  readonly meetingId: string;
  readonly agendaItemId: string | null;
  readonly description: string;
  readonly ownerId: string | null;
  readonly ownerName: string;
  readonly dueAt: string | null;
  readonly status: BoardActionItemStatus;
  readonly updatedAt: string;
  readonly updatedBy: string;
}

export interface BoardMeetingDelivery {
  readonly id: string;
  readonly communicationId: string;
  readonly attemptId: string;
  readonly meetingId: string;
  readonly kind: BoardDeliveryKind;
  readonly status: BoardDeliveryStatus;
  readonly recipientEmail: string;
  readonly idempotencyKey: string;
  readonly occurredAt: string;
  readonly actorEmail: string;
  readonly failureReason: string | null;
}

export interface BoardMeetingDetail {
  readonly meeting: BoardMeeting;
  readonly agendaItems: readonly BoardAgendaItem[];
  readonly attendance: readonly BoardMeetingAttendance[];
  readonly decisions: readonly BoardMeetingDecision[];
  readonly actionItems: readonly BoardMeetingActionItem[];
  readonly deliveries: readonly BoardMeetingDelivery[];
}

export interface BoardMeetingListPage {
  readonly meetings: readonly BoardMeeting[];
  readonly cursor: Record<string, unknown> | null;
}

export class BoardMeetingVersionConflictError extends Error {
  constructor(readonly meetingId: string) {
    super(`Board meeting ${meetingId} was updated by another request.`);
    this.name = "BoardMeetingVersionConflictError";
  }
}
