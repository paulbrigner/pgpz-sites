import { describe, expect, it } from "vitest";
import {
  isPolicyUpdateSocialPostSection,
  splitPolicyUpdateSocialPostHeading,
} from "@/lib/policy-update-sections";

describe("policy update section helpers", () => {
  it("splits X Post of the Week headings into label and title", () => {
    expect(
      splitPolicyUpdateSocialPostHeading(
        "X Post of the Week: House Financial Services Committee Leadership Urges FinCEN to Reorient AML Rules",
      ),
    ).toEqual({
      label: "X Post of the Week",
      title: "House Financial Services Committee Leadership Urges FinCEN to Reorient AML Rules",
    });
  });

  it("recognizes notable post sections", () => {
    expect(
      splitPolicyUpdateSocialPostHeading(
        "Notable Posts: FinCEN and Federal Banking Regulators Propose Joint Identity Verification Rules",
      ),
    ).toEqual({
      label: "Notable Posts",
      title: "FinCEN and Federal Banking Regulators Propose Joint Identity Verification Rules",
    });
  });

  it("treats X screenshots as social-post sections but leaves the Signal QR section alone", () => {
    expect(
      isPolicyUpdateSocialPostSection({
        heading: "PGPZ Community Signal Chat",
        images: [
          {
            src: "/signal-chat-qr.png",
            alt: "QR code for joining the PGPZ Community Signal chat",
          },
        ],
      }),
    ).toBe(false);

    expect(
      isPolicyUpdateSocialPostSection({
        heading: "Policy development",
        images: [
          {
            src: "/x-warren-davidson.png",
            alt: "Embedded X post screenshot from Rep. Warren Davidson",
          },
        ],
      }),
    ).toBe(true);
  });
});
