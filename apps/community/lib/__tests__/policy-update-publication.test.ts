import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@pgpz/core/server", () => ({ policyUpdateSourceObjectKey: vi.fn() }));
vi.mock("@/lib/dynamodb", () => ({ documentClient: mocks, TABLE_NAME: "community-test" }));
vi.mock("@/lib/config", () => ({ POLICY_UPDATE_UPLOAD_BUCKET: "community-bucket", POLICY_UPDATE_UPLOAD_PREFIX: "policy-updates/uploads" }));

import { claimPolicyUpdateGeneration, releasePolicyUpdateGeneration, clearInterruptedPolicyUpdateGeneration, publishUploadedPolicyUpdate, saveGeneratedPolicyUpdateContent } from "@/lib/admin/policy-update-uploads";

const record = { s3Bucket: "community-bucket", s3Key: "source.docx", uploadedAt: "2026-10-13T12:00:00Z", slug: "memo", category: "weekly", visibilityStatus: "draft", generationStatus: "generated", generatedAt: "2026-10-13T12:00:00.000Z", sourceFormat: "docx", pdfS3Key: "resource.pdf" };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockResolvedValue({ Item: record });
  mocks.update.mockResolvedValue({});
});

describe("policy publication and generation exclusion", () => {
  it("claims before generation with a unique token and an atomic published/active-writer guard", async () => {
    const lease = await claimPolicyUpdateGeneration("memo");
    const request = mocks.update.mock.calls[0][0];
    expect(request.Key).toEqual({ pk: "POLICY_UPDATE_UPLOAD#memo", sk: "POLICY_UPDATE_UPLOAD#memo" });
    expect(request.ConditionExpression).toContain("visibilityStatus <> :published");
    expect(request.ConditionExpression).toContain("attribute_not_exists(generationLeaseId)");
    expect(request.ExpressionAttributeValues[":leaseId"]).toBe(lease);
    expect(request.ExpressionAttributeValues[":published"]).toBe("published");
    expect(request.ExpressionAttributeValues[":pending"]).toBe("not_started");
  });

  it("surfaces a concurrent publication/claim conflict without retrying an unsafe write", async () => {
    mocks.update.mockRejectedValueOnce({ name: "ConditionalCheckFailedException" });
    await expect(claimPolicyUpdateGeneration("memo")).rejects.toThrow("Unpublish");
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });

  it("publishes only without a generation lock and with the artifact revision that was reviewed", async () => {
    await publishUploadedPolicyUpdate("memo", "admin", "email-snapshot", record.generatedAt);
    const request = mocks.update.mock.calls[0][0];
    expect(request.ConditionExpression).toContain("attribute_not_exists(generationLeaseId)");
    expect(request.ConditionExpression).toContain("generationStatus = :generated");
    expect(request.ConditionExpression).toContain("generatedAt = :expectedGeneratedAt");
    expect(request.ExpressionAttributeValues[":expectedGeneratedAt"]).toBe(record.generatedAt);
    expect(mocks.get.mock.calls[0][0].ConsistentRead).toBe(true);
  });

  it("retains the reviewed revision in the condition even if the record was regenerated", async () => {
    mocks.get.mockResolvedValue({ Item: { ...record, generatedAt: "2026-10-13T13:00:00.000Z" } });
    mocks.update.mockRejectedValueOnce({ name: "ConditionalCheckFailedException" });

    await expect(publishUploadedPolicyUpdate("memo", "admin", "email-snapshot", record.generatedAt)).rejects.toMatchObject({ name: "ConditionalCheckFailedException" });

    expect(mocks.update.mock.calls[0][0].ExpressionAttributeValues[":expectedGeneratedAt"]).toBe(record.generatedAt);
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });

  it("does not release another request's generation lock", async () => {
    await releasePolicyUpdateGeneration("memo", "owner-token");
    const request = mocks.update.mock.calls[0][0];
    expect(request.ConditionExpression).toBe("generationLeaseId = :leaseId");
    expect(request.ExpressionAttributeValues[":leaseId"]).toBe("owner-token");
  });

  it("requires a stale unpublished lock for explicit recovery and invalidates partial generation", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-13T13:00:00Z"));
    try {
      await clearInterruptedPolicyUpdateGeneration("memo");
      const request = mocks.update.mock.calls[0][0];
      expect(request.ConditionExpression).toContain("generationLeaseStartedAt < :cutoff");
      expect(request.ConditionExpression).toContain("visibilityStatus <> :published");
      expect(request.ExpressionAttributeValues[":cutoff"]).toBe("2026-10-13T12:30:00.000Z");
      expect(request.ExpressionAttributeValues[":failed"]).toBe("failed");
      expect(request.UpdateExpression).toContain("generationStatus = :failed");
    } finally { vi.useRealTimers(); }
  });

  it("requires the generation owner when saving the artifact and never changes a public record", async () => {
    await saveGeneratedPolicyUpdateContent({ slug: "memo", generationLeaseId: "owner-token", keyTakeaways: [], actionItems: [], sections: [], generatedBy: "admin", generatedModel: "docx", sourceTextLength: 12, sourceTextSha256: "source", pdfS3Key: "resource.pdf", pdfFileName: "memo.pdf", pdfFileSize: 12, pdfSha256: "pdf" });
    const request = mocks.update.mock.calls[0][0];
    expect(request.ConditionExpression).toContain("visibilityStatus <> :published");
    expect(request.ConditionExpression).toContain("generationLeaseId = :leaseId");
    expect(request.ExpressionAttributeValues[":leaseId"]).toBe("owner-token");
  });
});
