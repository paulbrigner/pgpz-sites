import { describe, expect, it } from "vitest";
import { memberDirectorySortKey, normalizeMemberProfileBase } from "./profile";

describe("member profile projection", () => {
  it("returns only normalized member-facing base fields", () => {
    expect(normalizeMemberProfileBase({
      slug: "ada",
      name: "  Ada   Lovelace ",
      headline: " Builder ",
      bio: " Short bio ",
      company: " PGPZ ",
      jobTitle: " Member ",
      linkedinUrl: "https://www.linkedin.com/in/ada",
      xHandle: "ada",
      email: "private@example.com",
      membershipProofPostUrl: "https://example.com/private",
    })).toEqual({
      slug: "ada",
      name: "Ada Lovelace",
      headline: "Builder",
      bio: "Short bio",
      company: "PGPZ",
      jobTitle: "Member",
      linkedinUrl: "https://www.linkedin.com/in/ada",
      xHandle: "@ada",
    });
  });

  it("creates stable directory ordering", () => {
    expect(memberDirectorySortKey(" Ada  Lovelace ", "ada")).toBe("ada lovelace#ada");
  });
});
