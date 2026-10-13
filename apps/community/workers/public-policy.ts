import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable, type Writable } from "node:stream";
import { finished, pipeline } from "node:stream/promises";
import { createPublicPolicyService, LEGACY_POLICY_FILES, type PublicPolicyMedia } from "../lib/public-policy-updates";
import { createPublicPolicyHttpHandler } from "../lib/public-policy-http";

type FunctionUrlEvent = { rawPath: string; requestContext: { http: { method: string } } };
declare const awslambda: {
  streamifyResponse: (callback: (event: FunctionUrlEvent, stream: Writable) => Promise<void>) => unknown;
  HttpResponseStream: { from: (stream: Writable, metadata: { statusCode: number; headers: Record<string, string> }) => Writable };
};
function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
const table = required("PUBLIC_POLICY_TABLE");
const bucket = required("PUBLIC_POLICY_BUCKET");
const prefix = required("PUBLIC_POLICY_PREFIX");
if (process.env.PUBLIC_POLICY_ORIGIN && process.env.PUBLIC_POLICY_ORIGIN !== "https://pgpz.org") throw new Error("Unexpected public policy origin");
const database = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const service = createPublicPolicyService({
  bucket,
  uploadPrefix: prefix,
  async readRecord(slug) {
    const result = await database.send(new GetCommand({
      TableName: table,
      Key: { pk: `POLICY_UPDATE_UPLOAD#${slug}`, sk: `POLICY_UPDATE_UPLOAD#${slug}` },
      ConsistentRead: true,
    }));
    return result.Item;
  },
  async listCandidateSlugs() {
    const slugs: string[] = [];
    let cursor: Record<string, unknown> | undefined;
    do {
      const result = await database.send(new QueryCommand({
        TableName: table, IndexName: "GSI1",
        KeyConditionExpression: "#pk = :pk",
        ExpressionAttributeNames: { "#pk": "GSI1PK", "#slug": "slug" },
        ExpressionAttributeValues: { ":pk": "POLICY_UPDATE_UPLOAD" },
        ProjectionExpression: "#slug", ExclusiveStartKey: cursor,
      }));
      for (const item of result.Items || []) if (typeof item.slug === "string") slugs.push(item.slug);
      cursor = result.LastEvaluatedKey;
    } while (cursor);
    return slugs;
  },
});
async function readMedia(media: PublicPolicyMedia, headOnly: boolean) {
  if (media.kind === "bundled") {
    if (!(LEGACY_POLICY_FILES as readonly string[]).includes(media.fileName)) throw new Error("Unknown bundled policy media");
    const filePath = path.join(__dirname, "resources", media.fileName);
    const info = await stat(filePath);
    return { contentLength: info.size, ...(headOnly ? {} : { body: createReadStream(filePath) }) };
  }
  const input = { Bucket: media.bucket, Key: media.key };
  if (headOnly) {
    const result = await s3.send(new HeadObjectCommand(input));
    return { contentLength: result.ContentLength };
  }
  const result = await s3.send(new GetObjectCommand(input));
  if (!result.Body) throw new Error("Policy media object has no body");
  return { contentLength: result.ContentLength, body: result.Body as Readable };
}
const handle = createPublicPolicyHttpHandler({ service, readMedia });
export const handler = awslambda.streamifyResponse(async (event, responseStream) => {
  const response = await handle({ method: event.requestContext.http.method, rawPath: event.rawPath });
  const stream = awslambda.HttpResponseStream.from(responseStream, { statusCode: response.statusCode, headers: response.headers });
  if (response.statusCode >= 500) console.error(JSON.stringify({ service: "pgpz-public-policy", event: "request.failed", statusCode: response.statusCode }));
  if (!response.body) {
    // Lambda emits the HTTP metadata prelude on the first write, not end().
    // Flush it without body bytes so HEAD and 405 keep their status/headers.
    stream.write("");
    stream.end();
    await finished(stream);
    return;
  }
  await pipeline(typeof response.body === "string" ? Readable.from([response.body]) : response.body, stream);
});
