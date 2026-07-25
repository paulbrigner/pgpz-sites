import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  query: vi.fn(),
  update: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dynamodb", () => ({
  documentClient: {
    get: mocks.get,
    put: mocks.put,
    query: mocks.query,
    update: mocks.update,
  },
  TABLE_NAME: "PublicFileTestTable",
}));
vi.mock("@/lib/config", () => ({
  PUBLIC_FILES_BUCKET: "public-bucket",
  PUBLIC_FILES_PREFIX: "public-files",
  SITE_URL: "https://site.example",
}));

const item = (path: string, updatedAt: string) => ({
  pk: "PUBLIC_FILE_LIBRARY",
  sk: `FILE#${path}`,
  type: "PUBLIC_FILE",
  path,
  title: path,
  description: "",
  originalFileName: path.split("/").pop(),
  contentType: "application/pdf",
  fileSize: 100,
  access: "public",
  revision: 1,
  versionId: "version-1",
  s3Bucket: "public-bucket",
  s3Key: `public-files/objects/${path}/version-1`,
  etag: "etag-1",
  status: "active",
  createdAt: updatedAt,
  createdBy: "admin-1",
  updatedAt,
  updatedBy: "admin-1",
  archivedAt: null,
  archivedBy: null,
  previousVersions: [],
});

describe("public file repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("paginates the complete DynamoDB file library", async () => {
    mocks.query
      .mockResolvedValueOnce({
        Items: [item("older.pdf", "2026-07-24T12:00:00.000Z")],
        LastEvaluatedKey: { pk: "PUBLIC_FILE_LIBRARY", sk: "FILE#older.pdf" },
      })
      .mockResolvedValueOnce({
        Items: [item("newer.pdf", "2026-07-25T12:00:00.000Z")],
      });
    const { listPublicFileRecords } = await import("@/lib/admin/public-files");
    const records = await listPublicFileRecords();
    expect(mocks.query).toHaveBeenCalledTimes(2);
    expect(mocks.query.mock.calls[1][0]).toMatchObject({
      ExclusiveStartKey: { pk: "PUBLIC_FILE_LIBRARY", sk: "FILE#older.pdf" },
    });
    expect(records.map((record) => record.path)).toEqual(["newer.pdf", "older.pdf"]);
  });

  it("uses immutable object keys under the dedicated public-files prefix", async () => {
    const { publicFileObjectKey } = await import("@/lib/admin/public-files");
    expect(
      publicFileObjectKey(
        "statements-for-the-record/example.pdf",
        "version-123",
      ),
    ).toBe(
      "public-files/objects/statements-for-the-record/example/version-123.pdf",
    );
  });

  it("protects initial writes against a concurrent duplicate path", async () => {
    mocks.get.mockResolvedValue({});
    mocks.put.mockResolvedValue({});
    const { savePublicFileUpload } = await import("@/lib/admin/public-files");
    await savePublicFileUpload({
      path: "statements/example.pdf",
      title: "Example",
      description: "",
      originalFileName: "example.pdf",
      contentType: "application/pdf",
      fileSize: 100,
      access: "members",
      versionId: "version-1",
      s3Bucket: "public-bucket",
      s3Key: "public-files/objects/statements/example/version-1.pdf",
      etag: "etag-1",
      adminUserId: "admin-1",
    });
    expect(mocks.put).toHaveBeenCalledWith(
      expect.objectContaining({
        ConditionExpression: "attribute_not_exists(#pk)",
        ExpressionAttributeNames: { "#pk": "pk" },
      }),
    );
    expect(mocks.put.mock.calls[0][0].Item.access).toBe("members");
  });

  it("increments and conditionally checks the revision when access changes", async () => {
    mocks.get.mockResolvedValue({
      Item: item("statements/example.pdf", "2026-07-25T12:00:00.000Z"),
    });
    mocks.update.mockResolvedValue({});
    const { updatePublicFileMetadata } = await import("@/lib/admin/public-files");
    await updatePublicFileMetadata({
      path: "statements/example.pdf",
      title: "Example",
      description: "Members can download this file.",
      access: "members",
      adminUserId: "admin-1",
    });
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        ConditionExpression: "#revision = :expectedRevision",
        ExpressionAttributeValues: expect.objectContaining({
          ":access": "members",
          ":expectedRevision": 1,
          ":nextRevision": 2,
        }),
      }),
    );
  });
});
