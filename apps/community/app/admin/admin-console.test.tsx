import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const briefingsEnabled = vi.hoisted(() => vi.fn());
vi.mock("@/lib/x-monitor-public", () => ({
  isCommunityXMonitorBriefingsEnabled: briefingsEnabled,
}));
vi.mock("./admin-client", () => ({ default: () => <div>User panel</div> }));
vi.mock("@/components/admin/AccessLogPanel", () => ({ AccessLogPanel: () => <div>Access panel</div> }));
vi.mock("@/components/admin/NewsletterMailer", () => ({ NewsletterMailer: () => <div>Newsletter panel</div> }));
vi.mock("@/components/admin/PolicyUpdateMailer", () => ({ PolicyUpdateMailer: () => <div>Update panel</div> }));
vi.mock("@/components/admin/ReferralProgramPanel", () => ({ ReferralProgramPanel: () => <div>Referral panel</div> }));
vi.mock("@/components/admin/SignupNotificationsPanel", () => ({ SignupNotificationsPanel: () => <div>Notification panel</div> }));
vi.mock("@/components/admin/BriefingsAdminPanel", () => ({ BriefingsAdminPanel: () => <div>Briefings editorial panel</div> }));

import { AdminConsole } from "./admin-console";

describe("admin console Topic Briefings integration", () => {
  beforeEach(() => briefingsEnabled.mockReturnValue(true));
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows the gated editorial tab and opens its panel", async () => {
    const user = userEvent.setup();
    render(<AdminConsole initialUpdates={[]} currentAdminId="admin-1" />);

    await user.click(screen.getByRole("button", { name: /Topic Briefings/i }));
    expect(screen.getByText("Briefings editorial panel")).toBeInTheDocument();
  });

  it("hides the editorial tab while the staged rollout flag is off", () => {
    briefingsEnabled.mockReturnValue(false);
    render(<AdminConsole initialUpdates={[]} currentAdminId="admin-1" />);

    expect(screen.queryByRole("button", { name: /Topic Briefings/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Briefings editorial panel")).not.toBeInTheDocument();
  });
});
