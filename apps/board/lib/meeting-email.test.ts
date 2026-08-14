import { describe, expect, it } from "vitest";
import { buildMeetingCalendar } from "@/lib/meeting-calendar";
import {
  buildBoardMeetingEmail,
  buildMeetingCommunicationIdempotencyKey,
  buildMeetingPortalUrl,
  deliverBoardMeetingEmail,
} from "@/lib/meeting-email";

describe("Board meeting email", () => {
  const base = {
    meetingId: "meeting-123",
    meetingTitle: "Quarterly <Review>",
    startsAt: "2026-09-10T17:00:00Z",
    timeZone: "America/New_York",
    portalUrl: "https://board.pgpz.org/meetings/meeting-123",
    recipient: { email: "DIRECTOR@example.org", name: "A. Director" },
  } as const;

  it.each([
    ["invitation", "Board meeting"],
    ["materials-ready", "Materials ready"],
    ["reminder", "Reminder"],
    ["update", "Updated"],
    ["cancellation", "Cancelled"],
  ] as const)("builds a private %s message", (kind, prefix) => {
    const email = buildBoardMeetingEmail({ ...base, kind });
    expect(email.to).toBe("director@example.org");
    expect(email.subject.startsWith(`${prefix}:`)).toBe(true);
    expect(email.text).toContain("Thursday, September 10, 2026 at 1:00 PM EDT");
    expect(email.text).toContain(base.portalUrl);
    expect(email.text).toContain("not attached");
    expect(email.html).toContain("Quarterly &lt;Review&gt;");
    expect(email.html).not.toContain("Quarterly <Review>");
  });

  it("returns the individual calendar artifact for an invitation", () => {
    const calendar = buildMeetingCalendar({
      meetingId: base.meetingId,
      title: base.meetingTitle,
      startsAt: base.startsAt,
      endsAt: "2026-09-10T19:00:00Z",
      portalUrl: base.portalUrl,
      generatedAt: "2026-08-13T12:00:00Z",
      sequence: 1,
      method: "REQUEST",
      organizer: { email: "chair@pgpz.org", name: "Board Chair" },
      attendee: base.recipient,
    });
    expect(buildBoardMeetingEmail({ ...base, kind: "invitation", calendar }).calendarAttachment).toBe(calendar);
  });

  it("rejects recipient-list leakage and invalid time zones", () => {
    expect(() =>
      buildBoardMeetingEmail({ ...base, kind: "reminder", recipient: { email: "a@example.org,b@example.org" } }),
    ).toThrow("one valid email address");
    expect(() => buildBoardMeetingEmail({ ...base, kind: "reminder", timeZone: "Moon/Base" })).toThrow(
      "valid IANA time zone",
    );
    expect(() =>
      buildBoardMeetingEmail({ ...base, kind: "reminder", meetingTitle: "Meeting\r\nBcc: attacker@example.org" }),
    ).toThrow("cannot contain a line break");
    expect(() => buildBoardMeetingEmail({ ...base, kind: "reminder", portalUrl: "javascript:alert(1)" })).toThrow(
      "portalUrl must use HTTPS",
    );
  });

  it("builds stable per-recipient retry keys and distinct campaign keys", () => {
    const input = {
      communicationId: "campaign-1",
      meetingId: "meeting-123",
      kind: "reminder" as const,
      sequence: 2,
      recipientEmail: "Director@Example.org",
    };
    const first = buildMeetingCommunicationIdempotencyKey(input);
    expect(first).toHaveLength(64);
    expect(buildMeetingCommunicationIdempotencyKey({ ...input, recipientEmail: "director@example.org" })).toBe(first);
    expect(buildMeetingCommunicationIdempotencyKey({ ...input, communicationId: "campaign-2" })).not.toBe(first);
  });

  it("builds only HTTPS production portal URLs", () => {
    expect(buildMeetingPortalUrl("https://board.pgpz.org", "meeting/123")).toBe(
      "https://board.pgpz.org/meetings/meeting%2F123",
    );
    expect(buildMeetingPortalUrl("http://localhost:3002", "meeting-123")).toBe(
      "http://localhost:3002/meetings/meeting-123",
    );
    expect(() => buildMeetingPortalUrl("http://board.pgpz.org", "meeting-123")).toThrow("must use HTTPS");
  });

  it("delivers one recipient with an iCalendar event", async () => {
    const calendar = buildMeetingCalendar({
      meetingId: base.meetingId,
      title: base.meetingTitle,
      startsAt: base.startsAt,
      endsAt: "2026-09-10T19:00:00Z",
      portalUrl: base.portalUrl,
      generatedAt: "2026-08-13T12:00:00Z",
      sequence: 1,
      method: "REQUEST",
      organizer: { email: "chair@pgpz.org" },
      attendee: base.recipient,
    });
    const email = buildBoardMeetingEmail({ ...base, kind: "invitation", calendar });
    const sent: Record<string, unknown>[] = [];
    const result = await deliverBoardMeetingEmail(email, {
      ready: () => ({ transport: "smtp://localhost:1025", from: "board@pgpz.org" }),
      createTransport: (() => ({
        sendMail: async (message: Record<string, unknown>) => {
          sent.push(message);
          return { messageId: "message-123" };
        },
      })) as never,
    });

    expect(result).toEqual({ messageId: "message-123" });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      from: "board@pgpz.org",
      to: "director@example.org",
      icalEvent: { method: "REQUEST", filename: "quarterly-review.ics" },
    });
  });
});
