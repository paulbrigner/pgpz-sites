import { describe, expect, it, vi } from "vitest";
import { createEmailBackgroundJobProcessor } from "./email-background-job-processor";
import { createEmailLogRuntime } from "./email-log";
import { createEmailTrackingRuntime } from "./email-tracking";
import { createNewsletterRuntime } from "./newsletters";
import type { EmailRuntimeDocumentClient } from "./types";

function documentClient(
  overrides: Partial<EmailRuntimeDocumentClient> = {},
): EmailRuntimeDocumentClient {
  return {
    get: vi.fn(async () => ({})),
    put: vi.fn(async () => ({})),
    query: vi.fn(async () => ({ Items: [] })),
    update: vi.fn(async () => ({})),
    delete: vi.fn(async () => ({})),
    transactWrite: vi.fn(async () => ({})),
    ...overrides,
  };
}

describe("email runtime factories", () => {
  it("persists newsletter drafts through the injected document client", async () => {
    const put = vi.fn(async () => ({}));
    const runtime = createNewsletterRuntime({
      documentClient: documentClient({ put }),
      tableName: "application-table",
    });

    const newsletter = await runtime.saveNewsletterDraft({
      subject: "Weekly update",
      preheader: "This week",
      body: "A sufficiently descriptive newsletter body.",
      adminUserId: "admin-1",
    });

    expect(newsletter.status).toBe("draft");
    expect(put).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: "application-table",
        Item: expect.objectContaining({
          subject: "Weekly update",
          createdBy: "admin-1",
        }),
      }),
    );
  });

  it("creates tracking records through injected persistence", async () => {
    const put = vi.fn(async () => ({}));
    const runtime = createEmailTrackingRuntime({
      documentClient: documentClient({ put }),
      tableName: "application-table",
      emailTrackingDigest: () => "digest",
      emailTrackingDigestCandidates: () => ["digest"],
      getEmailTrackingSecret: () => "secret",
      safeHttpDestination: (value) => value || null,
      unsubscribeMemberFromEmailCategory: vi.fn(async () => true),
    });

    const result = await runtime.createNewsletterTrackingRecord({
      trackingId: "9f9c515b-6435-44ba-8a9d-65bcceb71462",
      newsletterId: "weekly",
      userId: "member-1",
      email: "member@example.com",
    });

    expect(result.trackingId).toBe("9f9c515b-6435-44ba-8a9d-65bcceb71462");
    expect(put).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: "application-table",
        ConditionExpression: "attribute_not_exists(pk)",
      }),
    );
  });

  it("keeps policy-update history grouping independent of persistence", () => {
    const runtime = createEmailLogRuntime({
      documentClient: documentClient(),
      tableName: "application-table",
    });

    const grouped = runtime.groupPolicyUpdateEmailLogs(
      [{
        createdAt: "2026-08-10T12:00:00.000Z",
        status: "sent",
        subject: "Policy memo",
        metadata: { updateSlug: "policy-memo", policyUpdateSendRunId: "run-1" },
      }],
      [{
        slug: "policy-memo",
        title: "Policy memo",
        shortTitle: "Memo",
        category: "weekly",
        categoryLabel: "Weekly",
        emailSubject: "Policy memo",
      }],
    );

    expect(grouped).toHaveLength(1);
    expect(grouped[0]).toMatchObject({
      id: "run-1",
      updateSlug: "policy-memo",
      stats: { sentCount: 1, failedCount: 0 },
    });
  });

  it("rejects unsupported job kinds before invoking app-owned dependencies", async () => {
    const dependency = vi.fn();
    const runtime = createEmailBackgroundJobProcessor(
      new Proxy({}, { get: () => dependency }) as never,
    );

    await expect(
      runtime.processEmailBackgroundJobTask({
        job: { kind: "other" },
        task: {},
        leaseToken: "lease",
      } as never),
    ).rejects.toThrow("Unsupported email background job kind: other");
    expect(dependency).not.toHaveBeenCalled();
  });
});
