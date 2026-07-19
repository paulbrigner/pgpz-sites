import { describe, expect, it } from "vitest";
import {
  normalizeRecipientEmail,
  normalizeRecipientId,
  normalizeRecipients,
} from "./recipients";

describe("recipient normalization", () => {
  it("normalizes IDs and email addresses consistently", () => {
    expect(normalizeRecipientId("  user-1  ")).toBe("user-1");
    expect(normalizeRecipientId("ＵＳＥＲ-1")).toBe("USER-1");
    expect(normalizeRecipientEmail("  Paul@Example.COM  ")).toBe("paul@example.com");
  });

  it("prefers explicit keys, then user IDs, then email addresses", () => {
    expect(
      normalizeRecipients([
        { recipientKey: " custom-key ", userId: "user-1", email: "ONE@example.com" },
        { userId: " user-2 ", email: "TWO@example.com" },
        { email: "THREE@example.com" },
      ]),
    ).toEqual([
      {
        recipientKey: "custom-key",
        userId: "user-1",
        email: "one@example.com",
      },
      {
        email: "three@example.com",
        recipientKey: "three@example.com",
        userId: null,
      },
      {
        userId: "user-2",
        email: "two@example.com",
        recipientKey: "user-2",
      },
    ]);
  });

  it("returns recipients in deterministic key order and preserves snapshot metadata", () => {
    const recipients = normalizeRecipients([
      { userId: "z", email: "z@example.com", firstName: "Zed", metadata: { source: "member" } },
      { userId: "a", email: "a@example.com", name: "A" },
    ]);

    expect(recipients.map((recipient) => recipient.recipientKey)).toEqual(["a", "z"]);
    expect(recipients[1]).toMatchObject({
      firstName: "Zed",
      metadata: { source: "member" },
    });
  });

  it("de-duplicates repeated explicit keys, user IDs, and normalized emails", () => {
    const recipients = normalizeRecipients([
      { recipientKey: "shared", userId: "user-1", email: "one@example.com" },
      { recipientKey: "shared", userId: "user-2", email: "two@example.com" },
      { recipientKey: "other", userId: "user-1", email: "three@example.com" },
      { recipientKey: "third", userId: "user-3", email: " ONE@EXAMPLE.COM " },
      { recipientKey: "unique", userId: "user-4", email: "four@example.com" },
    ]);

    expect(recipients).toHaveLength(2);
    expect(recipients.map((recipient) => recipient.recipientKey)).toEqual(["shared", "unique"]);
  });

  it("does not mutate the caller's recipient objects", () => {
    const input = { userId: " user-1 ", email: " PERSON@EXAMPLE.COM " };
    normalizeRecipients([input]);
    expect(input).toEqual({ userId: " user-1 ", email: " PERSON@EXAMPLE.COM " });
  });

  it("accepts an empty recipient collection", () => {
    expect(normalizeRecipients([])).toEqual([]);
  });

  it.each([
    [[{ recipientKey: "  ", userId: null, email: null }]],
    [[{ userId: "", email: "  " }]],
  ] as const)("rejects an invalid recipient collection %#", (recipients) => {
    expect(() => normalizeRecipients(recipients)).toThrow("stable key, user id, or email");
  });
});
