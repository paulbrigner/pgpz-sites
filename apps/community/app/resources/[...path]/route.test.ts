import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPublicFileRecord: vi.fn(),
  hasPublicFileMemberAccess: vi.fn(),
  send: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/public-files", () => ({
  getPublicFileRecord: mocks.getPublicFileRecord,
}));
vi.mock("@/lib/s3", () => ({
  s3Client: { send: mocks.send },
}));
vi.mock("@/lib/public-file-access", () => ({
  hasPublicFileMemberAccess: mocks.hasPublicFileMemberAccess,
}));

const record = {
  path: "statements/test.pdf",
  title: "Test statement",
  description: "",
  originalFileName: "Résumé.pdf",
  contentType: "application/pdf",
  fileSize: 1000,
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

const context = {
  params: Promise.resolve({ path: ["statements", "test.pdf"] }),
};

describe("public file delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPublicFileRecord.mockResolvedValue(record);
    mocks.hasPublicFileMemberAccess.mockResolvedValue(false);
  });

  it("serves no-auth HEAD metadata with safe Unicode disposition", async () => {
    const { HEAD } = await import("./route");
    const response = await HEAD(
      new Request("https://community.pgpz.org/resources/statements/test.pdf") as any,
      context,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-length")).toBe("1000");
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("content-disposition")).toContain('filename="Resume.pdf"');
    expect(response.headers.get("content-disposition")).toContain(
      "filename*=UTF-8''R%C3%A9sum%C3%A9.pdf",
    );
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("streams a byte range for browser PDF viewing", async () => {
    mocks.send.mockResolvedValue({
      Body: new Uint8Array([1, 2, 3]),
      ContentLength: 100,
      ETag: '"etag-1"',
      LastModified: new Date("2026-07-25T12:00:00.000Z"),
    });
    const { GET } = await import("./route");
    const response = await GET(
      new Request("https://community.pgpz.org/resources/statements/test.pdf", {
        headers: { Range: "bytes=100-199" },
      }) as any,
      context,
    );
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 100-199/1000");
    expect(response.headers.get("content-length")).toBe("100");
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ Range: "bytes=100-199" }),
      }),
    );
  });

  it("rejects invalid or unsatisfiable ranges", async () => {
    const { GET } = await import("./route");
    const response = await GET(
      new Request("https://community.pgpz.org/resources/statements/test.pdf", {
        headers: { Range: "bytes=2000-3000" },
      }) as any,
      context,
    );
    expect(response.status).toBe(416);
    expect(response.headers.get("content-range")).toBe("bytes */1000");
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("returns a public 404 for missing or archived metadata", async () => {
    mocks.getPublicFileRecord.mockResolvedValue(null);
    const { GET } = await import("./route");
    const response = await GET(
      new Request("https://community.pgpz.org/resources/statements/test.pdf") as any,
      context,
    );
    expect(response.status).toBe(404);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("denies a members-only file without protected-content access", async () => {
    mocks.getPublicFileRecord.mockResolvedValue({
      ...record,
      access: "members",
    });
    const { GET } = await import("./route");
    const response = await GET(
      new Request("https://community.pgpz.org/resources/statements/test.pdf") as any,
      context,
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.hasPublicFileMemberAccess).toHaveBeenCalledOnce();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("serves a members-only file to an active member without public caching", async () => {
    mocks.getPublicFileRecord.mockResolvedValue({
      ...record,
      access: "members",
    });
    mocks.hasPublicFileMemberAccess.mockResolvedValue(true);
    mocks.send.mockResolvedValue({
      Body: new Uint8Array([1, 2, 3]),
      ContentLength: 1000,
      ETag: '"etag-1"',
      LastModified: new Date("2026-07-25T12:00:00.000Z"),
    });
    const { GET } = await import("./route");
    const response = await GET(
      new Request("https://community.pgpz.org/resources/statements/test.pdf") as any,
      context,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Cookie");
    expect(mocks.send).toHaveBeenCalledOnce();
  });
});
