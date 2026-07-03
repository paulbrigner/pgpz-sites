import { describe, expect, it } from "vitest";
import { policyUpdateImageHref } from "@/lib/policy-update-images";

describe("policyUpdateImageHref", () => {
  it("links June 29 relevant post screenshots to their source context", () => {
    expect(
      policyUpdateImageHref({
        src: "/api/policy-updates/weekly-policy-memo-june-29-2026/assets/relevant-post-page-4-1.png",
        alt: "Relevant post screenshot from page 4",
      }),
    ).toBe(
      "https://www.linkedin.com/posts/gracenavas_wonderful-attending-the-launch-of-pgpz-a-ugcPost-7477863722775031808-zEz7/",
    );

    expect(
      policyUpdateImageHref({
        src: "/api/policy-updates/2026-06-29-weekly-policy-memo/assets/relevant-post-page-5-1.png",
        alt: "Relevant post screenshot from page 5",
      }),
    ).toBe("https://x.com/intangiblecoins/status/2070525408383008938");
  });
});
