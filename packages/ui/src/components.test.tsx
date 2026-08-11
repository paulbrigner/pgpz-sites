import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  AdminSensitiveDataProvider,
  AdminShellSkeleton,
  BackgroundJobProgressPanel,
  Badge,
  Button,
  durableRequestIdempotency,
  NonProductionBanner,
  PersonalHome,
  PersonalHomeAction,
  PersonalHomeColumn,
  PersonalHomeGrid,
  PersonalHomeHeader,
  PersonalHomePanel,
  SecureLinkSubmitButton,
  SectionHeading,
  SensitiveDataText,
  maskSensitiveValue,
  useAdminSensitiveData,
} from "./index";

function SensitiveDataFixture() {
  const { toggleSensitiveDataVisibility } = useAdminSensitiveData();

  return (
    <>
      <SensitiveDataText value="Paul Brigner" kind="name" />
      <button type="button" onClick={toggleSensitiveDataVisibility}>Show details</button>
    </>
  );
}

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

  it("renders the secure-link completion action as a native submit button", () => {
    render(
      <SecureLinkSubmitButton type="submit" disabled>
        Send secure link
      </SecureLinkSubmitButton>,
    );

    expect(screen.getByRole("button", { name: "Send secure link" })).toHaveAttribute(
      "type",
      "submit",
    );
    expect(screen.getByRole("button", { name: "Send secure link" })).toBeDisabled();
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

  it("renders the shared admin loading structure", () => {
    const { container } = render(<AdminShellSkeleton />);

    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(1);
    expect(container.querySelectorAll(".md\\:grid-cols-4 > div")).toHaveLength(4);
  });

  it("composes a brand-neutral personal home with accessible landmarks and actions", () => {
    render(
      <PersonalHome>
        <PersonalHomeHeader
          eyebrow="Member home"
          title="Welcome back"
          description="Your next useful actions."
          status={<span>Active member</span>}
        />
        <PersonalHomeGrid>
          <PersonalHomeColumn aria-label="Policy column">
            <PersonalHomePanel title="Start here">
              <PersonalHomeAction
                href="/updates/latest"
                title="Read the latest update"
                description="A current policy briefing."
              />
            </PersonalHomePanel>
          </PersonalHomeColumn>
        </PersonalHomeGrid>
      </PersonalHome>,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Welcome back" })).toBeVisible();
    expect(screen.getByLabelText("Policy column")).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Start here" })).toBeVisible();
    expect(screen.getByRole("link", { name: /Read the latest update/ })).toHaveAttribute(
      "href",
      "/updates/latest",
    );
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

  it("masks admin-sensitive data until the shared provider reveals it", () => {
    expect(maskSensitiveValue("paul@example.com", "email")).toBe("p***@e******.com");

    render(
      <AdminSensitiveDataProvider>
        <SensitiveDataFixture />
      </AdminSensitiveDataProvider>,
    );

    expect(screen.getByText("P*** B******")).toHaveClass("select-none");
    fireEvent.click(screen.getByRole("button", { name: "Show details" }));
    expect(screen.getByText("Paul Brigner")).not.toHaveClass("select-none");
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
