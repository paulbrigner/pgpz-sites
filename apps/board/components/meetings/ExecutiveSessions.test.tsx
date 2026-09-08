import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExecutiveSessions } from "./ExecutiveSessions";
import { ExecutiveSessionWorkspace } from "./ExecutiveSessionWorkspace";
import { sessionFixture } from "@/lib/executive-session-test-helpers";
import { fetchWithBoardStepUp } from "@/lib/step-up-client";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/step-up-client", () => ({ fetchWithBoardStepUp: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("executive-session workflow", () => {
  it("defaults to admitting nobody and limits facilitation to a selected director", async () => {
    vi.mocked(fetchWithBoardStepUp).mockResolvedValue(new Response(JSON.stringify({ id: "new", participating: true }), { status: 201 }));
    render(<ExecutiveSessions meetingId="m" sessions={[]} candidates={[
      { id: "d", name: "Director One", email: "d@example.invalid", kind: "director" },
      { id: "c", name: "Invited lawyer", email: "c@example.invalid", kind: "counsel" },
    ]} />);
    fireEvent.click(screen.getByText("Open an executive session"));
    expect(screen.getAllByRole("checkbox").every((c) => !(c as HTMLInputElement).checked)).toBe(true);
    expect(screen.getByRole("button", { name: "Open restricted session" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /Invited lawyer/ }));
    expect(screen.getByRole("combobox")).not.toHaveTextContent("Invited lawyer");
    fireEvent.click(screen.getByRole("checkbox", { name: /Director One/ }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "d" } });
    fireEvent.change(screen.getByLabelText("Private title"), { target: { value: "Review" } });
    fireEvent.change(screen.getByLabelText("Private purpose and exclusions"), { target: { value: "Recusal" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /I have reviewed/ }));
    fireEvent.click(screen.getByRole("button", { name: "Open restricted session" }));
    await waitFor(() => expect(fetchWithBoardStepUp).toHaveBeenCalled());
    expect(JSON.parse(String(vi.mocked(fetchWithBoardStepUp).mock.calls[0][1]?.body))).toEqual({ title: "Review", purpose: "Recusal", participantIds: ["c", "d"], facilitatorId: "d" });
  });

  it("requires an exact preview and explicit confirmation before publishing, resetting consent after edits", async () => {
    vi.mocked(fetchWithBoardStepUp).mockResolvedValue(new Response("{}", { status: 200 }));
    render(<ExecutiveSessionWorkspace session={{ ...sessionFixture(), status: "closed", version: 5 }} messages={[]} materials={[]} canManage />);
    expect(screen.queryByRole("button", { name: "Publish reviewed outcome" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Reviewed outcome for the ordinary meeting"), { target: { value: "Summary one" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview publication" }));
    expect(screen.getByRole("button", { name: "Publish reviewed outcome" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /I reviewed this exact text/ }));
    fireEvent.change(screen.getByLabelText("Reviewed outcome for the ordinary meeting"), { target: { value: "Summary two" } });
    expect(screen.queryByRole("button", { name: "Publish reviewed outcome" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Preview publication" }));
    expect(screen.getByRole("button", { name: "Publish reviewed outcome" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /I reviewed this exact text/ }));
    fireEvent.click(screen.getByRole("button", { name: "Publish reviewed outcome" }));
    await waitFor(() => expect(fetchWithBoardStepUp).toHaveBeenCalled());
    expect(JSON.parse(String(vi.mocked(fetchWithBoardStepUp).mock.calls[0][1]?.body))).toEqual({ action: "publish", expectedVersion: 5, summary: "Summary two", confirmPublication: true });
  });

  it("lets an invited participant discuss but shows no facilitator controls or voting UI", () => {
    render(<ExecutiveSessionWorkspace session={sessionFixture()} messages={[]} materials={[]} canManage={false} />);
    expect(screen.getByRole("button", { name: "Post to restricted session" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Close deliberation" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retain private material" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /vote/i })).not.toBeInTheDocument();
  });
});
