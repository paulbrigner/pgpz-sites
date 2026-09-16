import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
const mocks = vi.hoisted(() => ({ passkey: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }), useSearchParams: () => new URLSearchParams("callbackUrl=%2Fmeetings") }));
vi.mock("@/lib/auth-client", () => ({ betterAuthClient: { signIn: { passkey: mocks.passkey } } }));
import { SignInForm } from "./signin-form";
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
});
