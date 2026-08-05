import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CoalitionHero } from "./CoalitionHomeSections";

afterEach(cleanup);

describe("CoalitionHero", () => {
  it("uses the full organization name and routes existing members to sign in", () => {
    render(<CoalitionHero authenticated={false} />);

    expect(screen.getByText("PRETTY GOOD POLICY FOR ZCASH · COALITION")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Request access" })).toHaveAttribute(
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
