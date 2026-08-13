import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BoardUserManager, type BoardManagedUser } from "./BoardUserManager";

const users: BoardManagedUser[] = [
  { id: "1", email: "ada@example.org", name: "Ada Director", role: "member", status: "active", passkeyCount: 1, createdAt: "2026-01-01", updatedAt: "2026-01-02" },
  { id: "2", email: "counsel@example.org", name: "Legal Counsel", role: "legal-counsel", status: "deactivated", passkeyCount: 2, createdAt: "2026-01-01", updatedAt: "2026-01-03" },
  { id: "3", email: "support@example.org", name: "Board Operations", role: "board-support", status: "active", passkeyCount: 0, createdAt: "2026-01-01", updatedAt: "2026-01-04" },
];

afterEach(() => cleanup());

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
});
