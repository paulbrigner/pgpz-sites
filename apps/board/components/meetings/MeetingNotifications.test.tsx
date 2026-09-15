import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MeetingNotifications } from "./MeetingNotifications";
import { DEFAULT_MEETING_NOTIFICATION_PREFERENCE as defaults } from "@/lib/meeting-notifications";
import { fetchWithBoardStepUp } from "@/lib/step-up-client";
vi.mock("@/lib/step-up-client", () => ({ fetchWithBoardStepUp: vi.fn() }));
beforeEach(() => { window.location.hash = "#meeting-notifications"; vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ preference: defaults, ballots: [{ id: "b", title: "Approve employment" }], email: "reader@example.invalid" }))); });
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); window.location.hash = ""; });
it("allows an opt-in for selected resolutions, saves filters, and turns off without losing selections", async () => {
  const { container } = render(<MeetingNotifications meetingId="m" />);
  const toggle = await screen.findByLabelText("Email me updates for this meeting");
  expect(toggle).not.toBeChecked(); expect(container.querySelector("details")).toHaveAttribute("open");
  fireEvent.click(toggle); fireEvent.click(screen.getByLabelText("Selected resolutions only")); fireEvent.click(screen.getByLabelText("Approve employment"));
  vi.mocked(fetchWithBoardStepUp).mockImplementation(async (_url, init) => Response.json({ preference: { ...JSON.parse(init!.body as string), version: 1 } }));
  fireEvent.click(screen.getByRole("button", { name: "Save notification settings" })); await screen.findByText(/Saved. You’ll receive/);
  const sent = JSON.parse(vi.mocked(fetchWithBoardStepUp).mock.calls[0][1]!.body as string);
  expect(sent).toMatchObject({ enabled: true, scope: "items", ballotIds: ["b"], includeOwn: false });
  fireEvent.click(toggle); fireEvent.click(screen.getByRole("button", { name: "Save notification settings" })); await screen.findByText(/Update emails for this meeting are off/);
  expect(JSON.parse(vi.mocked(fetchWithBoardStepUp).mock.calls[1][1]!.body as string).enabled).toBe(false);
});
it("shows loading and save failures without reporting an unsaved opt-in as active", async () => {
  render(<MeetingNotifications meetingId="m" />); fireEvent.click(await screen.findByLabelText("Email me updates for this meeting"));
  vi.mocked(fetchWithBoardStepUp).mockResolvedValue(Response.json({ error: "Your settings changed. Refresh and try again." }, { status: 409 }));
  fireEvent.click(screen.getByRole("button", { name: "Save notification settings" })); await screen.findByText(/Your settings changed/);
  expect(screen.getByText("Off")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reload saved settings" })); await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
});
