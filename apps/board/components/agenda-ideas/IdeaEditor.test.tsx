import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { IdeaEditor } from "./IdeaEditor";
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/step-up-client", () => ({ fetchWithBoardStepUp: mocks.fetch }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("supporting document search", () => {
  it("filters titles and submits selections hidden by the current search", async () => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ id: "idea" })));
    render(<IdeaEditor choices={{ meetings: [], documents: [{ id: "budget", title: "Annual Budget" }, { id: "policy", title: "Board Policy" }] }} />);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Planning" } });
    fireEvent.change(screen.getByLabelText("What should the Board consider, and why?"), { target: { value: "Review priorities." } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Annual Budget" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search documents" }), { target: { value: "  POLICY  " } });
    expect(screen.queryByRole("checkbox", { name: "Annual Budget" })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Board Policy" })).toBeVisible();
    fireEvent.click(screen.getByRole("checkbox", { name: "Board Policy" }));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "no matching title" } });
    expect(screen.getByRole("status")).toHaveTextContent("No documents match your search.");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    expect(screen.getByRole("checkbox", { name: "Annual Budget" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Board Policy" })).toBeChecked();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "policy" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit idea" }));
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalled());
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body).documentIds).toEqual(["budget", "policy"]);
  });
});
