import "server-only";
import { roleCanManageBoardMeetings, roleCanPrepareBoardMeetings, type BoardAccessRole } from "@/lib/board-access";
import { isDirectorRole } from "@/lib/executive-sessions";

export function notificationMeetingVisible(status: string, role: BoardAccessRole) {
  return status !== "draft" || roleCanPrepareBoardMeetings(role);
}
export function notificationBallotVisible(ballot: { status: string; review?: { everStarted?: boolean } | null }, role: BoardAccessRole) {
  return ballot.status !== "draft" || roleCanManageBoardMeetings(role) || (isDirectorRole(role) && ballot.review?.everStarted === true);
}
