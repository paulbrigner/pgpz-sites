import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
const mocks = vi.hoisted(() => ({ passkey: vi.fn(), magicLink: vi.fn(), push: vi.fn(), refresh: vi.fn(), query: "" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }), useSearchParams: () => new URLSearchParams(mocks.query) }));
vi.mock("@/lib/auth-client", () => ({ betterAuthClient: { signIn: { passkey: mocks.passkey, magicLink: mocks.magicLink } } }));
import { SignInForm } from "./signin-form";
beforeEach(() => { mocks.query = "callbackUrl=%2Fmeetings"; mocks.magicLink.mockReset(); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("Board passkey sign-in", () => {
  it("explains the required device verification without navigating on failure", async () => {
    mocks.passkey.mockResolvedValue({ error: { code: "AUTH_CANCELLED" } });
    render(<SignInForm passwordlessEnabled passwordEnabled={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in with a passkey" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("PIN, fingerprint, or face verification");
    expect(mocks.push).not.toHaveBeenCalled();
  });
  it("continues to the requested route after verification", async () => {
    mocks.passkey.mockResolvedValue({ error: null, data: {} });
    render(<SignInForm passwordlessEnabled passwordEnabled={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in with a passkey" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/meetings"));
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("explains first-time setup and recovery without offering anonymous registration", () => {
    render(<SignInForm passwordlessEnabled passwordEnabled={false} />);
    expect(screen.getByRole("heading", { name: "First visit? Set up a passkey" })).toBeVisible();
    expect(screen.getByRole("list")).toHaveTextContent("Confirm the link, then create your passkey");
    expect(screen.getByRole("list")).toHaveTextContent("Verify your passkey to open the Board portal");
    expect(screen.getByText(/If you have lost all your passkeys/)).toBeVisible();
    expect(screen.queryByRole("button", { name: /create.*passkey/i })).not.toBeInTheDocument();
  });

  it.each(["success", "error", "rejected"])("preserves the target and uses the same neutral email notice for %s", async (outcome) => {
    mocks.query = new URLSearchParams({ callbackUrl: "/meetings/m?reviewThread=assessment-1" }).toString();
    if (outcome === "rejected") mocks.magicLink.mockRejectedValue(new Error("private delivery state"));
    else mocks.magicLink.mockResolvedValue(outcome === "error" ? { error: { message: "private account state" } } : { data: { status: true } });
    render(<SignInForm passwordlessEnabled passwordEnabled={false} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Email" }), { target: { value: "director@example.invalid" } });
    fireEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }));
    expect(await screen.findByRole("status")).toHaveTextContent("If this email is registered for Board access, a link has been sent.");
    expect(screen.getByRole("status")).toHaveTextContent("confirm the link within 10 minutes");
    expect(mocks.magicLink).toHaveBeenCalledWith({
      email: "director@example.invalid",
      callbackURL: "/account/security?callbackUrl=%2Fmeetings%2Fm%3FreviewThread%3Dassessment-1",
      errorCallbackURL: "/signin?callbackUrl=%2Fmeetings%2Fm%3FreviewThread%3Dassessment-1",
    });
    expect(screen.queryByText(/private (account|delivery) state/)).not.toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("uses only a safe local target for both email callback paths", async () => {
    mocks.query = "callbackUrl=https%3A%2F%2Fevil.example";
    mocks.magicLink.mockResolvedValue({ data: { status: true } });
    render(<SignInForm passwordlessEnabled passwordEnabled={false} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Email" }), { target: { value: "director@example.invalid" } });
    fireEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }));
    await screen.findByRole("status");
    expect(mocks.magicLink).toHaveBeenCalledWith(expect.objectContaining({
      callbackURL: "/account/security?callbackUrl=%2F", errorCallbackURL: "/signin?callbackUrl=%2F",
    }));
  });

  it("explains an invalid or consumed email link and clears the error after a fresh request", async () => {
    mocks.query = "error=INVALID_TOKEN";
    mocks.magicLink.mockResolvedValue({ data: { status: true } });
    render(<SignInForm passwordlessEnabled passwordEnabled={false} />);
    expect(screen.getByRole("alert")).toHaveTextContent("expired, has already been used, or is invalid");
    expect(screen.getByRole("alert")).toHaveTextContent("Request a fresh link below");
    fireEvent.change(screen.getByRole("textbox", { name: "Email" }), { target: { value: "director@example.invalid" } });
    fireEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }));
    await screen.findByRole("status");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each(["new_user_signup_disabled", "failed_to_create_session", "<script>private error</script>"])("never echoes the provider or unrecognized error %s", (error) => {
    mocks.query = new URLSearchParams({ error }).toString();
    render(<SignInForm passwordlessEnabled passwordEnabled={false} />);
    expect(screen.getByRole("alert")).toHaveTextContent("The email link could not complete sign-in.");
    expect(screen.getByRole("alert")).not.toHaveTextContent(error);
  });
});
