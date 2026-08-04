import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MainNav } from "./main-nav";

const mocks = vi.hoisted(() => ({
  pathname: "/",
  push: vi.fn(),
  signOut: vi.fn(),
  setViewAsMember: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/lib/use-app-session", () => ({
  useAppSession: () => ({
    data: {
      capabilities: {
        member: true,
      },
    },
    status: "authenticated",
    signOut: mocks.signOut,
  }),
}));

vi.mock("@/components/admin/AdminViewMode", () => ({
  useAdminViewMode: () => ({
    actualIsAdmin: false,
    effectiveIsAdmin: false,
    viewAsMember: false,
    setViewAsMember: mocks.setViewAsMember,
  }),
}));

describe("coalition main navigation", () => {
  beforeEach(() => {
    mocks.pathname = "/";
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it("links the approved composite mark to the official Zcash website", () => {
    render(<MainNav />);

    expect(
      screen.getByRole("link", {
        name: "Pretty Good Policy Coalition logo; visit the official Zcash website",
      }),
    ).toHaveAttribute("href", "https://z.cash/");
    expect(screen.getByAltText("Pretty Good Policy Coalition")).toBeInTheDocument();
  });

  it("highlights a section in the mobile menu on its nested routes", async () => {
    mocks.pathname = "/groups/privacy";
    const user = userEvent.setup();

    render(<MainNav />);
    await user.click(screen.getByRole("button", { name: "Open navigation menu" }));

    const mobileMenu = within(document.getElementById("main-nav-mobile-menu")!);
    expect(mobileMenu.getByRole("link", { name: "Policy Groups" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(mobileMenu.getByRole("link", { name: "Policy Groups" })).toHaveClass(
      "bg-[var(--zcash-gold)]",
    );
    expect(mobileMenu.getByRole("link", { name: "Home" })).not.toHaveAttribute(
      "aria-current",
    );
  });
});
