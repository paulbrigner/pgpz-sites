import { describe, expect, it } from "vitest";
import { sanitizeJobError } from "./errors";

describe("job error sanitization", () => {
  it("extracts only the safe Error fields", () => {
    const error = new Error("Provider unavailable") as Error & {
      code: string;
      retryable: boolean;
      providerResponse: unknown;
    };
    error.name = "ProviderError";
    error.code = "TEMPORARY_FAILURE";
    error.retryable = true;
    error.providerResponse = { secret: "do-not-persist" };

    expect(sanitizeJobError(error)).toEqual({
      name: "ProviderError",
      message: "Provider unavailable",
      code: "TEMPORARY_FAILURE",
      retryable: true,
    });
    expect(sanitizeJobError(error)).not.toHaveProperty("stack");
    expect(sanitizeJobError(error)).not.toHaveProperty("providerResponse");
  });

  it("supports provider-shaped plain objects and string failures", () => {
    expect(
      sanitizeJobError({
        name: "SesError",
        message: "Request rejected",
        code: "ThrottlingException",
        retryable: false,
      }),
    ).toEqual({
      name: "SesError",
      message: "Request rejected",
      code: "ThrottlingException",
      retryable: false,
    });
    expect(sanitizeJobError("Timed out")).toEqual({ name: "Error", message: "Timed out" });
  });

  it("redacts common credential forms", () => {
    const sanitized = sanitizeJobError(
      "Bearer abc.def-123 token=supersecret " +
        "https://example.test/callback?access_token=oauth-value&signature=signed-value " +
        "AKIAIOSFODNN7EXAMPLE",
    );

    expect(sanitized.message).toContain("Bearer [REDACTED]");
    expect(sanitized.message).toContain("token=[REDACTED]");
    expect(sanitized.message).toContain("access_token=[REDACTED]");
    expect(sanitized.message).toContain("signature=[REDACTED]");
    expect(sanitized.message).toContain("[REDACTED_AWS_ACCESS_KEY]");
    expect(sanitized.message).not.toMatch(/abc\.def|supersecret|oauth-value|signed-value|AKIAIOS/);
  });

  it("flattens control whitespace and bounds persisted values", () => {
    const sanitized = sanitizeJobError({
      name: "N".repeat(100),
      message: `first\nsecond\t${"x".repeat(600)}`,
      code: "C".repeat(100),
    });

    expect(sanitized.name).toHaveLength(80);
    expect(sanitized.code).toHaveLength(80);
    expect(sanitized.message).toHaveLength(500);
    expect(sanitized.message).not.toMatch(/[\r\n\t]/);
    expect(sanitized.message.endsWith("…")).toBe(true);
  });

  it.each([null, undefined, {}, 42, false])("uses a safe fallback for %#", (error) => {
    expect(sanitizeJobError(error)).toEqual({
      name: "Error",
      message: "Background job task failed",
    });
  });
});
