import { describe, expect, it } from "vitest";
import {
  assertMemberProfileSlug,
  memberProfileKey,
  memberProfileSlugKey,
  normalizeMemberProfileSlug,
  suggestedMemberProfileSlug,
} from "./slug";

describe("member profile slugs", () => {
  it("normalizes human-entered values", () => {
    expect(normalizeMemberProfileSlug("  Paul Brigner  ")).toBe("paul-brigner");
    expect(normalizeMemberProfileSlug("Écosystem__Builder")).toBe("ecosystem-builder");
  });

  it("rejects reserved or malformed values", () => {
    expect(() => assertMemberProfileSlug("admin")).toThrow(/reserved/i);
    expect(() => assertMemberProfileSlug("ab")).toThrow(/3-48/);
    expect(assertMemberProfileSlug("zcash-builder")).toBe("zcash-builder");
  });

  it("builds app-local DynamoDB keys", () => {
    expect(memberProfileKey("user-1")).toEqual({ pk: "USER#user-1", sk: "MEMBER_PROFILE" });
    expect(memberProfileSlugKey("alice")).toEqual({
      pk: "MEMBER_PROFILE_SLUG#alice",
      sk: "MEMBER_PROFILE_SLUG#alice",
    });
  });

  it("suggests a non-email fallback", () => {
    expect(suggestedMemberProfileSlug("Ada Lovelace", "user-1")).toBe("ada-lovelace");
    expect(suggestedMemberProfileSlug("", "user-1")).toBe("member-user-1");
  });
});
