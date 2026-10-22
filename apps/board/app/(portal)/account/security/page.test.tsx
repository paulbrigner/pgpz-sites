import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ member: vi.fn(), count: vi.fn(), verified: vi.fn(), manager: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/session", () => ({ requireBoardMember: mocks.member }));
vi.mock("@/lib/passkey-enrollment", () => ({ getBoardPasskeyCount: mocks.count }));
vi.mock("@/lib/passkey-step-up", () => ({ hasBoardPasskeySession: mocks.verified }));
vi.mock("@/components/security/PasskeyManager", () => ({ PasskeyManager: (props: unknown) => { mocks.manager(props); return <div>Passkey controls</div>; } }));
import SecurityPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.member.mockResolvedValue({ id: "member" });
  mocks.count.mockResolvedValue(0);
  mocks.verified.mockResolvedValue(false);
});
afterEach(() => cleanup());

describe("Board passkey setup page", () => {
  it("explains first-passkey creation and the separate verification step", async () => {
    render(await SecurityPage({ searchParams: Promise.resolve({ callbackUrl: "/meetings/m" }) }));
    expect(mocks.member).toHaveBeenCalledWith("/account/security");
    expect(screen.getByRole("heading", { name: "Set up your passkey" })).toBeVisible();
    expect(screen.getByRole("list")).toHaveTextContent("Verify passkey to continue");
    expect(mocks.manager).toHaveBeenCalledWith({ verificationRequired: true, continueTo: "/meetings/m" });
    expect(screen.queryByRole("link", { name: "Continue to the Board portal" })).not.toBeInTheDocument();
  });

  it("distinguishes existing-passkey recovery from first-time enrollment", async () => {
    mocks.count.mockResolvedValue(1);
    render(await SecurityPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("heading", { name: "Verify your passkey" })).toBeVisible();
    expect(screen.queryByText(/Create your passkey with the button below/)).not.toBeInTheDocument();
    expect(screen.getByText(/If you have lost all your registered passkeys/)).toBeVisible();
  });

  it("does not present an unavailable enrollment count as zero passkeys", async () => {
    mocks.count.mockResolvedValue(null);
    render(await SecurityPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("heading", { name: "Sign-in security" })).toBeVisible();
    expect(screen.getByText(/enrollment status is temporarily unavailable/)).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Set up your passkey" })).not.toBeInTheDocument();
    expect(mocks.manager).toHaveBeenCalledWith({ verificationRequired: true, continueTo: "/" });
  });

  it("offers an already verified session a safe continuation without requiring a new ceremony", async () => {
    mocks.count.mockResolvedValue(1);
    mocks.verified.mockResolvedValue(true);
    render(await SecurityPage({ searchParams: Promise.resolve({ callbackUrl: "https://evil.example" }) }));
    expect(screen.getByRole("link", { name: "Continue to the Board portal" })).toHaveAttribute("href", "/");
    expect(mocks.manager).toHaveBeenCalledWith({ verificationRequired: false, continueTo: "/" });
  });

  it("does not read enrollment or render setup for a restricted account", async () => {
    mocks.member.mockResolvedValue(null);
    expect(await SecurityPage({ searchParams: Promise.resolve({}) })).toBeNull();
    expect(mocks.count).not.toHaveBeenCalled();
    expect(mocks.manager).not.toHaveBeenCalled();
  });
});
