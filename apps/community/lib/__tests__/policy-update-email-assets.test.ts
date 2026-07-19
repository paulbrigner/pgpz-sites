import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  s3Send: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dynamodb", () => ({
  TABLE_NAME: "TestTable",
  documentClient: { get: mocks.get, put: mocks.put },
}));
vi.mock("@/lib/s3", () => ({
  s3Client: { send: mocks.s3Send },
}));

const upload = {
  slug: "update-1",
  s3Bucket: "content-bucket",
  s3Key: "policy-updates/update-1.pdf",
  sections: [
    {
      heading: "Summary",
      body: ["Body"],
      images: [
        {
          src: "/api/policy-updates/update-1/assets/chart.png",
          alt: "Chart",
        },
      ],
    },
  ],
} as any;

describe("policy update email asset materialization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.put.mockResolvedValue({});
    mocks.s3Send.mockResolvedValue({ CopyObjectResult: { ETag: "etag" } });
  });

  it.each(["publish", "send"] as const)(
    "copies referenced assets into an immutable %s snapshot before recording it",
    async (purpose) => {
      const { materializePolicyUpdateEmailAssets } = await import(
        "@/lib/admin/policy-update-email-assets"
      );
      const materialization = await materializePolicyUpdateEmailAssets({
        upload,
        purpose,
        createdBy: "admin-1",
      });

      expect(materialization).toMatchObject({
        slug: "update-1",
        purpose,
        assetNames: ["chart.png"],
      });
      const copy = mocks.s3Send.mock.calls[0][0];
      expect(copy.input.CopySource).toBe(
        "content-bucket/policy-updates/update-1/assets/chart.png",
      );
      expect(copy.input.Key).toBe(
        `policy-updates/update-1/email-assets/${materialization!.materializationId}/chart.png`,
      );
      expect(mocks.put).toHaveBeenCalledAfter(mocks.s3Send);
      expect(mocks.put).toHaveBeenCalledWith(
        expect.objectContaining({
          ConditionExpression: "attribute_not_exists(pk)",
          Item: expect.objectContaining({
            materializationId: materialization!.materializationId,
            purpose,
          }),
        }),
      );
    },
  );

  it("gives a same-name replacement a new key without changing the old sent snapshot", async () => {
    const { materializePolicyUpdateEmailAssets } = await import(
      "@/lib/admin/policy-update-email-assets"
    );
    const first = await materializePolicyUpdateEmailAssets({
      upload,
      purpose: "send",
      createdBy: "admin-1",
    });
    const firstKey = mocks.s3Send.mock.calls[0][0].input.Key;
    mocks.s3Send.mockClear();

    const second = await materializePolicyUpdateEmailAssets({
      upload,
      purpose: "send",
      createdBy: "admin-1",
    });
    const secondKey = mocks.s3Send.mock.calls[0][0].input.Key;

    expect(second!.materializationId).not.toBe(first!.materializationId);
    expect(secondKey).not.toBe(firstKey);
    expect(firstKey).toContain(first!.materializationId);
    expect(secondKey).toContain(second!.materializationId);
  });

  it("does not create a materialization when no local email assets are referenced", async () => {
    const { materializePolicyUpdateEmailAssets } = await import(
      "@/lib/admin/policy-update-email-assets"
    );
    const result = await materializePolicyUpdateEmailAssets({
      upload: { ...upload, sections: [] },
      purpose: "send",
      createdBy: null,
    });

    expect(result).toBeNull();
    expect(mocks.s3Send).not.toHaveBeenCalled();
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("materializes only relative local asset routes", async () => {
    const { policyUpdateEmailAssetNames } = await import(
      "@/lib/admin/policy-update-email-assets"
    );

    expect(
      policyUpdateEmailAssetNames({
        ...upload,
        sections: [
          {
            images: [
              { src: "/api/policy-updates/update-1/assets/chart.png?revision=2" },
              { src: "https://external.example/api/policy-updates/update-1/assets/external.png" },
              { src: "/api/policy-updates/another-update/assets/wrong.png" },
            ],
          },
        ],
      }),
    ).toEqual(["chart.png"]);
  });

  it("strongly reads newly written materialization metadata", async () => {
    mocks.get.mockResolvedValueOnce({
      Item: {
        materializationId: "materialization-1",
        slug: "update-1",
        purpose: "send",
        s3Bucket: "content-bucket",
        objectPrefix: "policy-updates/update-1/email-assets/materialization-1",
        assetNames: ["chart.png"],
        createdAt: "2026-07-19T12:00:00.000Z",
      },
    });
    const { getPolicyUpdateEmailAssetMaterialization } = await import(
      "@/lib/admin/policy-update-email-assets"
    );

    await expect(
      getPolicyUpdateEmailAssetMaterialization("materialization-1"),
    ).resolves.toMatchObject({ materializationId: "materialization-1" });
    expect(mocks.get).toHaveBeenCalledWith(
      expect.objectContaining({ ConsistentRead: true }),
    );
  });
});
