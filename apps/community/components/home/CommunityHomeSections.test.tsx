import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CommunityHero, CommunityPillars } from "./CommunityHomeSections";

afterEach(cleanup);

describe("CommunityPillars", () => {
  it("lets every card shrink within the mobile grid", () => {
    render(
      <CommunityPillars
        resources={[
          {
            href: "/updates/2026-07-24-statements-for-the-record",
            label:
              "Statements for the Record—July 17 CLARITY Act and July 21 FinCEN Oversight Hearings",
            detail:
              "This week, PGPZ submitted two Statements for the Record following recent hearings before the House Financial Services Committee.",
            category: "Special Update",
          },
        ]}
      />,
    );

    for (const title of [
      "Bringing policy conversations into focus",
      "A shared home for Zcash policy work",
      "Coordinated policy engagement",
    ]) {
      expect(screen.getByRole("heading", { name: title }).closest("article")).toHaveClass(
        "min-w-0",
      );
    }
  });
});

describe("CommunityHero", () => {
  it("uses the full organization name and routes existing members to sign in", () => {
    const feature = {
      title: "Weekly policy memo",
      href: "/updates/weekly-policy-memo",
      caption: "Weekly policy memo",
      imageSrc: "/brand/pgpz-community-on-light.svg",
      imageAlt: "Weekly policy memo cover",
      imageFit: "contain",
    };

    render(
      <CommunityHero
        authenticated={false}
        signupHref="/signin?reason=signup"
        feature={feature}
        features={[feature]}
        activeIndex={0}
      />,
    );

    expect(screen.getByText("PRETTY GOOD POLICY FOR ZCASH · COMMUNITY")).toBeInTheDocument();
    expect(screen.getByText(/Follow Pretty Good Policy for Zcash updates/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Join with email" })).toHaveAttribute(
      "href",
      "/signin?reason=signup",
    );
    expect(screen.getByRole("link", { name: "Member sign in" })).toHaveAttribute(
      "href",
      "/signin",
    );
    expect(screen.queryByRole("link", { name: /^Visit / })).not.toBeInTheDocument();
  });
});
