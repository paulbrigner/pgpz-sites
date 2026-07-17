import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { describe, expect, it } from "vitest";

describe("AWS S3 SDK compatibility", () => {
  it("presigns the policy-update upload shape without network access", async () => {
    const client = new S3Client({
      region: "us-east-1",
      credentials: {
        accessKeyId: "test-access-key",
        secretAccessKey: "test-secret-key",
      },
    });

    try {
      const signedUrl = await getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: "pgpz-security-test",
          Key: "policy-updates/example.pdf",
          ContentType: "application/pdf",
          ServerSideEncryption: "AES256",
        }),
        { expiresIn: 600 },
      );
      const parsed = new URL(signedUrl);

      expect(parsed.protocol).toBe("https:");
      expect(parsed.hostname).toBe("pgpz-security-test.s3.us-east-1.amazonaws.com");
      expect(parsed.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
      expect(parsed.searchParams.get("X-Amz-Expires")).toBe("600");
    } finally {
      client.destroy();
    }
  });
});
