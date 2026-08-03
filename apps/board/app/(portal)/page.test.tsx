import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";
import { BoardDashboard } from "@/components/dashboard/BoardDashboard";

describe("board dashboard", () => {
  it("greets the signed-in director without exposing disabled features", () => {
    render(<BoardDashboard member={{ name: "Ada Director", email: "ada@example.org" }} />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Welcome, Ada Director.");
    expect(screen.getByText("ada@example.org")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Meeting materials" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Decisions & resolutions" })).toBeVisible();
    expect(screen.queryByRole("link", { name: /member directory/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /sign up/i })).not.toBeInTheDocument();
  });
});
