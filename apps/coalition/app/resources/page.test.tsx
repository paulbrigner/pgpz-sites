import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getMemberAccess: vi.fn(),
  listApprovedResourceSubmissions: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("@/lib/member-access", () => ({
  getMemberAccess: mocks.getMemberAccess,
}));

vi.mock("@/lib/resource-submissions", () => ({
  listApprovedResourceSubmissions: mocks.listApprovedResourceSubmissions,
}));

import ResourcesPage from "./page";

describe("Coalition resources page", () => {
  beforeEach(() => {
    mocks.getMemberAccess.mockResolvedValue({ authenticated: true, isMember: true });
    mocks.listApprovedResourceSubmissions.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows the member submission panel when the approved library is empty", async () => {
    render(await ResourcesPage());

    expect(
      screen.getByRole("heading", { name: "Submit a resource for review" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Resource title")).toBeInTheDocument();
    expect(screen.getByLabelText("Link (optional)")).toBeInTheDocument();
    expect(screen.getByLabelText("Notes for the PGPZ team")).toBeInTheDocument();
    expect(screen.getByText("No approved resources yet")).toBeInTheDocument();
  });

  it("keeps the submission panel above approved resource cards", async () => {
    mocks.listApprovedResourceSubmissions.mockResolvedValue([
      {
        id: "resource-1",
        title: "Coalition policy guide",
        url: "https://example.test/policy-guide",
        details: "A reviewed guide for coalition members.",
      },
    ]);

    render(await ResourcesPage());

    const submissionHeading = screen.getByRole("heading", {
      name: "Submit a resource for review",
    });
    const resourceHeading = screen.getByRole("heading", {
      name: "Coalition policy guide",
    });
    expect(
      submissionHeading.compareDocumentPosition(resourceHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
