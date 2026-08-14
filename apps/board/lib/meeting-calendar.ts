const CALENDAR_DOMAIN = "board.pgpz.org";
const CALENDAR_PROD_ID = "-//PGPZ//Board Meetings//EN";

export type MeetingCalendarMethod = "PUBLISH" | "REQUEST" | "CANCEL";

export type MeetingCalendarPerson = {
  email: string;
  name?: string | null;
};

export type MeetingCalendarInput = {
  meetingId: string;
  title: string;
  startsAt: string | Date;
  endsAt: string | Date;
  portalUrl: string;
  sequence: number;
  generatedAt?: string | Date;
  method?: MeetingCalendarMethod;
  description?: string | null;
  location?: string | null;
  virtualUrl?: string | null;
  organizer?: MeetingCalendarPerson | null;
  attendee?: MeetingCalendarPerson | null;
};

export type MeetingCalendarArtifact = {
  content: string;
  contentType: string;
  filename: string;
  method: MeetingCalendarMethod;
  uid: string;
};

function requireText(value: string, field: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required`);
  if (/\r|\n/.test(normalized)) throw new Error(`${field} cannot contain a line break`);
  return normalized;
}

function requireEmail(value: string) {
  const email = requireText(value, "email").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("email is invalid");
  return email;
}

function requireSafeUrl(value: string, field: string) {
  const url = new URL(value);
  const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !localHttp) {
    throw new Error(`${field} must use HTTPS outside local development`);
  }
  return url.toString();
}

function parseInstant(value: string | Date, field: string) {
  if (typeof value === "string" && !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    throw new Error(`${field} must include a UTC offset`);
  }
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${field} is invalid`);
  return date;
}

function formatUtc(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function parameterValue(value: string) {
  return `"${value.replace(/[\r\n]/g, " ").replace(/"/g, "'")}"`;
}

/** RFC 5545 content lines are limited to 75 octets and continue with one space. */
export function foldCalendarLine(line: string) {
  const chunks: string[] = [];
  let chunk = "";
  let limit = 75;

  for (const character of line) {
    const candidate = chunk + character;
    if (Buffer.byteLength(candidate, "utf8") > limit) {
      if (!chunk) throw new Error("Unable to fold calendar content line");
      chunks.push(chunk);
      chunk = character;
      limit = 74;
    } else {
      chunk = candidate;
    }
  }
  chunks.push(chunk);
  return chunks.join("\r\n ");
}

export function buildMeetingCalendarUid(meetingId: string) {
  return `${encodeURIComponent(requireText(meetingId, "meetingId"))}@${CALENDAR_DOMAIN}`;
}

function slugifyFilename(value: string) {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return `${slug || "board-meeting"}.ics`;
}

export function buildMeetingCalendar(input: MeetingCalendarInput): MeetingCalendarArtifact {
  const title = requireText(input.title, "title");
  const startsAt = parseInstant(input.startsAt, "startsAt");
  const endsAt = parseInstant(input.endsAt, "endsAt");
  const generatedAt = parseInstant(input.generatedAt ?? new Date(), "generatedAt");
  if (endsAt <= startsAt) throw new Error("endsAt must be after startsAt");
  if (!Number.isSafeInteger(input.sequence) || input.sequence < 0) {
    throw new Error("sequence must be a non-negative integer");
  }

  const portalUrl = requireSafeUrl(input.portalUrl, "portalUrl");
  const virtualUrl = input.virtualUrl ? requireSafeUrl(input.virtualUrl, "virtualUrl") : null;
  const method = input.method ?? (input.attendee ? "REQUEST" : "PUBLISH");
  if ((method === "REQUEST" || method === "CANCEL") && (!input.organizer || !input.attendee)) {
    throw new Error(`${method} calendar messages require an organizer and one attendee`);
  }
  const uid = buildMeetingCalendarUid(input.meetingId);
  const lines = [
    "BEGIN:VCALENDAR",
    `PRODID:${CALENDAR_PROD_ID}`,
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    `UID:${escapeText(uid)}`,
    `DTSTAMP:${formatUtc(generatedAt)}`,
    `DTSTART:${formatUtc(startsAt)}`,
    `DTEND:${formatUtc(endsAt)}`,
    `SEQUENCE:${input.sequence}`,
    `STATUS:${method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
    `SUMMARY:${escapeText(title)}`,
    `URL:${escapeText(portalUrl)}`,
  ];

  const description = [input.description?.trim(), `Board portal: ${portalUrl}`].filter(Boolean).join("\n\n");
  lines.push(`DESCRIPTION:${escapeText(description)}`);
  if (input.location?.trim()) lines.push(`LOCATION:${escapeText(input.location.trim())}`);
  if (virtualUrl) lines.push(`CONFERENCE;VALUE=URI:${escapeText(virtualUrl)}`);
  if (input.organizer) {
    const email = requireEmail(input.organizer.email);
    const cn = input.organizer.name?.trim() || "PGPZ Board";
    lines.push(`ORGANIZER;CN=${parameterValue(cn)}:mailto:${email}`);
  }
  if (input.attendee) {
    const email = requireEmail(input.attendee.email);
    const cn = input.attendee.name?.trim() || email;
    lines.push(
      `ATTENDEE;CN=${parameterValue(cn)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${email}`,
    );
  }
  lines.push("END:VEVENT", "END:VCALENDAR");

  return {
    content: `${lines.map(foldCalendarLine).join("\r\n")}\r\n`,
    contentType: `text/calendar; charset=utf-8; method=${method}`,
    filename: slugifyFilename(title),
    method,
    uid,
  };
}
