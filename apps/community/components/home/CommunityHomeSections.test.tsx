import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CommunityPillars } from "./CommunityHomeSections";

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
