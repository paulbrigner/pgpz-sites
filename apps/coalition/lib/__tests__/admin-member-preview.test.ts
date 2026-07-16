import { describe, expect, it } from "vitest";
import { isEffectiveAdmin, isMemberPreviewCookieValue } from "@/lib/admin/member-preview";

describe("admin member preview", () => {
  it("suppresses effective admin presentation while previewing", () => {
    expect(isEffectiveAdmin(true, false)).toBe(true);
    expect(isEffectiveAdmin(true, true)).toBe(false);
    expect(isEffectiveAdmin(false, false)).toBe(false);
  });

  it("recognizes only the enabled preview cookie value", () => {
    expect(isMemberPreviewCookieValue("1")).toBe(true);
    expect(isMemberPreviewCookieValue("0")).toBe(false);
    expect(isMemberPreviewCookieValue(undefined)).toBe(false);
  });
});
