import { describe, expect, it } from "vitest";
import { buildMeetingCalendar, buildMeetingCalendarUid, foldCalendarLine } from "@/lib/meeting-calendar";

describe("Board meeting calendar", () => {
  it("builds a stable, UTC, individual-recipient REQUEST", () => {
    const artifact = buildMeetingCalendar({
      meetingId: "meeting-123",
      title: "Quarterly Board Meeting",
      startsAt: "2026-09-10T13:00:00-04:00",
      endsAt: "2026-09-10T15:00:00-04:00",
      generatedAt: "2026-08-13T12:00:00Z",
      portalUrl: "https://board.pgpz.org/meetings/meeting-123",
      virtualUrl: "https://meet.example.org/private-room",
      location: "Online; Washington, DC",
      description: "Review progress, risks, and next steps.",
      sequence: 2,
      method: "REQUEST",
      organizer: { email: "chair@pgpz.org", name: "Board Chair" },
      attendee: { email: "director@example.org", name: "A. Director" },
    });

    expect(artifact.uid).toBe(buildMeetingCalendarUid("meeting-123"));
    expect(artifact.contentType).toContain("method=REQUEST");
    expect(artifact.content).toContain("METHOD:REQUEST\r\n");
    expect(artifact.content).toContain("DTSTART:20260910T170000Z\r\n");
    expect(artifact.content).toContain("DTEND:20260910T190000Z\r\n");
    expect(artifact.content).toContain("SEQUENCE:2\r\n");
    expect(artifact.content).toContain("LOCATION:Online\\; Washington\\, DC\r\n");
    expect(artifact.content).toContain("ATTENDEE;CN=\"A. Director\"");
    expect(artifact.content).toContain("mailto:director@example.org");
    expect(artifact.content.endsWith("\r\n")).toBe(true);
  });

  it("builds a cancellation with the same UID", () => {
    const common = {
      meetingId: "meeting-123",
      title: "Quarterly Board Meeting",
      startsAt: "2026-09-10T17:00:00Z",
      endsAt: "2026-09-10T19:00:00Z",
      generatedAt: "2026-08-13T12:00:00Z",
      portalUrl: "https://board.pgpz.org/meetings/meeting-123",
      sequence: 3,
      organizer: { email: "chair@pgpz.org", name: "Board Chair" },
      attendee: { email: "director@example.org", name: "A. Director" },
    } as const;
    const request = buildMeetingCalendar({ ...common, method: "REQUEST" });
    const cancellation = buildMeetingCalendar({ ...common, method: "CANCEL" });

    expect(cancellation.uid).toBe(request.uid);
    expect(cancellation.content).toContain("METHOD:CANCEL\r\n");
    expect(cancellation.content).toContain("STATUS:CANCELLED\r\n");
  });

  it("rejects floating times and invalid ranges", () => {
    const base = {
      meetingId: "meeting-123",
      title: "Board Meeting",
      endsAt: "2026-09-10T19:00:00Z",
      portalUrl: "https://board.pgpz.org/meetings/meeting-123",
      sequence: 0,
    };
    expect(() => buildMeetingCalendar({ ...base, startsAt: "2026-09-10T17:00:00" })).toThrow(
      "startsAt must include a UTC offset",
    );
    expect(() =>
      buildMeetingCalendar({ ...base, startsAt: "2026-09-10T20:00:00Z" }),
    ).toThrow("endsAt must be after startsAt");
    expect(() =>
      buildMeetingCalendar({
        ...base,
        startsAt: "2026-09-10T17:00:00Z",
        portalUrl: "javascript:alert(1)",
      }),
    ).toThrow("portalUrl must use HTTPS");
  });

  it("folds long UTF-8 content lines at RFC octet limits", () => {
    const folded = foldCalendarLine(`DESCRIPTION:${"é".repeat(80)}`);
    const physicalLines = folded.split("\r\n");
    expect(physicalLines.length).toBeGreaterThan(1);
    for (const line of physicalLines) expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    expect(physicalLines[1].startsWith(" ")).toBe(true);
  });

  it("uses PUBLISH for a downloadable calendar and enforces iTIP participants", () => {
    const common = {
      meetingId: "meeting-123",
      title: "Board Meeting",
      startsAt: "2026-09-10T17:00:00Z",
      endsAt: "2026-09-10T19:00:00Z",
      portalUrl: "https://board.pgpz.org/meetings/meeting-123",
      sequence: 0,
    };
    expect(buildMeetingCalendar(common).content).toContain("METHOD:PUBLISH\r\n");
    expect(() => buildMeetingCalendar({ ...common, method: "REQUEST" })).toThrow(
      "require an organizer and one attendee",
    );
  });
});
