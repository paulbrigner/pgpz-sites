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
    expect(screen.getByRole("heading", { name: "Meeting materials" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Decisions & resolutions" })).toBeVisible();
    expect(screen.queryByRole("link", { name: /member directory/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /sign up/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /administration/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Brand & marketing" })).toHaveAttribute("href", "/brand");
  });

  it("shows the enforced administration surface only to administrators", () => {
    render(
      <BoardDashboard
        member={{ id: "user-9", name: "Grace Admin", email: "grace@example.org", role: "admin", isAdmin: true }}
      />,
    );

    expect(screen.getByText("Board administrator")).toBeVisible();
    expect(screen.getByRole("link", { name: "Open administration" })).toHaveAttribute("href", "/admin");
  });

  it("shows the Executive Director badge instead of director badges for staff", () => {
    render(
      <BoardDashboard
        member={{ id: "user-9", name: "Div Staff", email: "div@example.org", role: "executive-director", isAdmin: true }}
      />,
    );

    expect(screen.getByText("Executive Director")).toBeVisible();
    expect(screen.queryByText("Board of Directors")).not.toBeInTheDocument();
    expect(screen.queryByText("Board administrator")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open administration" })).toHaveAttribute("href", "/admin");
  });

  it("shows the Legal Counsel badge and administration access without director labels", () => {
    render(
      <BoardDashboard
        member={{ id: "user-9", name: "Sam Counsel", email: "sam@example.org", role: "legal-counsel", isAdmin: true }}
      />,
    );

    expect(screen.getByText("Legal Counsel")).toBeVisible();
    expect(screen.queryByText("Board of Directors")).not.toBeInTheDocument();
    expect(screen.queryByText("Board administrator")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open administration" })).toHaveAttribute("href", "/admin");
  });
});
