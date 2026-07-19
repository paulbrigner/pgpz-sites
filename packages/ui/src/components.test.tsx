import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  BackgroundJobProgressPanel,
  Badge,
  Button,
  durableRequestIdempotency,
  NonProductionBanner,
  SectionHeading,
} from "./index";

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

  it("announces durable progress and makes delivery uncertainty explicit", () => {
    render(
      <BackgroundJobProgressPanel
        initialJob={{
          id: "job-1",
          kind: "newsletter",
          mode: "live",
          status: "needs_review",
          recipientCount: 3,
          pendingCount: 0,
          queuedCount: 0,
          processingCount: 0,
          sentCount: 2,
          validatedCount: 0,
          skippedCount: 0,
          failedCount: 0,
          deliveryUnknownCount: 1,
          canceledCount: 0,
        }}
      />,
    );
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "3");
    expect(screen.getByText("Needs Review")).toBeInTheDocument();
    expect(screen.getByText("Needs review 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry failed recipients" })).toBeInTheDocument();
  });

  it("reuses a durable request key until the server acknowledgement is recorded", async () => {
    window.sessionStorage.clear();
    const first = await durableRequestIdempotency("newsletter.send", {
      recipients: ["admin-1"],
      subject: "Update",
    });
    const retry = await durableRequestIdempotency("newsletter.send", {
      subject: "Update",
      recipients: ["admin-1"],
    });
    expect(retry.value).toBe(first.value);

    first.acknowledge();
    const nextSend = await durableRequestIdempotency("newsletter.send", {
      recipients: ["admin-1"],
      subject: "Update",
    });
    expect(nextSend.value).not.toBe(first.value);
  });
});
