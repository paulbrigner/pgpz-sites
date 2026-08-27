import "server-only";

import { createHash } from "node:crypto";
import nodemailer from "nodemailer";
import type { MeetingCalendarArtifact } from "@/lib/meeting-calendar";
import { assertBoardEmailReady } from "@/lib/email-transport";
import { BOARD_DELIVERY_KINDS, type BoardDeliveryKind } from "@/lib/meetings";

export type MeetingCommunicationKind = BoardDeliveryKind;

export type MeetingEmailInput = {
  kind: MeetingCommunicationKind;
  meetingId: string;
  meetingTitle: string;
  meetingFormat?: "live" | "asynchronous";
  startsAt: string | Date;
  deadlineAt?: string | Date | null;
  timeZone: string;
  portalUrl: string;
  recipient: { email: string; name?: string | null };
  location?: string | null;
  virtualUrl?: string | null;
  calendar?: MeetingCalendarArtifact | null;
};

export type MeetingEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
  calendarAttachment?: MeetingCalendarArtifact;
};

type MeetingEmailDeliveryDependencies = {
  ready: typeof assertBoardEmailReady;
  createTransport: typeof nodemailer.createTransport;
};

const communicationKinds = new Set<MeetingCommunicationKind>(BOARD_DELIVERY_KINDS);

function requireSingleRecipient(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(normalized)) {
    throw new Error("recipient.email must be one valid email address");
  }
  return normalized;
}

function parseInstant(value: string | Date) {
  if (typeof value === "string" && !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    throw new Error("startsAt must include a UTC offset");
  }
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("startsAt is invalid");
  return date;
}

function requireSafeUrl(value: string, field: string) {
  const url = new URL(value);
  const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !localHttp) {
    throw new Error(`${field} must use HTTPS outside local development`);
  }
  return url.toString();
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] || character);
}

function validateTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
  } catch {
    throw new Error("timeZone must be a valid IANA time zone");
  }
  return timeZone;
}

function formatMeetingTime(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone,
  }).format(date);
}

const copy: Record<MeetingCommunicationKind, { prefix: string; opening: string }> = {
  invitation: { prefix: "Board meeting", opening: "You are invited to a PGPZ Board meeting." },
  "materials-ready": {
    prefix: "Materials ready",
    opening: "The agenda and preparation materials are ready for the upcoming PGPZ Board meeting.",
  },
  reminder: { prefix: "Reminder", opening: "This is a reminder about the upcoming PGPZ Board meeting." },
  "vote-reminder": { prefix: "Vote reminder", opening: "Your vote is still needed for this PGPZ Board asynchronous meeting." },
  update: { prefix: "Updated", opening: "The details for this PGPZ Board meeting have been updated." },
  cancellation: { prefix: "Cancelled", opening: "This PGPZ Board meeting has been cancelled." },
};

export function buildMeetingPortalUrl(siteUrl: string, meetingId: string) {
  const normalizedMeetingId = meetingId.trim();
  if (!normalizedMeetingId) throw new Error("meetingId is required");
  const base = requireSafeUrl(siteUrl, "siteUrl");
  return new URL(`/meetings/${encodeURIComponent(normalizedMeetingId)}`, base).toString();
}

export function buildMeetingCommunicationIdempotencyKey(input: {
  communicationId: string;
  meetingId: string;
  kind: MeetingCommunicationKind;
  sequence: number;
  recipientEmail: string;
}) {
  if (!input.communicationId.trim()) throw new Error("communicationId is required");
  if (!input.meetingId.trim()) throw new Error("meetingId is required");
  if (!communicationKinds.has(input.kind)) throw new Error("kind is invalid");
  if (!Number.isSafeInteger(input.sequence) || input.sequence < 0) {
    throw new Error("sequence must be a non-negative integer");
  }
  const recipient = requireSingleRecipient(input.recipientEmail);
  return createHash("sha256")
    .update([input.communicationId.trim(), input.meetingId.trim(), input.kind, String(input.sequence), recipient].join("\u0000"))
    .digest("hex");
}

