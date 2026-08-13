import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PasskeyManager } from "@/components/security/PasskeyManager";

const authMocks = vi.hoisted(() => ({
  useListPasskeys: vi.fn(),
  addPasskey: vi.fn(),
  deletePasskey: vi.fn(),
  verifyBoardPasskey: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  betterAuthClient: {
    useListPasskeys: authMocks.useListPasskeys,
    passkey: {
      addPasskey: authMocks.addPasskey,
      deletePasskey: authMocks.deletePasskey,
    },
  },
}));

vi.mock("@/lib/step-up-client", () => ({
  verifyBoardPasskey: authMocks.verifyBoardPasskey,
}));

beforeEach(() => {
  authMocks.useListPasskeys.mockReturnValue({ data: [], isPending: false });
  authMocks.addPasskey.mockReset();
  authMocks.deletePasskey.mockReset();
  authMocks.verifyBoardPasskey.mockReset();
  authMocks.verifyBoardPasskey.mockResolvedValue(undefined);
});

afterEach(() => cleanup());

describe("PasskeyManager", () => {
  it("shows a newly registered passkey immediately when the index-backed list is still empty", async () => {
    authMocks.addPasskey.mockResolvedValue({
      data: {
        id: "passkey-1",
        name: "Tiny Yubikey",
        createdAt: new Date("2026-08-13T15:28:01.632Z"),
        userId: "user-1",
        credentialID: "credential-1",
        publicKey: "public-key",
        counter: 0,
        deviceType: "singleDevice",
        backedUp: false,
      },
      error: null,
    });

    render(<PasskeyManager />);
    fireEvent.change(screen.getByPlaceholderText("Passkey name (optional)"), { target: { value: "Tiny Yubikey" } });
    fireEvent.click(screen.getByRole("button", { name: "Add passkey" }));

    await waitFor(() => expect(screen.getByText("Tiny Yubikey")).toBeVisible());
    expect(screen.queryByText("No passkeys are registered yet.")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Passkey registered.");
  });

  it("requires a passkey ceremony before continuing from a recovery session", async () => {
    authMocks.useListPasskeys.mockReturnValue({
      data: [{
        id: "passkey-1",
        name: "Security key",
        createdAt: new Date("2026-08-13T15:28:01.632Z"),
        userId: "user-1",
        credentialID: "credential-1",
        publicKey: "public-key",
        counter: 0,
        deviceType: "singleDevice",
        backedUp: false,
      }],
      isPending: false,
    });

    render(<PasskeyManager verificationRequired />);
    expect(screen.queryByRole("link", { name: "Continue to the Board portal" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Verify passkey to continue" }));

    await waitFor(() => expect(authMocks.verifyBoardPasskey).toHaveBeenCalledOnce());
    expect(screen.getByRole("link", { name: "Continue to the Board portal" })).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Passkey verified");
  });
});
