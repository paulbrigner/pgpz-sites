import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CoalitionHero, CoalitionPublicHome } from "./CoalitionHomeSections";

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

describe("CoalitionPublicHome", () => {
  it("uses Coalition-specific positioning and explicit access routes", () => {
    render(<CoalitionPublicHome />);

    expect(screen.getByText("PRETTY GOOD POLICY FOR ZCASH · COALITION")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Coordinate policy action for Zcash." }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Request partner access" })).toHaveAttribute(
      "href",
      "/signin?reason=signup",
    );
    expect(screen.getByRole("link", { name: "Member sign in" })).toHaveAttribute(
      "href",
      "/signin",
    );
    expect(screen.getByRole("link", { name: "Request access to participate" })).toHaveAttribute(
      "href",
      "/signin?reason=signup",
    );
    expect(screen.getByRole("link", { name: /Member workspace/ })).toHaveAttribute(
      "href",
      "/signin",
    );
  });

  it("previews recent work without presenting protected activity as public or completed", () => {
    render(<CoalitionPublicHome />);

    expect(screen.getByText("Senate sign-on coordination · July 27")).toBeInTheDocument();
    expect(screen.getByText("Market structure coordination · July 28")).toBeInTheDocument();
    expect(screen.getByText("Eight policy groups · Ongoing")).toBeInTheDocument();
    expect(screen.getByText("Coordination in progress")).toBeInTheDocument();
    expect(screen.queryByText(/letter delivered/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /read (the )?letter/i })).not.toBeInTheDocument();
  });

  it("includes the approved independence language", () => {
    render(<CoalitionPublicHome />);

    expect(screen.getByRole("heading", { name: "Independent and not affiliated" })).toBeInTheDocument();
    expect(
      screen.getByText(/is independent, nonpartisan, and not an official Zcash or Zcash Foundation website/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Learn more about Pretty Good Policy for Zcash" }),
    ).toHaveAttribute("href", "https://pgpz.org");
  });
});
