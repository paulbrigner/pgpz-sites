import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const documentClient = {
  get: vi.fn(),
  put: vi.fn(),
  query: vi.fn(),
  update: vi.fn(),
};

const recordItem = (path: string, updatedAt: string) => ({
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

describe("public-file runtime", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { configurePublicFileRuntime } = await import("./runtime");
    configurePublicFileRuntime({
      documentClient,
      tableName: "PublicFileTestTable",
      bucket: "public-bucket",
      prefix: "public-files",
      siteUrl: "https://site.example",
    });
  });

  it("uses injected storage configuration for immutable object keys and URLs", async () => {
    const { publicFileObjectKey, publicFileRecordToItem } = await import("./runtime");
    expect(publicFileObjectKey("statements/example.pdf", "version-2")).toBe(
      "public-files/objects/statements/example/version-2.pdf",
    );
    expect(
      publicFileRecordToItem(
        recordItem("statements/example.pdf", "2026-07-25T12:00:00.000Z") as any,
      ).url,
    ).toBe("https://site.example/resources/statements/example.pdf");
  });

  it("paginates and sorts records through the injected document client", async () => {
    documentClient.query
      .mockResolvedValueOnce({
        Items: [recordItem("older.pdf", "2026-07-24T12:00:00.000Z")],
        LastEvaluatedKey: { pk: "PUBLIC_FILE_LIBRARY", sk: "FILE#older.pdf" },
      })
      .mockResolvedValueOnce({
        Items: [recordItem("newer.pdf", "2026-07-25T12:00:00.000Z")],
      });
    const { listPublicFileRecords } = await import("./runtime");
    const records = await listPublicFileRecords();
    expect(records.map((record) => record.path)).toEqual(["newer.pdf", "older.pdf"]);
    expect(documentClient.query).toHaveBeenCalledTimes(2);
    expect(documentClient.query.mock.calls[1][0]).toMatchObject({
      ExclusiveStartKey: { pk: "PUBLIC_FILE_LIBRARY", sk: "FILE#older.pdf" },
    });
  });
});
