// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("./config", () => ({ SITE_URL: "https://board.example.invalid" }));
vi.mock("./email-transport", () => ({ assertBoardEmailReady: vi.fn() }));
import { assertBoardEmailReady } from "./email-transport";
import { sendDisclosureReviewNotice, disclosureNotice, disclosureReviewNotice } from "./disclosures-email";
describe("private disclosure notices", () => {
  it.each(["satisfactory", "reviewed", "needs-information"] as const)("renders a minimal %s review notice", (outcome) => {
    const notice = disclosureReviewNotice({ id: "opaque-id", year: 2026, revision: 2, outcome, to: "subject@example.invalid" });
    expect(notice.to).toBe("subject@example.invalid"); expect(notice.text).toContain("signed revision 2");
    expect(notice.text).toContain("https://board.example.invalid/disclosures/opaque-id");
    expect(Object.keys(notice).sort()).toEqual(["subject", "text", "to"]);
    if (outcome === "satisfactory") expect(notice.subject).toContain("Review complete — satisfactory");
    if (outcome === "needs-information") expect(notice.text).toContain("read the request and respond");
    if (outcome === "reviewed") expect(notice.text).toContain("read the note and next steps");
    expect(() => disclosureReviewNotice({ id: "id", year: 2026, revision: 1, outcome, to: "a@example.invalid,b@example.invalid" })).toThrow();
  });
  it("requests a single-attempt transport for automatic notices", async () => {
    vi.mocked(assertBoardEmailReady).mockImplementationOnce(() => { throw new Error("Test transport boundary"); });
    await expect(sendDisclosureReviewNotice({ id: "id", year: 2026, revision: 1, outcome: "satisfactory", to: "person@example.invalid" })).rejects.toThrow("Test transport boundary");
    expect(assertBoardEmailReady).toHaveBeenCalledWith({ maxAttempts: 1 });
  });
  it("contains only a portal link and deadline, and refuses multiple recipients", () => {
    const notice = disclosureNotice({ id: "opaque-id", year: 2026, dueDate: "2026-09-15", to: "person@example.invalid" });
    expect(notice.text).toContain("https://board.example.invalid/disclosures/opaque-id"); expect(notice.text).toContain("2026-09-15"); expect(notice).not.toHaveProperty("attachments");
    expect(() => disclosureNotice({ id: "id", year: 2026, dueDate: null, to: "a@example.invalid,b@example.invalid" })).toThrow();
  });
});
