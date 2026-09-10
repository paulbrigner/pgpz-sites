import { describe, expect, it } from "vitest";
import { formatMeetingDate } from "./meeting-format";
describe("meeting time windows", () => {
  it("includes the closing date in multi-day list summaries", () => {
    const formatted = formatMeetingDate("2026-09-11T12:00:00Z", "2026-09-16T21:00:00Z", "America/New_York");
    expect(formatted.date).toBe("Friday, September 11, 2026");
    expect(formatted.time).toBe("8:00 AM EDT — Wednesday, September 16, 2026, 5:00 PM EDT");
  });
  it("uses the meeting timezone rather than UTC to determine the calendar dates", () => {
    const formatted = formatMeetingDate("2026-09-11T23:00:00Z", "2026-09-12T01:00:00Z", "America/New_York");
    expect(formatted.date).toBe(formatted.endDate);
    expect(formatted.time).toBe("7:00 PM EDT–9:00 PM EDT");
  });
  it("labels both endpoints correctly across a daylight saving transition", () => {
    const formatted = formatMeetingDate("2026-11-01T05:00:00Z", "2026-11-01T06:30:00Z", "America/New_York");
    expect(formatted.time).toBe("1:00 AM EDT–1:30 AM EST");
  });
});
