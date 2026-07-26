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

const update = ({
  slug,
  title,
  publishedAt,
  categoryLabel,
}: {
  slug: string;
  title: string;
  publishedAt: string;
  categoryLabel: string;
}) => ({
  slug,
  categoryLabel,
  title,
  shortTitle: title,
  publishedAt,
  summary: `${title} summary`,
  emailPreheader: `${title} preheader`,
  coverImage: `/${slug}.png`,
  portalPath: `/updates/${slug}`,
});

describe("CommunityPersonalHome", () => {
  it("prioritizes the newest real update and exposes the ready member actions", () => {
    render(
      <CommunityPersonalHome
        displayName="Paul"
        memberSince="June 13, 2026"
        updates={[
          update({
            slug: "older-special",
            title: "Older special report",
            publishedAt: "2026-07-10",
            categoryLabel: "Special Update",
          }),
          update({
            slug: "new-weekly",
            title: "Newest weekly memo",
            publishedAt: "2026-07-20",
            categoryLabel: "Weekly Policy Memo",
          }),
        ]}
        xMonitorEnabled
        xMonitorBriefingsEnabled
      />,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Welcome back, Paul." })).toBeVisible();
    expect(screen.getByText("Active member")).toBeVisible();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Start with the latest weekly policy memo",
      }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "The newest weekly policy memo is your fastest route into the current policy conversation.",
      ),
    ).toBeVisible();
    expect(screen.getAllByRole("link", { name: /Read latest update/ })[0]).toHaveAttribute(
      "href",
      "/updates/new-weekly",
    );
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
        updates={[]}
        xMonitorEnabled={false}
        xMonitorBriefingsEnabled={false}
      />,
    );

    expect(screen.queryByRole("link", { name: /Topic Briefings/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /X Monitor/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ZEC Shelf/ })).toBeVisible();
    expect(screen.getByText("The latest policy update will appear here when it is published.")).toBeVisible();
  });
});
