import { describe, expect, it } from "vitest";
import { awsRuntimeClientConfig } from "@/lib/aws-runtime";

describe("AWS runtime client configuration", () => {
  it("uses the AWS SDK default credential provider chain", () => {
    expect(awsRuntimeClientConfig("us-east-1")).toEqual({ region: "us-east-1" });
    expect(awsRuntimeClientConfig("us-east-1")).not.toHaveProperty("credentials");
  });
});
