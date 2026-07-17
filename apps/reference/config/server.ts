import "server-only";

import {
  assertMembershipModeAlignment,
  defineServerConfig,
  type MembershipAdapter,
} from "@pgpz/core/server";
import { referenceSiteConfig } from "./site";

const inertDynamoDBClient = Object.freeze({ mode: "not-connected" });
const inertEmailTransport = Object.freeze({ mode: "disabled" });
const inertAuthAdapter = Object.freeze({ mode: "disabled" });
const inertStorageClient = Object.freeze({ mode: "not-connected" });

export const externalDemoMembershipAdapter: MembershipAdapter = {
  mode: "externally-managed",
  async resolve(subject) {
    const active = subject.attributes?.referenceMembership === "active";
    return {
      active,
      reason: active
        ? "Synthetic external membership attribute accepted."
        : "No external demo membership was supplied.",
      attributes: { source: "reference-fixture" },
    };
  },
};

export type ReferenceEnvironment = Readonly<Record<string, string | undefined>>;

function commaSeparatedOrigins(value: string | undefined, fallback: string) {
  const origins = value
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return origins?.length ? origins : [fallback];
}

export function createReferenceServerConfig(env: ReferenceEnvironment = process.env) {
  const deploymentMode = env.REFERENCE_DEPLOYMENT_MODE || "demo";
  if (deploymentMode !== "demo") {
    throw new Error("PGPZ Reference supports only REFERENCE_DEPLOYMENT_MODE=demo.");
  }
  const emailDeliveryMode = env.EMAIL_DELIVERY_MODE || "disabled";
  if (emailDeliveryMode !== "disabled") {
    throw new Error("PGPZ Reference requires EMAIL_DELIVERY_MODE=disabled.");
  }

  const baseUrl = env.BETTER_AUTH_URL || env.NEXT_PUBLIC_SITE_URL || referenceSiteConfig.canonicalUrl;
  const config = defineServerConfig({
    dynamodb: {
      client: inertDynamoDBClient,
      tableName: env.DYNAMODB_TABLE || "PGPZReferenceLocal",
      partitions: {
        zecShelf: env.ZEC_SHELF_PARTITION_KEY || "REFERENCE#ZEC_SHELF",
      },
    },
    email: {
      transport: inertEmailTransport,
      from: env.EMAIL_FROM || "PGPZ Reference <reference@pgpz.org>",
    },
    auth: {
      adapter: inertAuthAdapter,
      secret: env.BETTER_AUTH_SECRET || "reference-demo-secret-never-use-in-production-0001",
      baseUrl,
      trustedOrigins: commaSeparatedOrigins(env.BETTER_AUTH_TRUSTED_ORIGINS, new URL(baseUrl).origin),
    },
    storage: {
      client: inertStorageClient,
      bucket: "reference-storage-disabled",
      prefix: "reference",
    },
    membership: {
      adapter: externalDemoMembershipAdapter,
    },
  });

  assertMembershipModeAlignment(referenceSiteConfig, config);
  return config;
}
