import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildPolicyUpdateEmailAssetPath } from "@/lib/email-link-security";

const mocks = vi.hoisted(() => ({
  getMaterialization: vi.fn(),
  getUploadedPolicyUpdateRecord: vi.fn(),
  s3Send: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/config", () => ({
  EMAIL_TRACKING_SECRET: "test-email-tracking-secret",
  BETTER_AUTH_SECRET: undefined,
  NEXTAUTH_SECRET: undefined,
}));
vi.mock("@/lib/admin/policy-update-email-assets", () => ({
  getPolicyUpdateEmailAssetMaterialization: mocks.getMaterialization,
  materializedPolicyUpdateEmailAssetKey: (materialization: any, asset: string) =>
    materialization.assetNames.includes(asset)
      ? `${materialization.objectPrefix}/${asset}`
      : null,
}));
vi.mock("@/lib/admin/policy-update-uploads", () => ({
  getUploadedPolicyUpdateRecord: mocks.getUploadedPolicyUpdateRecord,
}));
vi.mock("@/lib/s3", () => ({
  s3Client: { send: mocks.s3Send },
}));

const materialization = (materializationId: string, purpose: "publish" | "send") => ({
  materializationId,
  slug: "update-1",
  purpose,
  s3Bucket: "content-bucket",
  objectPrefix: `policy-updates/update-1/email-assets/${materializationId}`,
  assetNames: ["chart.png"],
  createdAt: "2026-07-19T12:00:00.000Z",
  createdBy: "admin-1",
});

async function fetchAsset(path: string) {
  const { GET } = await import("./route");
  return GET(new Request(new URL(path, "https://site.example")), {
    params: Promise.resolve({ slug: "update-1", asset: "chart.png" }),
  });
}

describe("policy update email asset route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUploadedPolicyUpdateRecord.mockResolvedValue({
      slug: "update-1",
      visibilityStatus: "draft",
      publicEmailAssetMaterializationId: null,
    });
    mocks.getMaterialization.mockImplementation(async (id: string) => {
      if (id === "publish-1") return materialization(id, "publish");
      if (id === "send-1" || id === "send-2") return materialization(id, "send");
      return null;
    });
    mocks.s3Send.mockResolvedValue({ Body: "image-bytes" });
  });

  it("denies an unsigned draft asset without reading mutable storage", async () => {
    const response = await fetchAsset(
      "/api/policy-updates/update-1/email-assets/chart.png",
    );

    expect(response.status).toBe(404);
    expect(mocks.getMaterialization).not.toHaveBeenCalled();
    expect(mocks.s3Send).not.toHaveBeenCalled();
  });

  it("serves a signed sent snapshot without consulting the mutable draft", async () => {
    const response = await fetchAsset(
      buildPolicyUpdateEmailAssetPath("update-1", "chart.png", "send-1"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(mocks.getUploadedPolicyUpdateRecord).not.toHaveBeenCalled();
    expect(mocks.s3Send.mock.calls[0][0].input.Key).toBe(
      "policy-updates/update-1/email-assets/send-1/chart.png",
    );
  });

  it("keeps an old sent link on its immutable key after a same-name replacement", async () => {
    const oldUrl = buildPolicyUpdateEmailAssetPath("update-1", "chart.png", "send-1");
    const newUrl = buildPolicyUpdateEmailAssetPath("update-1", "chart.png", "send-2");

    await fetchAsset(oldUrl);
    await fetchAsset(newUrl);

    expect(mocks.s3Send.mock.calls[0][0].input.Key).toContain("/send-1/chart.png");
    expect(mocks.s3Send.mock.calls[1][0].input.Key).toContain("/send-2/chart.png");
  });

  it("serves the immutable publish snapshot to legacy unsigned URLs", async () => {
    mocks.getUploadedPolicyUpdateRecord.mockResolvedValueOnce({
      slug: "update-1",
      visibilityStatus: "published",
      publicEmailAssetMaterializationId: "publish-1",
    });

    const response = await fetchAsset(
      "/api/policy-updates/update-1/email-assets/chart.png",
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("public");
    expect(mocks.s3Send.mock.calls[0][0].input.Key).toContain("/publish-1/chart.png");
  });

  it("keeps the publish snapshot after unpublishing or later content edits", async () => {
    mocks.getUploadedPolicyUpdateRecord.mockResolvedValueOnce({
      slug: "update-1",
      visibilityStatus: "unpublished",
      sections: [],
      publicEmailAssetMaterializationId: "publish-1",
    });

    const response = await fetchAsset(
      "/api/policy-updates/update-1/email-assets/chart.png",
    );

    expect(response.status).toBe(200);
    expect(mocks.s3Send.mock.calls[0][0].input.Key).toContain("/publish-1/chart.png");
  });

  it("denies a materialization or asset changed after signing", async () => {
    const signed = new URL(
      buildPolicyUpdateEmailAssetPath("update-1", "chart.png", "send-1"),
      "https://site.example",
    );
    signed.searchParams.set("v", "send-2");

    const response = await fetchAsset(`${signed.pathname}${signed.search}`);

    expect(response.status).toBe(404);
    expect(mocks.s3Send).not.toHaveBeenCalled();
  });
});
