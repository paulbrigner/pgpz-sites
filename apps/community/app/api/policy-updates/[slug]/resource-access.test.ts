import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ record: vi.fn(), access: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/admin/policy-update-uploads", () => ({ getUploadedPolicyUpdateRecord: mocks.record }));
vi.mock("@/lib/policy-update-access", () => ({ hasPolicyUpdateResourceAccess: mocks.access }));
vi.mock("@/lib/s3", () => ({ s3Client: { send: mocks.send } }));
vi.mock("@pgpz/core/server", () => ({ policyUpdateAssetObjectKey: () => "asset.png" }));
import { GET as pdf } from "./pdf/route";
import { GET as asset } from "./assets/[asset]/route";
const request = new NextRequest("https://community.pgpz.org/api/policy-updates/memo/pdf");
const params = Promise.resolve({ slug: "memo", asset: "image-1.png" });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ allowed: false, isAdmin: false });
  mocks.record.mockResolvedValue({ visibilityStatus: "draft", pdfS3Key: "resource.pdf", s3Bucket: "private-bucket", s3Key: "source.docx" });
  mocks.send.mockResolvedValue({ Body: { transformToWebStream: () => new ReadableStream() } });
});

describe("old Community cover endpoint", () => {
  it.each([
    ["cover.svg", "/api/policy-updates/memo/assets/cover.svg"],
    ["cover.png", "https://community.pgpz.org/api/policy-updates/memo/assets/cover.png"],
    ["memo-cover.jpg", "/api/policy-updates/memo/assets/memo-cover.jpg"],
  ])("redirects the exact published cover %s to its public cover route", async (name, coverImage) => {
    mocks.record.mockResolvedValue({ visibilityStatus: "published", coverImage });

    const response = await asset(request, { params: Promise.resolve({ slug: "memo", asset: name }) });

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://pgpz.org/updates/memo/cover");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it.each([
    "/api/policy-updates/memo/assets/different-cover.png",
    "/api/policy-updates/other-memo/assets/image-1.png",
    "https://unrelated.example/api/policy-updates/memo/assets/image-1.png",
    "https://community.pgpz.org/api/policy-updates/memo/assets/image-1.png?alternate=true",
    "https://community.pgpz.org/api/policy-updates/memo/assets/image-1.png#alternate",
    "https://user@community.pgpz.org/api/policy-updates/memo/assets/image-1.png",
    "https://[invalid/api/policy-updates/memo/assets/image-1.png",
    "/api/policy-updates/other-memo/../memo/assets/image-1.png",
  ])("retains the section-image path when the cover reference does not match: %s", async (coverImage) => {
    mocks.record.mockResolvedValue({ visibilityStatus: "published", coverImage });

    const response = await asset(request, { params });

    expect(response.headers.get("location")).toBe("https://pgpz.org/updates/memo/assets/image-1.png");
  });
});
describe.each([["PDF", pdf, "document.pdf"], ["asset", asset, "assets/image-1.png"]] as const)("old Community %s endpoint", (_label, handler, suffix) => {
  it("redirects published files to the public origin without forwarding a session", async () => {
    mocks.record.mockResolvedValue({ visibilityStatus: "published" });
    const response = await handler(request, { params });
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`https://pgpz.org/updates/memo/${suffix}`);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.record).toHaveBeenCalledWith("memo", { consistentRead: true });
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it.each(["draft", "unpublished"])("conceals %s files from members and anonymous users", async (visibilityStatus) => {
    mocks.record.mockResolvedValue({ visibilityStatus });
    mocks.access.mockResolvedValue({ allowed: true, isAdmin: false });
    const response = await handler(request, { params });
    expect(response.status).toBe(404);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("retains private admin previews with no-store", async () => {
    mocks.access.mockResolvedValue({ allowed: true, isAdmin: true });
    const response = await handler(request, { params });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
