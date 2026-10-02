import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRecord: vi.fn(),
  getMemberAccess: vi.fn(),
  isMemberPreviewRequest: vi.fn(),
  notFound: vi.fn((): never => { throw new Error("NOT_FOUND"); }),
  redirect: vi.fn((url: string): never => { throw new Error(`REDIRECT:${url}`); }),
}));

vi.mock("server-only", () => ({}));
vi.mock("@pgpz/core/server", () => ({ policyUpdateSourceObjectKey: vi.fn() }));
vi.mock("@/lib/dynamodb", () => ({
  documentClient: { get: mocks.getRecord },
  TABLE_NAME: "policy-update-test-table",
}));
vi.mock("@/lib/config", () => ({
  POLICY_UPDATE_UPLOAD_BUCKET: "policy-update-test-bucket",
  POLICY_UPDATE_UPLOAD_PREFIX: "policy-updates/uploads",
}));
vi.mock("@/lib/member-access", () => ({ getMemberAccess: mocks.getMemberAccess }));
vi.mock("@/lib/admin/member-preview-server", () => ({
  isMemberPreviewRequest: mocks.isMemberPreviewRequest,
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound, redirect: mocks.redirect }));

import UpdateDetailPage from "./page";

const slug = "divider-regression-draft";

function storedDraft(withDividers: boolean) {
  return {
    slug,
    category: "weekly",
    title: "Weekly policy memo",
    summary: "Draft formatting review.",
    uploadedAt: "2026-10-02T12:00:00.000Z",
    sourceFormat: "docx",
    s3Bucket: "policy-update-test-bucket",
    s3Key: `policy-updates/uploads/${slug}/source.docx`,
    visibilityStatus: "draft",
    sections: [
      { heading: "First policy development", body: ["First article body."] },
      {
        heading: "Relevant Post",
        body: [],
        dividerAfter: withDividers,
        images: [{
          src: `/api/policy-updates/${slug}/assets/image-1.png`,
          alt: "First embedded X post screenshot",
        }],
      },
      { heading: "Second policy development", body: ["Second article body."] },
      {
        heading: "Relevant Post",
        body: [],
        dividerAfter: withDividers,
        images: [{
          src: `/api/policy-updates/${slug}/assets/image-2.png`,
          alt: "Second embedded X post screenshot",
        }],
      },
      { heading: "Third policy development", body: ["Third article body."] },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getRecord.mockResolvedValue({ Item: storedDraft(true) });
  mocks.getMemberAccess.mockResolvedValue({
    authenticated: true,
    isMember: true,
    user: { isAdmin: true },
  });
  mocks.isMemberPreviewRequest.mockResolvedValue(false);
});

describe("uploaded DOCX policy update dividers", () => {
  it("renders stored source dividers after relevant-post images and before the next article", async () => {
    const markup = renderToStaticMarkup(await UpdateDetailPage({ params: Promise.resolve({ slug }) }));
    const document = new DOMParser().parseFromString(markup, "text/html");
    const dividers = [...document.querySelectorAll("article hr")];

    expect(dividers).toHaveLength(2);
    for (const [index, divider] of dividers.entries()) {
      expect(divider.previousElementSibling?.querySelector("img")?.getAttribute("src"))
        .toBe(`/api/policy-updates/${slug}/assets/image-${index + 1}.png`);
      expect(divider.nextElementSibling?.querySelector("h2")?.textContent)
        .toBe(index === 0 ? "Second policy development" : "Third policy development");
      expect(divider.getAttribute("class")).toContain("border-[#F79646]");
    }
    expect(markup).toContain("Draft preview");
    expect(mocks.getRecord).toHaveBeenCalledWith({
      TableName: "policy-update-test-table",
      Key: { pk: `POLICY_UPDATE_UPLOAD#${slug}`, sk: `POLICY_UPDATE_UPLOAD#${slug}` },
    });
  });

  it("does not invent dividers between DOCX sections without source borders", async () => {
    mocks.getRecord.mockResolvedValue({ Item: storedDraft(false) });
    const markup = renderToStaticMarkup(await UpdateDetailPage({ params: Promise.resolve({ slug }) }));
    const document = new DOMParser().parseFromString(markup, "text/html");

    expect(document.querySelectorAll("article hr")).toHaveLength(0);
    expect(document.querySelectorAll('img[src*="/assets/image-"]')).toHaveLength(2);
    expect(markup).toContain("Third policy development");
  });

  it("keeps the corrected draft restricted to administrators", async () => {
    mocks.getMemberAccess.mockResolvedValue({
      authenticated: true,
      isMember: true,
      user: { isAdmin: false },
    });

    await expect(UpdateDetailPage({ params: Promise.resolve({ slug }) })).rejects.toThrow("NOT_FOUND");
  });
});
