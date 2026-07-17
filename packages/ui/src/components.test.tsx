import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge, Button, NonProductionBanner, SectionHeading } from "./index";

describe("shared UI primitives", () => {
  it("renders an accessible non-production notice", () => {
    render(<NonProductionBanner>Testing only</NonProductionBanner>);

    expect(screen.getByRole("status", { name: "Reference environment" })).toHaveTextContent(
      "Testing only",
    );
  });

  it("preserves native button behavior", () => {
    render(<Button disabled>Unavailable</Button>);
    expect(screen.getByRole("button", { name: "Unavailable" })).toBeDisabled();
  });

  it("composes labels and headings without prescribing app copy", () => {
    render(
      <>
        <Badge tone="success">Ready</Badge>
        <SectionHeading eyebrow="Shared contract" title="Neutral by design" />
      </>,
    );
    expect(screen.getByText("Ready")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Neutral by design" })).toBeVisible();
  });
});
