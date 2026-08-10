import { describe, expect, it } from "vitest";
import { groupPolicyUpdateEmailLogs } from "./policy-update-history";

const updates = [
  {
    slug: "weekly-update",
    title: "PGPZ Weekly Policy Update",
    shortTitle: "Weekly Policy Update",
    category: "weekly",
    categoryLabel: "Weekly update",
    emailSubject: "PGPZ Weekly Policy Update",
  },
];

describe("policy update email history", () => {
  it("reconstructs legacy sends separated by the compatibility window", () => {
    const runs = groupPolicyUpdateEmailLogs(
      [
        {
          createdAt: "2026-06-17T11:00:00.000Z",
          status: "sent",
          email: "one@example.com",
          metadata: { updateSlug: "weekly-update" },
        },
        {
          createdAt: "2026-06-17T11:00:08.000Z",
          status: "failed",
          email: "two@example.com",
          error: "SMTP rejected recipient",
          metadata: { updateSlug: "weekly-update" },
        },
        {
          createdAt: "2026-06-17T11:45:00.000Z",
          status: "sent",
          email: "three@example.com",
          metadata: { updateSlug: "weekly-update" },
        },
      ],
      updates,
    );

    expect(runs).toHaveLength(2);
    expect(runs[1].stats).toMatchObject({
      recipientCount: 2,
      sentCount: 1,
      failedCount: 1,
    });
    expect(runs[1].failurePreview).toEqual([
      { email: "two@example.com", error: "SMTP rejected recipient" },
    ]);
  });

  it("groups explicit send run IDs and ignores drafts", () => {
    const runs = groupPolicyUpdateEmailLogs(
      [
        {
          createdAt: "2026-06-17T11:00:00.000Z",
          status: "sent",
          metadata: {
            updateSlug: "weekly-update",
            policyUpdateSendRunId: "run-1",
          },
        },
        {
          createdAt: "2026-06-17T11:40:00.000Z",
          status: "sent",
          metadata: {
            updateSlug: "weekly-update",
            policyUpdateSendRunId: "run-1",
          },
        },
        {
          createdAt: "2026-06-17T12:00:00.000Z",
          status: "sent",
          metadata: { updateSlug: "weekly-update", draft: true },
        },
      ],
      updates,
    );

    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      id: "run-1",
      source: "send_run",
      stats: { recipientCount: 2, sentCount: 2 },
    });
  });
});
