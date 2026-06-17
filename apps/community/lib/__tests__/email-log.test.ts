import { describe, expect, it } from "vitest";
import { groupPolicyUpdateEmailLogs } from "@/lib/admin/email-log";

const updates = [
  {
    slug: "2026-06-08-weekly-policy-memo",
    title: "PGPZ Weekly Policy Update",
    shortTitle: "Weekly Policy Update",
    category: "weekly",
    categoryLabel: "Weekly update",
    emailSubject: "PGPZ Weekly Policy Update - June 8",
  },
  {
    slug: "1H2026-us-digital-asset-policy",
    title: "U.S. Digital Asset Policy in 2026",
    shortTitle: "U.S. Digital Asset Policy in 2026",
    category: "special",
    categoryLabel: "Featured",
    emailSubject: "PGPZ Featured Update - U.S. Digital Asset Policy in 2026",
  },
];

describe("groupPolicyUpdateEmailLogs", () => {
  it("reconstructs legacy all-member policy update sends from adjacent email log rows", () => {
    const runs = groupPolicyUpdateEmailLogs(
      [
        {
          createdAt: "2026-06-17T11:00:00.000Z",
          status: "sent",
          subject: "PGPZ Weekly Policy Update - June 8",
          email: "one@example.com",
          metadata: { updateSlug: "2026-06-08-weekly-policy-memo", category: "weekly" },
        },
        {
          createdAt: "2026-06-17T11:00:08.000Z",
          status: "failed",
          subject: "PGPZ Weekly Policy Update - June 8",
          email: "two@example.com",
          error: "SMTP rejected recipient",
          metadata: { updateSlug: "2026-06-08-weekly-policy-memo", category: "weekly" },
        },
        {
          createdAt: "2026-06-17T11:45:00.000Z",
          status: "sent",
          subject: "PGPZ Weekly Policy Update - June 8",
          email: "three@example.com",
          metadata: { updateSlug: "2026-06-08-weekly-policy-memo", category: "weekly" },
        },
      ],
      updates,
    );

    expect(runs).toHaveLength(2);
    expect(runs[0].stats).toMatchObject({ recipientCount: 1, sentCount: 1, failedCount: 0 });
    expect(runs[0].engagementTracked).toBe(false);
    expect(runs[0].stats.openCount).toBeNull();
    expect(runs[1].stats).toMatchObject({ recipientCount: 2, sentCount: 1, failedCount: 1 });
    expect(runs[1].failurePreview).toEqual([
      { email: "two@example.com", error: "SMTP rejected recipient" },
    ]);
  });

  it("uses explicit policy update send run IDs when present", () => {
    const runs = groupPolicyUpdateEmailLogs(
      [
        {
          createdAt: "2026-06-17T11:00:00.000Z",
          status: "sent",
          subject: "PGPZ Featured Update - U.S. Digital Asset Policy in 2026",
          email: "one@example.com",
          metadata: {
            updateSlug: "1H2026-us-digital-asset-policy",
            category: "special",
            policyUpdateSendRunId: "send-run-1",
          },
        },
        {
          createdAt: "2026-06-17T11:40:00.000Z",
          status: "sent",
          subject: "PGPZ Featured Update - U.S. Digital Asset Policy in 2026",
          email: "two@example.com",
          metadata: {
            updateSlug: "1H2026-us-digital-asset-policy",
            category: "special",
            policyUpdateSendRunId: "send-run-1",
          },
        },
      ],
      updates,
    );

    expect(runs).toHaveLength(1);
    expect(runs[0].id).toBe("send-run-1");
    expect(runs[0].source).toBe("send_run");
    expect(runs[0].engagementTracked).toBe(false);
    expect(runs[0].categoryLabel).toBe("Featured");
    expect(runs[0].stats).toMatchObject({ recipientCount: 2, sentCount: 2, failedCount: 0 });
  });

  it("ignores draft sends", () => {
    const runs = groupPolicyUpdateEmailLogs(
      [
        {
          createdAt: "2026-06-17T11:00:00.000Z",
          status: "sent",
          subject: "PGPZ Weekly Policy Update - June 8",
          email: "draft@example.com",
          metadata: { updateSlug: "2026-06-08-weekly-policy-memo", category: "weekly", draft: true },
        },
      ],
      updates,
    );

    expect(runs).toEqual([]);
  });
});
