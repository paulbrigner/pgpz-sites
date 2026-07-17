import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";
import HomePage from "./page";

describe("reference home page", () => {
  it("makes the non-production boundaries visible without disabled feature links", () => {
    render(<HomePage />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("clean starting point");
    expect(screen.getByText("Email off")).toBeVisible();
    expect(screen.getByText("No accounts")).toBeVisible();
    expect(screen.queryByRole("link", { name: /newsletter/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /member directory/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Explore the reference shelf/i })).toHaveAttribute("href", "/zec-shelf");
  });
});