export function buildBoardMeetingEmail(input: MeetingEmailInput): MeetingEmail {
  const to = requireSingleRecipient(input.recipient.email);
  const title = input.meetingTitle.trim();
  if (!title) throw new Error("meetingTitle is required");
  if (/\r|\n/.test(title)) throw new Error("meetingTitle cannot contain a line break");
  if (!input.meetingId.trim()) throw new Error("meetingId is required");
  if (!communicationKinds.has(input.kind)) throw new Error("kind is invalid");
  const startsAt = parseInstant(input.startsAt);
  const timeZone = validateTimeZone(input.timeZone);
  const portalUrl = requireSafeUrl(input.portalUrl, "portalUrl");
  const virtualUrl = input.virtualUrl ? requireSafeUrl(input.virtualUrl, "virtualUrl") : null;
  const when = formatMeetingTime(startsAt, timeZone);
  const deadline = input.deadlineAt ? formatMeetingTime(parseInstant(input.deadlineAt), timeZone) : null;
  if (input.kind === "vote-reminder" && !deadline) throw new Error("deadlineAt is required for a vote reminder");
  if (input.meetingFormat === "asynchronous" && !deadline) throw new Error("deadlineAt is required for an asynchronous meeting message");
  const greeting = input.recipient.name?.trim() ? `Hello ${input.recipient.name.trim()},` : "Hello,";
  const location = input.location?.trim();
  const message = copy[input.kind];
  const opening = input.meetingFormat === "asynchronous" && input.kind !== "vote-reminder"
    ? {
        invitation: "You are invited to participate in a PGPZ Board asynchronous written resolution.",
        "materials-ready": "The materials and written resolutions are ready for Board review and voting.",
        reminder: "This is a reminder about the current PGPZ Board asynchronous written resolution.",
        update: "The voting window or materials for this PGPZ Board asynchronous written resolution have been updated.",
        cancellation: "This PGPZ Board asynchronous written resolution has been cancelled.",
      }[input.kind] ?? message.opening
    : message.opening;

  const details = [
    title,
    input.kind === "vote-reminder" ? `Voting deadline: ${deadline}` : input.meetingFormat === "asynchronous" ? `Voting opens: ${when}` : when,
    input.meetingFormat === "asynchronous" && input.kind !== "vote-reminder" ? `Voting closes: ${deadline}` : null,
    location ? `Location: ${location}` : null,
    virtualUrl ? `Meeting link: ${virtualUrl}` : null,
  ].filter((value): value is string => Boolean(value));
  const text = [
    greeting,
    "",
    opening,
    "",
    ...details,
    "",
    `Open the meeting in the Board portal: ${portalUrl}`,
    "",
    input.kind === "vote-reminder" ? "Open the authenticated Board portal to review the motion and submit or update your vote before the deadline." : "Preparation materials remain in the authenticated Board portal and are not attached to this email.",
  ].join("\n");

  const htmlDetails = details.map((detail) => `<li>${escapeHtml(detail)}</li>`).join("");
  const html = [
    `<p>${escapeHtml(greeting)}</p>`,
    `<p>${escapeHtml(opening)}</p>`,
    `<ul>${htmlDetails}</ul>`,
    `<p><a href="${escapeHtml(portalUrl)}">Open this meeting in the Board portal</a></p>`,
    input.kind === "vote-reminder" ? "<p>Open the authenticated Board portal to review the motion and submit or update your vote before the deadline.</p>" : "<p>Preparation materials remain in the authenticated Board portal and are not attached to this email.</p>",
  ].join("");

  return {
    to,
    subject: `${message.prefix}: ${title} — ${input.kind === "vote-reminder" ? deadline : when}`,
    text,
    html,
    ...(input.calendar ? { calendarAttachment: input.calendar } : {}),
  };
}

/**
 * Delivers exactly one recipient's message. Campaign orchestration must call
 * this once per recipient and persist a per-recipient idempotency/result row.
 */
export async function deliverBoardMeetingEmail(
  email: MeetingEmail,
  dependencies: MeetingEmailDeliveryDependencies = {
    ready: assertBoardEmailReady,
    createTransport: nodemailer.createTransport,
  },
) {
  const { transport, from } = dependencies.ready();
  const transporter = dependencies.createTransport(transport as never);
  const calendar = email.calendarAttachment;
  const result = await transporter.sendMail({
    from,
    to: requireSingleRecipient(email.to),
    subject: email.subject,
    text: email.text,
    html: email.html,
    ...(calendar
      ? {
          icalEvent: {
            filename: calendar.filename,
            method: calendar.method,
            content: calendar.content,
          },
        }
      : {}),
  } as never);
  return { messageId: result.messageId ?? null };
}
