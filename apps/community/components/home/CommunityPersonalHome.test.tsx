import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommunityPersonalHome } from "./CommunityPersonalHome";

afterEach(cleanup);

vi.mock("next/image", () => ({
  default: ({
    alt,
    priority: _priority,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt || ""} {...props} />
  ),
}));

vi.mock("@/components/referrals/ReferralInviteCard", () => ({
  ReferralInviteCard: ({ className }: { className?: string }) => (
    <section className={className}>
      <h2>Invite prospective members</h2>
    </section>
  ),
}));

describe("CommunityPersonalHome", () => {
  it("prioritizes participation and retains the ready member actions", () => {
    render(
      <CommunityPersonalHome
        displayName="Paul"
        memberSince="June 13, 2026"
        xMonitorEnabled
        xMonitorBriefingsEnabled
      />,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Welcome back, Paul." })).toBeVisible();
    expect(screen.getByText("Active member")).toBeVisible();
    expect(screen.getByRole("link", { name: /Visit the public archive/ })).toHaveAttribute("href", "https://pgpz.org/updates");
    expect(screen.getByRole("link", { name: /Invite someone/ })).toHaveAttribute("href", "/settings/profile#member-recruitment");
    expect(screen.getByRole("link", { name: /Open Signal/ })).toHaveAttribute("href", expect.stringContaining("https://signal.group/"));
    expect(screen.getByRole("link", { name: /Topic Briefings/ })).toHaveAttribute(
      "href",
      "/x-monitor/briefings",
    );
    expect(screen.getByRole("link", { name: /X Monitor/ })).toHaveAttribute(
      "href",
      "/x-monitor",
    );
    expect(screen.getByRole("link", { name: /ZEC Shelf/ })).toHaveAttribute(
      "href",
      "/zec-shelf",
    );
    expect(screen.getByRole("heading", { name: "Invite prospective members" })).toBeVisible();
  });

  it("omits disabled intelligence actions without hiding the rest of the dashboard", () => {
    render(
      <CommunityPersonalHome
        displayName="Member"
        memberSince="July 1, 2026"
        xMonitorEnabled={false}
        xMonitorBriefingsEnabled={false}
      />,
    );

    expect(screen.queryByRole("link", { name: /Topic Briefings/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /X Monitor/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ZEC Shelf/ })).toBeVisible();
    expect(screen.getByRole("link", { name: /Visit the public archive/ })).toBeVisible();
  });
});
