import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GovernanceSafeguardsNotice } from "./GovernanceSafeguardsNotice";

beforeEach(() => window.localStorage.clear());
afterEach(() => cleanup());

describe("governance safeguards notice", () => {
  it("can be dismissed and remains dismissed in this browser", async () => {
    const first = render(<GovernanceSafeguardsNotice />);
    const dismiss = await screen.findByRole("button", { name: "Dismiss governance safeguards notice" });
    fireEvent.click(dismiss);
    expect(screen.queryByText("Governance records are protected by design")).not.toBeInTheDocument();

    first.unmount();
    render(<GovernanceSafeguardsNotice />);
    await waitFor(() => expect(screen.queryByText("Governance records are protected by design")).not.toBeInTheDocument());
  });
});
