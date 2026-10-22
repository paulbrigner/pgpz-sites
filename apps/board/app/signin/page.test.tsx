import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ memberState: vi.fn(), redirect: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/session", () => ({ resolveBoardMemberState: mocks.memberState }));
vi.mock("./signin-form", () => ({ SignInForm: () => <div>Sign-in controls</div> }));
import SignInPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.memberState.mockResolvedValue({ status: "anonymous" });
  mocks.redirect.mockImplementation((url: string) => { throw new Error(`REDIRECT:${url}`); });
});
afterEach(() => cleanup());

describe("Board sign-in page", () => {
  it("explains first-time setup to anonymous visitors", async () => {
    render(await SignInPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText(/use an email link to begin first-time setup/)).toBeVisible();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("returns an already authenticated Board member to security with their original target", async () => {
    mocks.memberState.mockResolvedValue({ status: "member", member: { id: "member" } });
    await expect(SignInPage({ searchParams: Promise.resolve({ callbackUrl: "/meetings/m?reviewThread=assessment-1" }) })).rejects.toThrow("REDIRECT:/account/security?callbackUrl=%2Fmeetings%2Fm%3FreviewThread%3Dassessment-1");
  });

  it("validates the target before redirecting an authenticated Board member", async () => {
    mocks.memberState.mockResolvedValue({ status: "member", member: { id: "member" } });
    await expect(SignInPage({ searchParams: Promise.resolve({ callbackUrl: "https://evil.example" }) })).rejects.toThrow("REDIRECT:/account/security?callbackUrl=%2F");
  });

  it("does not redirect a signed-in but restricted account into setup", async () => {
    mocks.memberState.mockResolvedValue({ status: "restricted", email: "private@example.invalid" });
    render(await SignInPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText("Sign-in controls")).toBeVisible();
    expect(screen.queryByText("private@example.invalid")).not.toBeInTheDocument();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
