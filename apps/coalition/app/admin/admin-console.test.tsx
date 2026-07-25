import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const featureEnabled = vi.hoisted(() => vi.fn());

vi.mock("@/config/features", () => ({
  isFeatureEnabled: featureEnabled,
}));
vi.mock("./admin-client", () => ({
  default: () => <div>User panel</div>,
}));
vi.mock("@/components/admin/AccessLogPanel", () => ({
  AccessLogPanel: () => <div>Access panel</div>,
}));
vi.mock("@/components/admin/NewsletterMailer", () => ({
  NewsletterMailer: () => <div>Newsletter panel</div>,
}));
vi.mock("@/components/admin/PolicyUpdateMailer", () => ({
  PolicyUpdateMailer: () => <div>Update panel</div>,
}));
vi.mock("@/components/admin/PublicFileLibraryPanel", () => ({
  PublicFileLibraryPanel: () => <div>Public file library panel</div>,
}));
vi.mock("@/components/admin/ResourceModerationPanel", () => ({
  ResourceModerationPanel: () => <div>Resource queue panel</div>,
}));
vi.mock("@/components/admin/SignupNotificationsPanel", () => ({
  SignupNotificationsPanel: () => <div>Notification panel</div>,
}));

import { AdminConsole } from "./admin-console";

describe("Coalition admin public files integration", () => {
  beforeEach(() => {
    featureEnabled.mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("keeps the resource queue and opens the distinct public file library", async () => {
    const user = userEvent.setup();
    render(<AdminConsole initialUpdates={[]} currentAdminId="admin-1" />);

    expect(screen.getByRole("button", { name: /Resource queue/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Public files/i }));
    expect(screen.getByText("Public file library panel")).toBeInTheDocument();
  });

  it("hides only public files when its registered feature is off", () => {
    featureEnabled.mockImplementation((feature: string) => feature !== "publicFiles");
    render(<AdminConsole initialUpdates={[]} currentAdminId="admin-1" />);

    expect(screen.queryByRole("button", { name: /Public files/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Public file library panel")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Resource queue/i })).toBeInTheDocument();
  });
});
