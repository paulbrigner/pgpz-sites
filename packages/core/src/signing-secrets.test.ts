import { describe, expect, it } from "vitest";
import {
  MINIMUM_PRODUCTION_SIGNING_SECRET_BYTES,
  resolveSigningSecret,
} from "./signing-secrets";

describe("resolveSigningSecret", () => {
  it("requires at least 32 bytes for production signing secrets", () => {
    expect(() =>
      resolveSigningSecret({
        name: "EMAIL_TRACKING_SECRET",
        value: "x".repeat(MINIMUM_PRODUCTION_SIGNING_SECRET_BYTES - 1),
        nodeEnv: "production",
      }),
    ).toThrow("must contain at least 32 bytes");

    expect(
      resolveSigningSecret({
        name: "EMAIL_TRACKING_SECRET",
        value: "x".repeat(MINIMUM_PRODUCTION_SIGNING_SECRET_BYTES),
        nodeEnv: "production",
      }),
    ).toBe("x".repeat(MINIMUM_PRODUCTION_SIGNING_SECRET_BYTES));
  });

  it("requires a configured production secret unless explicitly optional", () => {
    expect(() =>
      resolveSigningSecret({
        name: "BETTER_AUTH_SECRET",
        value: "",
        nodeEnv: "production",
      }),
    ).toThrow("BETTER_AUTH_SECRET is required in production");

    expect(
      resolveSigningSecret({
        name: "OPTIONAL_ROTATION_SECRET",
        value: "",
        nodeEnv: "production",
        requiredInProduction: false,
      }),
    ).toBeNull();
  });

  it("preserves permissive local and test fixtures", () => {
    expect(
      resolveSigningSecret({
        name: "EMAIL_TRACKING_SECRET",
        value: " local-fixture ",
        nodeEnv: "test",
      }),
    ).toBe("local-fixture");
    expect(
      resolveSigningSecret({
        name: "EMAIL_TRACKING_SECRET",
        value: "",
        nodeEnv: "development",
      }),
    ).toBeNull();
  });
});
