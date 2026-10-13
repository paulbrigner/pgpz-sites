// @vitest-environment node
import { Writable, Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ database: vi.fn(), s3: vi.fn(), metadata: vi.fn() }));
vi.mock("@aws-sdk/client-dynamodb", () => ({ DynamoDBClient: class {} }));
vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: () => ({ send: mocks.database }) },
  GetCommand: class { constructor(public input: Record<string, unknown>) {} },
  QueryCommand: class { constructor(public input: Record<string, unknown>) {} },
}));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class { send = mocks.s3; },
  GetObjectCommand: class { constructor(public input: Record<string, unknown>) {} },
  HeadObjectCommand: class { constructor(public input: Record<string, unknown>) {} },
}));

const slug = "worker-test";
const currentRecord = () => ({
  slug, category: "weekly", title: "Published through worker", publishedAt: "2026-10-12", visibilityStatus: "published", sourceFormat: "docx",
  s3Bucket: "community-test", s3Key: `policy-updates/uploads/${slug}/source.docx`, pdfS3Key: `policy-updates/uploads/${slug}/resource.pdf`, sections: [{ heading: "Article", body: ["Article body"] }],
});
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  vi.stubEnv("PUBLIC_POLICY_TABLE", "CommunityTable");
  vi.stubEnv("PUBLIC_POLICY_BUCKET", "community-test");
  vi.stubEnv("PUBLIC_POLICY_PREFIX", "policy-updates/uploads");
  vi.stubEnv("PUBLIC_POLICY_ORIGIN", "https://pgpz.org");
  vi.stubGlobal("awslambda", {
    streamifyResponse: (callback: unknown) => callback,
    HttpResponseStream: { from: (stream: Writable, metadata: unknown) => { mocks.metadata(metadata); return stream; } },
  });
  mocks.database.mockResolvedValue({ Item: currentRecord() });
});
async function request(rawPath: string, method = "GET") {
  const { handler } = await import("./public-policy");
  const chunks: Buffer[] = [];
  const stream = new Writable({ write(chunk, _encoding, callback) { chunks.push(Buffer.from(chunk)); callback(); } });
  await (handler as (event: unknown, stream: Writable) => Promise<void>)({ rawPath, requestContext: { http: { method } } }, stream);
  return Buffer.concat(chunks).toString("utf8");
}
describe("regional public policy worker", () => {
  it("reads only the canonical policy key with ConsistentRead enabled", async () => {
    expect(await request(`/updates/${slug}`)).toContain("Published through worker");
    expect(mocks.database).toHaveBeenCalledWith(expect.objectContaining({ input: {
      TableName: "CommunityTable", Key: { pk: `POLICY_UPDATE_UPLOAD#${slug}`, sk: `POLICY_UPDATE_UPLOAD#${slug}` }, ConsistentRead: true,
    } }));
    expect(mocks.s3).not.toHaveBeenCalled();
  });
  it("streams the exact PDF bytes only after a second publication read", async () => {
    const payload = "%PDF-1.7\n" + "0123456789".repeat(1000);
    mocks.s3.mockResolvedValue({ Body: Readable.from([payload.slice(0, 75), payload.slice(75)]), ContentLength: payload.length });
    expect(await request(`/updates/${slug}/document.pdf`)).toBe(payload);
    expect(mocks.database).toHaveBeenCalledTimes(2);
    expect(mocks.s3).toHaveBeenCalledWith(expect.objectContaining({ input: { Bucket: "community-test", Key: `policy-updates/uploads/${slug}/resource.pdf` } }));
    expect(mocks.metadata).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 200, headers: expect.objectContaining({ "Content-Type": "application/pdf", "Content-Length": String(payload.length) }) }));
  });
  it("pages the index for slugs only and rechecks every record", async () => {
    mocks.database.mockImplementation(async ({ input }) => {
      if (input.IndexName) return input.ExclusiveStartKey ? { Items: [{ slug: "private-draft" }] } : { Items: [{ slug }], LastEvaluatedKey: { pk: "cursor" } };
      return { Item: input.Key.pk.endsWith("private-draft") ? { slug: "private-draft", visibilityStatus: "draft" } : currentRecord() };
    });
    const feed = JSON.parse(await request("/updates/feed.json"));
    expect(feed.updates).toHaveLength(3);
    expect(feed.updates.some((entry: { slug: string }) => entry.slug === "private-draft")).toBe(false);
    const queries = mocks.database.mock.calls.map(([command]) => command.input).filter((input) => input.IndexName);
    expect(queries).toHaveLength(2);
    expect(queries[0]).toMatchObject({ TableName: "CommunityTable", IndexName: "GSI1", ExpressionAttributeValues: { ":pk": "POLICY_UPDATE_UPLOAD" }, ProjectionExpression: "#slug" });
    expect(queries[1].ExclusiveStartKey).toEqual({ pk: "cursor" });
  });
  it("keeps draft PDF requests away from S3", async () => {
    mocks.database.mockResolvedValue({ Item: { ...currentRecord(), visibilityStatus: "draft" } });
    expect(await request(`/updates/${slug}/document.pdf`)).not.toContain("Published through worker");
    expect(mocks.metadata).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
    expect(mocks.s3).not.toHaveBeenCalled();
  });
});
