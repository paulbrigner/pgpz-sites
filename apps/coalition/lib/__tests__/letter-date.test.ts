import { describe, expect, it } from "vitest";
import { formatLetterDate } from "@/lib/letter-date";

describe("letter date formatting", () => {
  it("renders a deadline with an explicit Eastern time-zone abbreviation", () => {
    const formatted = formatLetterDate("2026-07-30T13:00:00.000Z");

    expect(formatted).toContain("July 30, 2026");
    expect(formatted).toContain("9:00 AM");
    expect(formatted).toContain("EDT");
  });
});
