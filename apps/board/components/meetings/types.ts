export type MeetingStatus =
  | "draft"
  | "scheduled"
  | "materials-published"
  | "completed"
  | "closed"
  | "cancelled";

export type MinutesStatus = "not-started" | "draft" | "pending-approval" | "approved" | "amended";

export type MeetingType = "regular" | "special" | "annual" | "committee" | "other";
export type MeetingFormat = "live" | "asynchronous";

export interface MeetingSummaryView {
  id: string;
  title: string;
  description: string;
  type: MeetingType;
  format: MeetingFormat;
  status: MeetingStatus;
  startAt: string;
  endAt: string;
  timeZone: string;
  location: string | null;
  virtualUrl: string | null;
  version: number;
  minutesStatus: MinutesStatus;
  quorumRequired?: number | null;
  quorumConfirmedAt?: string | null;
  quorumConfirmedBy?: string | null;
}

export interface AgendaItemView {
  id: string;
  title: string;
  description: string;
  kind: "information" | "discussion" | "decision" | "consent";
  order: number;
  presenter: string | null;
  durationMinutes: number | null;
}

export interface AttendanceView {
  id: string;
  name: string;
  email: string;
  status: "invited" | "accepted" | "declined" | "tentative" | "attended" | "absent";
  quorumEligible?: boolean;
}

export interface DecisionView {
  id: string;
  title: string;
  motion: string;
  outcome: string;
  yes: number;
  no: number;
  abstain: number;
  recused: number;
}

export type AsyncVoteChoice = "yes" | "no" | "abstain" | "recused";
export type AsyncBallotEffectiveStatus = "draft" | "scheduled" | "open" | "awaiting-finalization" | "closed" | "cancelled";

export interface DiscussionMessageView {
  id: string;
  replyToMessageId: string | null;
  authorName: string;
  authorEmail: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  editedAt: string | null;
  canEdit: boolean;
}

export interface AsyncBallotView {
  id: string;
  title: string;
  motion: string;
  effectiveStatus: AsyncBallotEffectiveStatus;
  eligibleCount: number;
  ballotsCast: number;
  quorumRequired: number | null;
  approvalRequired: number | null;
  viewerEligible: boolean;
  viewerChoice: AsyncVoteChoice | null;
  discussionMessages: DiscussionMessageView[];
  result: null | {
    yes: number;
    no: number;
    abstain: number;
    recused: number;
    quorumMet: boolean;
    outcome: "passed" | "failed" | "no-quorum";
  };
}

export interface ActionItemView {
  id: string;
  title: string;
  owner: string;
  dueAt: string | null;
  status: "open" | "completed" | "cancelled";
}

export interface MeetingMaterialView {
  id: string;
  title: string;
  description: string;
  section: "agenda" | "preparation" | "minutes" | "resolution" | "other";
  downloadHref: string;
  versionLabel: string;
  updatedAt: string;
}

export interface DeliveryView {
  id: string;
  kind: string;
  status: string;
  sentAt: string;
  recipientCount: number;
}

export interface MeetingDetailView {
  meeting: MeetingSummaryView;
  agendaItems: AgendaItemView[];
  materials: MeetingMaterialView[];
  attendance: AttendanceView[];
  decisions: DecisionView[];
  asyncBallots: AsyncBallotView[];
  actionItems: ActionItemView[];
  deliveries: DeliveryView[];
}

export interface MeetingCapabilities {
  canManage: boolean;
  canPrepare: boolean;
  canManageDocuments: boolean;
  canDiscuss: boolean;
}
