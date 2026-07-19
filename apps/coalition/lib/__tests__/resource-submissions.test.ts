import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const dynamoMocks = vi.hoisted(() => ({ put: vi.fn(), query: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/dynamodb", () => ({ documentClient: dynamoMocks, TABLE_NAME: "TestTable" }));

import {
  createResourceSubmission,
  listApprovedResourceSubmissions,
  reviewResourceSubmission,
} from "@/lib/resource-submissions";

describe("resource submission moderation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dynamoMocks.put.mockResolvedValue({});
    dynamoMocks.query.mockResolvedValue({ Items: [] });
  });

  it("persists a member submission as pending without sending email", async () => {
    const result = await createResourceSubmission({
      title: " Policy explainer ",
      url: "https://example.test/resource",
      details: "Useful context",
      submittedBy: "member-1",
      submitterName: "Member One",
      submitterEmail: "member@example.test",
    });

    expect(result.status).toBe("pending");
    expect(dynamoMocks.put).toHaveBeenCalledWith(
      expect.objectContaining({
        Item: expect.objectContaining({
          type: "RESOURCE_SUBMISSION",
          title: "Policy explainer",
          status: "pending",
          GSI1PK: "RESOURCE_SUBMISSION_STATUS#pending",
        }),
        ConditionExpression: "attribute_not_exists(pk)",
      }),
    );
  });

  it("rejects non-http links", async () => {
    await expect(createResourceSubmission({
      title: "Unsafe",
      url: "javascript:alert(1)",
      details: "No",
      submittedBy: "member-1",
      submitterName: "Member One",
    })).rejects.toMatchObject({ status: 400 });
    expect(dynamoMocks.put).not.toHaveBeenCalled();
  });

  it("moves an approved item to the approved status index", async () => {
    dynamoMocks.update.mockResolvedValue({
      Attributes: {
        id: "submission-1",
        title: "Resource",
        details: "Details",
        status: "approved",
        submittedBy: "member-1",
        submittedAt: "2026-07-19T12:00:00.000Z",
      },
    });

    await reviewResourceSubmission({
      id: "submission-1",
      decision: "approved",
      adminUserId: "admin-1",
    });

    expect(dynamoMocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        ConditionExpression: "attribute_exists(pk) AND #status = :pending",
        ExpressionAttributeValues: expect.objectContaining({
          ":decision": "approved",
          ":gsi1pk": "RESOURCE_SUBMISSION_STATUS#approved",
        }),
      }),
    );
  });

  it("queries only the approved index for the member library", async () => {
    dynamoMocks.query.mockResolvedValue({
      Items: [{
        id: "submission-1",
        title: "Resource",
        url: "https://example.test/resource",
        details: "Details",
        status: "approved",
        submittedBy: "member-1",
        submitterName: "Member One",
        submitterEmail: "member@example.test",
        submittedAt: "2026-07-19T12:00:00.000Z",
        reviewedAt: "2026-07-19T13:00:00.000Z",
        reviewedBy: "admin-1",
        reviewNote: "Approved",
      }],
    });
    const resources = await listApprovedResourceSubmissions();
    expect(dynamoMocks.query).toHaveBeenCalledWith(
      expect.objectContaining({
        IndexName: "GSI1",
        ExpressionAttributeValues: { ":pk": "RESOURCE_SUBMISSION_STATUS#approved" },
      }),
    );
    expect(resources).toEqual([{
      id: "submission-1",
      title: "Resource",
      url: "https://example.test/resource",
      details: "Details",
    }]);
  });
});
