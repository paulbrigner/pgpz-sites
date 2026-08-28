import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { GovernanceSafeguardsOverview } from "./GovernanceSafeguardsOverview";

afterEach(() => cleanup());

describe("governance safeguards overview", () => {
  it("explains preservation controls without claiming compliance certification", () => {
    render(<GovernanceSafeguardsOverview showTechnicalDetails={false} />);

    expect(screen.getByRole("heading", { name: "How Board records are protected" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Preserved history" })).toBeVisible();
    expect(screen.getByText(/not, by themselves, a certification/i)).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Preservation architecture" })).not.toBeInTheDocument();
  });

  it("shows the technical overview only when authorized by the page", () => {
    render(<GovernanceSafeguardsOverview showTechnicalDetails />);

    expect(screen.getByRole("heading", { name: "Preservation architecture" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Review the audit ledger" })).toHaveAttribute("href", "/admin/audit");
  });
});
