import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { BoardDashboard } from "@/components/dashboard/BoardDashboard";

afterEach(() => cleanup());

describe("board dashboard", () => {
  it("greets the signed-in director without exposing disabled features", () => {
    render(
      <BoardDashboard
        member={{ id: "user-9", name: "Ada Director", email: "ada@example.org", role: "member", isAdmin: false }}
      />,
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Welcome, Ada Director.");
    expect(screen.getByText("ada@example.org")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Document library" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Board meetings" })).toBeVisible();
    expect(screen.queryByRole("link", { name: /member directory/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /sign up/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /administration/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Board meetings/ })).toHaveAttribute("href", "/meetings");
    expect(screen.queryByRole("link", { name: /Brand & marketing/ })).not.toBeInTheDocument();
    expect(screen.getByRole("list")).toContainElement(screen.getByRole("link", { name: /Document library/ }));
  });

  it("shows the enforced administration surface only to administrators", () => {
    render(
      <BoardDashboard
        member={{ id: "user-9", name: "Grace Chair", email: "grace@example.org", role: "chair", isAdmin: true }}
      />,
    );

    expect(screen.getByText("Board Chair")).toBeVisible();
    expect(screen.getByRole("link", { name: "Open Board tools" })).toHaveAttribute("href", "/admin");
  });

  it("shows the Executive Director badge instead of director badges for staff", () => {
    render(
      <BoardDashboard
        member={{ id: "user-9", name: "Div Staff", email: "div@example.org", role: "executive-director", isAdmin: true }}
      />,
    );

    expect(screen.getByText("Executive Director")).toBeVisible();
    expect(screen.queryByText("Board of Directors")).not.toBeInTheDocument();
    expect(screen.queryByText("Board Chair")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Board tools" })).toHaveAttribute("href", "/admin");
  });

  it("shows the Legal Counsel badge and administration access without director labels", () => {
    render(
      <BoardDashboard
        member={{ id: "user-9", name: "Sam Counsel", email: "sam@example.org", role: "legal-counsel", isAdmin: false }}
      />,
    );

    expect(screen.getByText("Legal Counsel")).toBeVisible();
    expect(screen.queryByText("Board of Directors")).not.toBeInTheDocument();
    expect(screen.queryByText("Board Chair")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Board tools" })).toHaveAttribute("href", "/admin");
  });

  it("shows Board Support document tools without calling the user an administrator", () => {
    render(<BoardDashboard member={{ id: "support-1", name: "Operations", email: "ops@example.org", role: "board-support", isAdmin: false }} />);
    expect(screen.getByText("Board Support")).toBeVisible();
    expect(screen.getByRole("link", { name: /Document library/ })).toHaveAttribute("href", "/documents");
    expect(screen.queryByRole("link", { name: "Open Board tools" })).not.toBeInTheDocument();
    expect(screen.queryByText("Board Chair")).not.toBeInTheDocument();
  });

  it("nudges users without a passkey toward enrollment", () => {
    render(<BoardDashboard member={{ id: "user-1", name: "Ada", email: "ada@example.org", role: "member", isAdmin: false }} passkeyCount={0} />);
    expect(screen.getByRole("link", { name: "Add a passkey" })).toHaveAttribute("href", "/account/security");
  });

  it("keeps the next meeting summary compact on the dashboard", () => {
    render(<BoardDashboard member={{ id: "user-1", name: "Ada", email: "ada@example.org", role: "member", isAdmin: false }} nextMeeting={{
      id: "meeting-1", title: "September Board meeting", description: "", type: "regular", format: "live", status: "materials-published",
      startAt: "2026-09-18T17:00:00.000Z", endAt: "2026-09-18T18:30:00.000Z", timeZone: "America/New_York",
      location: "Online", virtualUrl: null, version: 3, minutesStatus: "not-started", materialCount: 4,
    }} />);
    expect(screen.getByText(/Sep 18, 2026 · 1:00 PM–2:30 PM EDT · Materials published · 4 materials/)).toBeVisible();
  });
});
