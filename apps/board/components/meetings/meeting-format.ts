import type { MeetingStatus, MeetingType, MinutesStatus } from "./types";

export function formatMeetingDate(startAt: string, endAt: string, timeZone: string) {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const date = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone,
  }).format(start);
  const startTime = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(start);
  const endTime = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  }).format(end);
  return { date, time: `${startTime}–${endTime}` };
}

export function formatShortMeetingDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  }).format(new Date(value));
}

export function meetingStatusLabel(status: MeetingStatus) {
  return {
    draft: "Draft",
    scheduled: "Scheduled",
    "materials-published": "Materials published",
    completed: "Completed",
    closed: "Closed",
    cancelled: "Cancelled",
  }[status];
}

export function minutesStatusLabel(status: MinutesStatus) {
  return {
    "not-started": "Not started",
    draft: "Draft",
    "pending-approval": "Pending approval",
    approved: "Approved",
    amended: "Amended",
  }[status];
}

export function meetingTypeLabel(type: MeetingType) {
  return {
    regular: "Regular meeting",
    special: "Special meeting",
    annual: "Annual meeting",
    committee: "Committee meeting",
    other: "Board meeting",
  }[type];
}
