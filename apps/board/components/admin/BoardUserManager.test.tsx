import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardUserManager, type BoardManagedUser } from "./BoardUserManager";

const authMocks = vi.hoisted(() => ({ fetchWithBoardStepUp: vi.fn() }));
vi.mock("@/lib/step-up-client", () => authMocks);

const users: BoardManagedUser[] = [
  { id: "1", email: "ada@example.org", name: "Ada Director", role: "member", status: "active", passkeyCount: 1, createdAt: "2026-01-01", updatedAt: "2026-01-02" },
  { id: "2", email: "counsel@example.org", name: "Legal Counsel", role: "legal-counsel", status: "deactivated", passkeyCount: 2, createdAt: "2026-01-01", updatedAt: "2026-01-03" },
  { id: "3", email: "support@example.org", name: "Board Operations", role: "board-support", status: "active", passkeyCount: 0, createdAt: "2026-01-01", updatedAt: "2026-01-04" },
];

afterEach(() => {
  cleanup();
  authMocks.fetchWithBoardStepUp.mockReset();
});

describe("BoardUserManager", () => {
  it("summarizes, filters, and expands the Board access roster", () => {
    render(<BoardUserManager initialUsers={users} currentUserEmail="ada@example.org" />);
    expect(screen.getByText("3", { selector: "p" })).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/Search by name/i), { target: { value: "counsel" } });
    expect(screen.queryByText("Ada Director")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Legal Counsel counsel@example.org/i }));
    expect(screen.getByText("Passkeys")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reactivate" })).toBeInTheDocument();
  });

  it("prevents self role and deactivation controls", () => {
    render(<BoardUserManager initialUsers={users} currentUserEmail="ada@example.org" />);
    fireEvent.click(screen.getByRole("button", { name: /Ada Director ada@example.org/i }));
    expect(screen.getByRole("combobox", { name: "Ada Director role" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Deactivate" })).toBeDisabled();
  });

  it("offers current role names without exposing the legacy admin value", () => {
    render(<BoardUserManager initialUsers={users} currentUserEmail="ada@example.org" />);
    fireEvent.click(screen.getByRole("button", { name: "Add user" }));
    const role = screen.getByRole("combobox", { name: "Role" });
    expect(role).toHaveTextContent("Board Chair");
    expect(role).toHaveTextContent("Board Support");
    expect(role).not.toHaveTextContent("Board administrator");
  });

  it("shows the welcome-email delivery result returned by user creation", async () => {
    authMocks.fetchWithBoardStepUp.mockResolvedValue({
      ok: true,
      json: async () => ({
        user: { id: "4", email: "new@example.org", name: "New Director", role: "member", status: "active", passkeyCount: 0, createdAt: "2026-08-27", updatedAt: "2026-08-27" },
        welcomeEmailSent: true,
        message: "Welcome email sent to new@example.org.",
      }),
    });
    render(<BoardUserManager initialUsers={users} currentUserEmail="ada@example.org" />);
    fireEvent.click(screen.getByRole("button", { name: "Add user" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "New Director" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Email" }), { target: { value: "new@example.org" } });
    fireEvent.click(screen.getByRole("button", { name: "Create passwordless user" }));

    await waitFor(() => expect(authMocks.fetchWithBoardStepUp).toHaveBeenCalledOnce());
    expect(await screen.findByRole("status")).toHaveTextContent("Welcome email sent to new@example.org.");
    expect(screen.getByText("New Director")).toBeInTheDocument();
  });
});
