import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import ResourceSubmissionForm from "./ResourceSubmissionForm";

describe("ResourceSubmissionForm", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("submits the exact resource payload, confirms success, and clears the inputs", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<ResourceSubmissionForm />);

    const title = screen.getByLabelText("Resource title");
    const url = screen.getByLabelText(/Link/);
    const details = screen.getByLabelText("Notes for the PGPZ team");
    await user.type(title, "Zcash policy primer");
    await user.type(url, "https://example.test/zcash-policy");
    await user.type(details, "A useful primer for coalition members.");
    const submitButton = screen.getByRole("button", { name: "Submit for review" });
    await user.click(submitButton);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith("/api/resources/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Zcash policy primer",
        url: "https://example.test/zcash-policy",
        details: "A useful primer for coalition members.",
      }),
    });
    expect(
      await screen.findByText("Resource added to the PGPZ moderation queue."),
    ).toBeInTheDocument();
    expect(title).toHaveValue("");
    expect(url).toHaveValue("");
    expect(details).toHaveValue("");
    expect(submitButton).toBeEnabled();
  });

  it("shows the server error and preserves the inputs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "That resource cannot be submitted." }), {
          status: 422,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const user = userEvent.setup();

    render(<ResourceSubmissionForm />);

    const title = screen.getByLabelText("Resource title");
    const url = screen.getByLabelText(/Link/);
    const details = screen.getByLabelText("Notes for the PGPZ team");
    await user.type(title, "Resource needing correction");
    await user.type(url, "https://example.test/resource");
    await user.type(details, "Please preserve these notes after an error.");
    await user.click(screen.getByRole("button", { name: "Submit for review" }));

    expect(
      await screen.findByText("That resource cannot be submitted."),
    ).toBeInTheDocument();
    expect(title).toHaveValue("Resource needing correction");
    expect(url).toHaveValue("https://example.test/resource");
    expect(details).toHaveValue("Please preserve these notes after an error.");
  });
});
