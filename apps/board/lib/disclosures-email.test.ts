// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("./config", () => ({ SITE_URL: "https://board.example.invalid" }));
vi.mock("./email-transport", () => ({ assertBoardEmailReady: vi.fn() }));
import { disclosureNotice } from "./disclosures-email";
describe("private disclosure notices", () => {
  it("contains only a portal link and deadline, and refuses multiple recipients", () => {
    const notice = disclosureNotice({ id: "opaque-id", year: 2026, dueDate: "2026-09-15", to: "person@example.invalid" });
    expect(notice.text).toContain("https://board.example.invalid/disclosures/opaque-id"); expect(notice.text).toContain("2026-09-15"); expect(notice).not.toHaveProperty("attachments");
    expect(() => disclosureNotice({ id: "id", year: 2026, dueDate: null, to: "a@example.invalid,b@example.invalid" })).toThrow();
  });
});
