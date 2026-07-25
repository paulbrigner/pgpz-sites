import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createPublicFileVersionId: vi.fn(),
  getPublicFileRecord: vi.fn(),
  getPublicFilesBucket: vi.fn(),
  getSignedUrl: vi.fn(),
  listPublicFileRecords: vi.fn(),
  publicFileObjectKey: vi.fn(),
  publicFileRecordToItem: vi.fn(),
  requireAdminSession: vi.fn(),
  restorePreviousPublicFileVersion: vi.fn(),
  savePublicFileUpload: vi.fn(),
  send: vi.fn(),
  setPublicFileArchived: vi.fn(),
  updatePublicFileMetadata: vi.fn(),
  featureEnabled: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/auth", () => ({
  requireAdminSession: mocks.requireAdminSession,
}));
vi.mock("@/config/features", () => ({
  isFeatureEnabled: mocks.featureEnabled,
}));
vi.mock("@/lib/admin/public-files", () => ({
  createPublicFileVersionId: mocks.createPublicFileVersionId,
  getPublicFileRecord: mocks.getPublicFileRecord,
  getPublicFilesBucket: mocks.getPublicFilesBucket,
  listPublicFileRecords: mocks.listPublicFileRecords,
  publicFileObjectKey: mocks.publicFileObjectKey,
  publicFileRecordToItem: mocks.publicFileRecordToItem,
  restorePreviousPublicFileVersion: mocks.restorePreviousPublicFileVersion,
  savePublicFileUpload: mocks.savePublicFileUpload,
  setPublicFileArchived: mocks.setPublicFileArchived,
  updatePublicFileMetadata: mocks.updatePublicFileMetadata,
}));
vi.mock("@/lib/s3", () => ({
  s3Client: { send: mocks.send },
}));
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: mocks.getSignedUrl,
}));

const record = {
  path: "statements/test.pdf",
  title: "Test statement",
  description: "",
  originalFileName: "test.pdf",
  contentType: "application/pdf",
  fileSize: 100,
  access: "public",
  status: "active",
  createdAt: "2026-07-25T12:00:00.000Z",
  createdBy: "admin-1",
  updatedAt: "2026-07-25T12:00:00.000Z",
  updatedBy: "admin-1",
  archivedAt: null,
  archivedBy: null,
  previousVersions: [],
  versionId: "version-1",
  s3Bucket: "public-bucket",
  s3Key: "public-files/objects/statements/test/version-1.pdf",
  etag: "etag-1",
  revision: 1,
};

const publicItem = {
  ...record,
  url: "https://site.example/resources/statements/test.pdf",
  previousVersionCount: 0,
};

const jsonRequest = (method: string, body?: Record<string, unknown>) =>
  new Request("https://site.example/api/admin/public-files", {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }) as any;

