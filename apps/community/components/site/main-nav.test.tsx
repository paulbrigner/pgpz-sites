import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MainNav } from "./main-nav";

const mocks = vi.hoisted(() => ({
  pathname: "/",
  push: vi.fn(),
  signOut: vi.fn(),
  setViewAsMember: vi.fn(),
  actualIsAdmin: false,
  effectiveIsAdmin: false,
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
        protectedContent: true,
      },
    },
    status: "authenticated",
    signOut: mocks.signOut,
  }),
}));

vi.mock("@/components/admin/AdminViewMode", () => ({
  useAdminViewMode: () => ({
    actualIsAdmin: mocks.actualIsAdmin,
    effectiveIsAdmin: mocks.effectiveIsAdmin,
    viewAsMember: false,
    setViewAsMember: mocks.setViewAsMember,
  }),
}));

vi.mock("@/lib/x-monitor-public", () => ({
  isCommunityXMonitorEnabled: () => true,
}));

describe("community main navigation", () => {
  beforeEach(() => {
    mocks.pathname = "/";
    mocks.actualIsAdmin = false;
    mocks.effectiveIsAdmin = false;
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it("links the approved composite mark to the official Zcash website", () => {
    render(<MainNav />);

    expect(
      screen.getByRole("link", {
        name: "Pretty Good Policy for Zcash Community logo; visit the official Zcash website",
      }),
    ).toHaveAttribute("href", "https://z.cash/");
    expect(screen.getByAltText("Pretty Good Policy for Zcash Community")).toBeInTheDocument();
  });

  it("keeps the member menu at lg but reserves the wider breakpoint for administrators", () => {
    const { rerender } = render(<MainNav />);

    expect(screen.getByRole("navigation", { name: "Primary navigation" })).toHaveClass("lg:flex");
    expect(screen.getByRole("button", { name: "Open navigation menu" }).parentElement).toHaveClass("lg:hidden");

    mocks.actualIsAdmin = true;
    mocks.effectiveIsAdmin = true;
    rerender(<MainNav />);

    expect(screen.getByRole("navigation", { name: "Primary navigation" })).toHaveClass("2xl:flex");
    expect(screen.getByRole("button", { name: "Open navigation menu" }).parentElement).toHaveClass("2xl:hidden");
  });

  it("highlights a section in the mobile menu on its nested routes", async () => {
    mocks.pathname = "/updates/weekly-policy-memo";
    const user = userEvent.setup();

    render(<MainNav />);
    await user.click(screen.getByRole("button", { name: "Open navigation menu" }));

    const mobileMenu = within(document.getElementById("main-nav-mobile-menu")!);
    expect(mobileMenu.getByRole("link", { name: "Updates" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(mobileMenu.getByRole("link", { name: "Updates" })).toHaveClass(
      "bg-[var(--zcash-gold)]",
    );
    expect(mobileMenu.getByRole("link", { name: "Home" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("marks Profile, not its Invite anchor, as the current mobile page", async () => {
    mocks.pathname = "/settings/profile";
    const user = userEvent.setup();

    render(<MainNav />);
    await user.click(screen.getByRole("button", { name: "Open navigation menu" }));

    const mobileMenu = within(document.getElementById("main-nav-mobile-menu")!);
    expect(mobileMenu.getByRole("link", { name: "Profile" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(mobileMenu.getByRole("link", { name: "Invite" })).not.toHaveAttribute(
      "aria-current",
    );
  });
});
