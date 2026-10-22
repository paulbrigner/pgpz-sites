import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PasskeyManager } from "@/components/security/PasskeyManager";

const authMocks = vi.hoisted(() => ({
  useListPasskeys: vi.fn(),
  addPasskey: vi.fn(),
  deletePasskey: vi.fn(),
  verifyBoardPasskey: vi.fn(),
  refetch: vi.fn(),
}));

const navigationMocks = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => navigationMocks,
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
  BOARD_PASSKEY_VERIFICATION_ERROR: "Passkey verification did not complete. Try again and complete your device verification.",
}));

const savedPasskey = {
  id: "passkey-1", name: "Security key", createdAt: new Date("2026-08-13T15:28:01.632Z"),
  userId: "user-1", credentialID: "credential-1", publicKey: "public-key", counter: 0,
  deviceType: "singleDevice", backedUp: false,
};

beforeEach(() => {
  authMocks.useListPasskeys.mockReturnValue({ data: [], isPending: false, error: null, refetch: authMocks.refetch });
  authMocks.addPasskey.mockReset();
  authMocks.deletePasskey.mockReset();
  authMocks.verifyBoardPasskey.mockReset();
  authMocks.verifyBoardPasskey.mockResolvedValue(undefined);
  navigationMocks.replace.mockReset();
  navigationMocks.refresh.mockReset();
  authMocks.refetch.mockReset();
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
    fireEvent.click(screen.getByRole("button", { name: "Create your first passkey" }));

    await waitFor(() => expect(screen.getByText("Tiny Yubikey")).toBeVisible());
    expect(screen.queryByText(/No passkeys are registered yet/)).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Passkey registered.");
  });

  it("automatically returns to the requested portal route after recovery verification", async () => {
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

    render(<PasskeyManager verificationRequired continueTo="/meetings/meeting-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Verify passkey to continue" }));

    await waitFor(() => expect(authMocks.verifyBoardPasskey).toHaveBeenCalledOnce());
    expect(navigationMocks.replace).toHaveBeenCalledWith("/meetings/meeting-1");
    expect(navigationMocks.refresh).toHaveBeenCalledOnce();
    expect(screen.queryByRole("link", { name: "Continue to the Board portal" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Passkey verified. Opening the Board portal");
  });

  it("requires explicit verification after creating the first passkey before opening Board content", async () => {
    authMocks.addPasskey.mockResolvedValue({ data: savedPasskey, error: null });
    render(<PasskeyManager verificationRequired continueTo="/meetings/m?reviewThread=assessment-1" />);
    expect(screen.queryByRole("button", { name: "Verify passkey to continue" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create your first passkey" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Passkey created. Verify it to open the Board portal.");
    expect(authMocks.verifyBoardPasskey).not.toHaveBeenCalled();
    expect(navigationMocks.replace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Verify passkey to continue" }));
    await waitFor(() => expect(navigationMocks.replace).toHaveBeenCalledWith("/meetings/m?reviewThread=assessment-1"));
  });

  it.each(["error", "cancelled", "missing-data"])("does not advance after registration is %s", async (outcome) => {
    if (outcome === "cancelled") authMocks.addPasskey.mockRejectedValue(new Error("device detail"));
    else authMocks.addPasskey.mockResolvedValue(outcome === "error" ? { data: null, error: { message: "provider detail" } } : { data: null, error: null });
    render(<PasskeyManager verificationRequired />);
    fireEvent.click(screen.getByRole("button", { name: "Create your first passkey" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Passkey setup was not completed. Try again");
    expect(screen.queryByRole("button", { name: "Verify passkey to continue" })).not.toBeInTheDocument();
    expect(navigationMocks.replace).not.toHaveBeenCalled();
  });

  it("does not call an unresolved passkey list empty or allow registration while it loads", () => {
    authMocks.useListPasskeys.mockReturnValue({ data: undefined, isPending: true, error: null });
    render(<PasskeyManager verificationRequired />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading passkeys");
    expect(screen.queryByText(/No passkeys are registered yet/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create your first passkey" })).not.toBeInTheDocument();
    const add = screen.getByRole("button", { name: "Add passkey" });
    expect(add).toBeDisabled();
    fireEvent.click(add);
    expect(authMocks.addPasskey).not.toHaveBeenCalled();
  });

  it("shows retry guidance on list failure without treating stale data as an empty account", () => {
    authMocks.useListPasskeys.mockReturnValue({ data: [], isPending: false, error: { message: "private failure" }, refetch: authMocks.refetch });
    render(<PasskeyManager verificationRequired />);
    expect(screen.getByRole("alert")).toHaveTextContent("We could not load your passkeys");
    expect(screen.queryByText(/No passkeys are registered yet/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add passkey" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Retry loading passkeys" }));
    expect(authMocks.refetch).toHaveBeenCalledOnce();
  });

  it("requires the existing passkey before adding another", async () => {
    authMocks.useListPasskeys.mockReturnValue({ data: [savedPasskey], isPending: false, error: null });
    authMocks.verifyBoardPasskey.mockRejectedValue(new Error("cancelled"));
    render(<PasskeyManager verificationRequired />);
    expect(screen.getByText(/If you have lost all your passkeys/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Add passkey" }));
    await screen.findByRole("status");
    expect(authMocks.verifyBoardPasskey).toHaveBeenCalledOnce();
    expect(authMocks.addPasskey).not.toHaveBeenCalled();
    expect(navigationMocks.replace).not.toHaveBeenCalled();
  });

  it("does not remove the final passkey", async () => {
    authMocks.useListPasskeys.mockReturnValue({ data: [savedPasskey], isPending: false, error: null });
    render(<PasskeyManager />);
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Add another passkey before removing your only passkey.");
    expect(authMocks.deletePasskey).not.toHaveBeenCalled();
  });

  it("keeps verification failures on the security screen and never echoes arbitrary errors", async () => {
    authMocks.useListPasskeys.mockReturnValue({ data: [savedPasskey], isPending: false, error: null });
    authMocks.verifyBoardPasskey.mockRejectedValue(new Error("private provider message"));
    render(<PasskeyManager verificationRequired />);
    fireEvent.click(screen.getByRole("button", { name: "Verify passkey to continue" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Passkey verification did not complete");
    expect(screen.getByRole("status")).not.toHaveTextContent("private provider message");
    expect(navigationMocks.replace).not.toHaveBeenCalled();
    expect(navigationMocks.refresh).not.toHaveBeenCalled();
  });
});