describe("public file admin API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.featureEnabled.mockReturnValue(true);
    mocks.requireAdminSession.mockResolvedValue({ user: { id: "admin-1" } });
    mocks.getPublicFilesBucket.mockReturnValue("public-bucket");
    mocks.createPublicFileVersionId.mockReturnValue("version-2");
    mocks.publicFileObjectKey.mockImplementation(
      (path: string, versionId: string) =>
        `public-files/objects/${path.replace(/\.pdf$/, "")}/${versionId}.pdf`,
    );
    mocks.getSignedUrl.mockResolvedValue("https://signed-upload.example.test");
    mocks.publicFileRecordToItem.mockImplementation(() => publicItem);
  });

  it("requires an admin session for listing", async () => {
    mocks.requireAdminSession.mockRejectedValueOnce(new Error("forbidden"));
    const { GET } = await import("./route");
    const response = await GET();
    expect(response.status).toBe(403);
  });

  it("returns 404 without checking auth when the registered feature is off", async () => {
    mocks.featureEnabled.mockReturnValue(false);
    const { GET } = await import("./route");
    const response = await GET();

    expect(response.status).toBe(404);
    expect(mocks.requireAdminSession).not.toHaveBeenCalled();
    expect(mocks.listPublicFileRecords).not.toHaveBeenCalled();
  });

  it("lists existing managed files", async () => {
    mocks.listPublicFileRecords.mockResolvedValue([record]);
    const { GET } = await import("./route");
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ files: [publicItem] });
  });

  it("prepares a versioned, encrypted upload for a new path", async () => {
    mocks.getPublicFileRecord.mockResolvedValue(null);
    const { POST } = await import("./route");
    const response = await POST(
      jsonRequest("POST", {
        action: "prepareUpload",
        path: "Statements/Test.pdf",
        fileName: "Test.pdf",
        fileSize: 100,
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.upload).toMatchObject({
      path: "statements/test.pdf",
      versionId: "version-2",
      uploadUrl: "https://signed-upload.example.test",
      headers: {
        "Content-Type": "application/pdf",
        "x-amz-server-side-encryption": "AES256",
      },
    });
    expect(mocks.getSignedUrl).toHaveBeenCalledOnce();
  });

  it("refuses to overwrite an existing URL without an explicit replacement", async () => {
    mocks.getPublicFileRecord.mockResolvedValue(record);
    const { POST } = await import("./route");
    const response = await POST(
      jsonRequest("POST", {
        action: "prepareUpload",
        path: record.path,
        fileName: "test.pdf",
        fileSize: 100,
      }),
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/Use Replace/);
    expect(mocks.getSignedUrl).not.toHaveBeenCalled();
  });

  it("refuses paths that are still owned by legacy static resources", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      jsonRequest("POST", {
        action: "prepareUpload",
        path: "2026-06-08-weekly-policy-memo.pdf",
        fileName: "2026-06-08-weekly-policy-memo.pdf",
        fileSize: 100,
      }),
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/reserved/i);
    expect(mocks.getPublicFileRecord).not.toHaveBeenCalled();
    expect(mocks.getSignedUrl).not.toHaveBeenCalled();
  });

  it("completes a PDF upload only after storage and signature validation", async () => {
    mocks.getPublicFileRecord.mockResolvedValue(null);
    mocks.send
      .mockResolvedValueOnce({
        ContentLength: 100,
        ContentType: "application/pdf",
        ETag: '"etag-2"',
      })
      .mockResolvedValueOnce({
        Body: {
          transformToByteArray: async () => new TextEncoder().encode("%PDF-1.7"),
        },
      });
    mocks.savePublicFileUpload.mockResolvedValue(record);
    const { POST } = await import("./route");
    const response = await POST(
      jsonRequest("POST", {
        action: "completeUpload",
        path: record.path,
        versionId: "version-2",
        s3Key: "public-files/objects/statements/test/version-2.pdf",
        fileName: "test.pdf",
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.savePublicFileUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        path: record.path,
        etag: "etag-2",
        access: "public",
        adminUserId: "admin-1",
      }),
    );
  });

  it("deletes a rejected object when its bytes do not match the extension", async () => {
    mocks.getPublicFileRecord.mockResolvedValue(null);
    mocks.send
      .mockResolvedValueOnce({
        ContentLength: 100,
        ContentType: "application/pdf",
      })
      .mockResolvedValueOnce({
        Body: {
          transformToByteArray: async () => new TextEncoder().encode("<html>not a pdf"),
        },
      })
      .mockResolvedValueOnce({});
    const { POST } = await import("./route");
    const response = await POST(
      jsonRequest("POST", {
        action: "completeUpload",
        path: record.path,
        versionId: "version-2",
        s3Key: "public-files/objects/statements/test/version-2.pdf",
        fileName: "test.pdf",
      }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/contents do not match/i);
    expect(mocks.savePublicFileUpload).not.toHaveBeenCalled();
    expect(mocks.send).toHaveBeenCalledTimes(3);
  });

  it("edits metadata and archives without deleting the stored object", async () => {
    mocks.updatePublicFileMetadata.mockResolvedValue(record);
    mocks.getPublicFileRecord.mockResolvedValue(record);
    mocks.setPublicFileArchived.mockResolvedValue({ ...record, status: "archived" });
    const { PATCH, POST } = await import("./route");
    const patchResponse = await PATCH(
      jsonRequest("PATCH", {
        path: record.path,
        title: "Updated statement",
        description: "Updated context",
        access: "members",
      }),
    );
    expect(patchResponse.status).toBe(200);
    expect(mocks.updatePublicFileMetadata).toHaveBeenCalledWith({
      path: record.path,
      title: "Updated statement",
      description: "Updated context",
      access: "members",
      adminUserId: "admin-1",
    });

    const archiveResponse = await POST(
      jsonRequest("POST", {
        action: "archive",
        path: record.path,
      }),
    );
    expect(archiveResponse.status).toBe(200);
    expect(mocks.setPublicFileArchived).toHaveBeenCalledWith({
      path: record.path,
      archived: true,
      adminUserId: "admin-1",
    });
  });
});
