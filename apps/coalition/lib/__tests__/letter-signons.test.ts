import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  query: vi.fn(),
  update: vi.fn(),
  transactWrite: vi.fn(),
  s3Send: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dynamodb", () => ({
  documentClient: {
    get: mocks.get,
    put: mocks.put,
    query: mocks.query,
    update: mocks.update,
    transactWrite: mocks.transactWrite,
  },
  TABLE_NAME: "LetterSignOnTestTable",
}));
vi.mock("@/lib/config", () => ({
  LETTER_SIGNON_BUCKET: "letter-bucket",
  LETTER_SIGNON_PREFIX: "letter-signons",
  SITE_URL: "https://coalition.example.test",
}));
vi.mock("@/lib/s3", () => ({
  s3Client: { send: mocks.s3Send },
}));

const campaignItem = ({
  deadlineAt = "2026-08-01T17:00:00.000Z",
  status = "open",
  revisions = [
    {
      version: 1,
      sha256: "a".repeat(64),
      fileName: "letter.pdf",
      fileSize: 100,
      changeType: "initial",
      changeSummary: "Initial draft",
      uploadedAt: "2026-07-27T12:00:00.000Z",
      uploadedBy: "admin-1",
      bucket: "letter-bucket",
      key: "letter-signons/campaigns/campaign-1/documents/v1.pdf",
      etag: "etag-1",
    },
  ],
}: {
  deadlineAt?: string;
  status?: string;
  revisions?: Array<Record<string, unknown>>;
} = {}) => ({
  pk: "LETTER_CAMPAIGN#campaign-1",
  sk: "LETTER_CAMPAIGN#campaign-1",
  type: "LETTER_CAMPAIGN",
  id: "campaign-1",
  slug: "clarity-act",
  title: "Support for H.R. 3633",
  summary: "A coalition letter.",
  recipient: "United States Senate",
  deadlineAt,
  status,
  currentDocument: revisions[revisions.length - 1],
  revisions,
  notices: [],
  createdAt: "2026-07-27T12:00:00.000Z",
  createdBy: "admin-1",
  updatedAt: "2026-07-27T12:00:00.000Z",
  updatedBy: "admin-1",
  deliveredAt: null,
  archivedAt: null,
});

const signer = {
  signerKind: "individual" as const,
  displayName: "Example Member",
  organizationName: null,
  title: "Developer",
  affiliation: "Zcash ecosystem",
};

describe("Coalition letter sign-on repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("paginates campaign and signer records without table scans", async () => {
    mocks.query
      .mockResolvedValueOnce({
        Items: [campaignItem()],
        LastEvaluatedKey: { pk: "page-2" },
      })
      .mockResolvedValueOnce({ Items: [] });
    const { listLetterCampaigns } = await import("@/lib/letter-signons");
    const campaigns = await listLetterCampaigns();

    expect(campaigns).toHaveLength(1);
    expect(mocks.query).toHaveBeenCalledTimes(2);
    expect(mocks.query.mock.calls[0][0]).toMatchObject({
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk",
    });
    expect(mocks.query.mock.calls[1][0]).toMatchObject({
      ExclusiveStartKey: { pk: "page-2" },
    });
  });

  it("enforces the status, deadline, version, and hash in the sign-on transaction", async () => {
    mocks.get.mockResolvedValue({});
    mocks.transactWrite.mockResolvedValue({});
    const { saveLetterSignOn } = await import("@/lib/letter-signons");
    const campaign = {
      ...campaignItem(),
      effectiveStatus: "open",
    } as any;

    const result = await saveLetterSignOn({
      campaign,
      userId: "user-1",
      email: "member@example.test",
      signer,
      acceptanceText: "I reviewed and support this exact draft.",
      now: new Date("2026-07-28T12:00:00.000Z"),
    });

    expect(result.duplicate).toBe(false);
    expect(mocks.transactWrite).toHaveBeenCalledWith({
      TransactItems: [
        {
          ConditionCheck: expect.objectContaining({
            ConditionExpression: expect.stringMatching(
              /#status = :open.*deadlineAt > :now.*currentDocument.#version = :version.*currentDocument.sha256 = :sha256/,
            ),
            ExpressionAttributeValues: expect.objectContaining({
              ":now": "2026-07-28T12:00:00.000Z",
              ":version": 1,
              ":sha256": "a".repeat(64),
            }),
          }),
        },
        {
          Put: expect.objectContaining({
            ConditionExpression: "attribute_not_exists(pk)",
          }),
        },
      ],
    });
  });

  it("rejects an expired campaign before attempting a write", async () => {
    const { saveLetterSignOn } = await import("@/lib/letter-signons");
    const campaign = {
      ...campaignItem({ deadlineAt: "2026-07-28T12:00:00.000Z" }),
      effectiveStatus: "closed",
    } as any;

    await expect(
      saveLetterSignOn({
        campaign,
        userId: "user-1",
        email: "member@example.test",
        signer,
        acceptanceText: "I reviewed this draft.",
        now: new Date("2026-07-28T12:00:00.000Z"),
      }),
    ).rejects.toThrow(/no longer accepting/i);
    expect(mocks.transactWrite).not.toHaveBeenCalled();
  });

  it("marks prior acceptances non-current after a material revision", async () => {
    const revisions = [
      campaignItem().currentDocument,
      {
        ...campaignItem().currentDocument,
        version: 2,
        sha256: "b".repeat(64),
        changeType: "material",
        changeSummary: "Changed the requested legislative language.",
      },
    ];
    mocks.get.mockResolvedValue({
      Item: {
        pk: "LETTER_CAMPAIGN#campaign-1",
        sk: "SIGNON#user-1",
        campaignId: "campaign-1",
        userId: "user-1",
        email: "member@example.test",
        ...signer,
        acceptances: [],
        acceptedAt: "2026-07-27T18:00:00.000Z",
        documentVersion: 1,
        documentSha256: "a".repeat(64),
        acceptanceText: "I reviewed version 1.",
        withdrawnAt: null,
        confirmationStatus: "sent",
        confirmationSentAt: "2026-07-27T18:01:00.000Z",
        confirmationError: null,
        createdAt: "2026-07-27T18:00:00.000Z",
        updatedAt: "2026-07-27T18:01:00.000Z",
      },
    });
    const { getLetterSignOn } = await import("@/lib/letter-signons");
    const signOn = await getLetterSignOn(
      {
        ...campaignItem({ revisions }),
        effectiveStatus: "open",
      } as any,
      "user-1",
    );
    expect(signOn?.current).toBe(false);
  });

  it("verifies stored PDF bytes against the signed SHA-256", async () => {
    const bytes = new TextEncoder().encode("%PDF-1.7\nexample");
    const { createHash } = await import("node:crypto");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    mocks.s3Send.mockResolvedValue({
      Body: { transformToByteArray: async () => bytes },
    });
    const { getLetterDocumentBytes } = await import("@/lib/letter-signons");

    await expect(
      getLetterDocumentBytes({
        ...campaignItem().currentDocument,
        sha256,
      } as any),
    ).resolves.toEqual(bytes);
    await expect(
      getLetterDocumentBytes({
        ...campaignItem().currentDocument,
        sha256: "0".repeat(64),
      } as any),
    ).rejects.toThrow(/document hash/i);
  });
});
