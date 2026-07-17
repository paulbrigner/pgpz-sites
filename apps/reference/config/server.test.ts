import {
  assertMembershipModeAlignment,
  resolveActiveMembership,
} from "@pgpz/core/server";
import { describe, expect, it } from "vitest";
import {
  createReferenceServerConfig,
  externalDemoMembershipAdapter,
} from "./server";
import { referenceSiteConfig } from "./site";

const DEMO_ENV = {
  REFERENCE_DEPLOYMENT_MODE: "demo",
  EMAIL_DELIVERY_MODE: "disabled",
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
  DYNAMODB_TABLE: "PGPZReferenceTest",
  ZEC_SHELF_PARTITION_KEY: "REFERENCE#TEST",
  BETTER_AUTH_SECRET: "reference-test-secret-at-least-32-characters",
  BETTER_AUTH_TRUSTED_ORIGINS: "http://localhost:3000",
} satisfies Record<string, string>;

describe("reference server-only configuration", () => {
  it("aligns the externally managed adapter without connecting resources", () => {
    const config = createReferenceServerConfig(DEMO_ENV);

    expect(() => assertMembershipModeAlignment(referenceSiteConfig, config)).not.toThrow();
    expect(config.dynamodb.tableName).toBe("PGPZReferenceTest");
    expect(config.dynamodb.client).toEqual({ mode: "not-connected" });
    expect(config.email.transport).toEqual({ mode: "disabled" });
  });

  it("rejects any attempt to enable outbound email", () => {
    expect(() => createReferenceServerConfig({ ...DEMO_ENV, EMAIL_DELIVERY_MODE: "enabled" })).toThrow(
      "requires EMAIL_DELIVERY_MODE=disabled",
    );
  });

  it("resolves only an explicit synthetic external-membership fixture", async () => {
    await expect(
      resolveActiveMembership(externalDemoMembershipAdapter, {
        email: " Demo@Example.invalid ",
        attributes: { referenceMembership: "active" },
      }),
    ).resolves.toMatchObject({ active: true, attributes: { source: "reference-fixture" } });

    await expect(
      resolveActiveMembership(externalDemoMembershipAdapter, { id: "demo" }),
    ).resolves.toMatchObject({ active: false });
  });
});
