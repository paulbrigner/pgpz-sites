import "server-only";

import {
  assertMembershipModeAlignment,
  defineServerConfig,
  type MembershipAdapter,
} from "@pgpz/core/server";
import { resolveSigningSecret } from "@pgpz/core";
import {
  BOARD_CANONICAL_URL,
  boardSiteConfig,
} from "./site";
import { createBoardMembershipAdapter } from "@/lib/membership";
import { createBoardAccessMembershipAdapter } from "@/lib/board-access-membership";
import { documentClient } from "@/lib/dynamodb";

const inertEmailTransport = Object.freeze({ mode: "disabled" });
const inertStorageClient = Object.freeze({ mode: "not-connected" });
const betterAuthAdapter = Object.freeze({
  mode: "better-auth",
  // The real Better Auth instance in lib/auth.ts owns sessions; this slot
  // keeps the shared server contract satisfied without importing it here.
  note: "Board sessions are issued by lib/auth.ts.",
});

export type BoardEnvironment = Readonly<Record<string, string | undefined>>;

function commaSeparatedOrigins(value: string | undefined, fallback: string): string[] {
  const origins = value
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return origins?.length ? origins : [fallback];
}

export function createBoardServerConfig(env: BoardEnvironment = process.env) {
  const secret = resolveSigningSecret({
    name: "BETTER_AUTH_SECRET",
    value: env.BETTER_AUTH_SECRET,
    nodeEnv: process.env.NODE_ENV,
  });
  const tableName = env.NEXTAUTH_TABLE?.trim() || "PGPZBoardNextAuth";
  const baseUrl = env.BETTER_AUTH_URL?.trim() || env.NEXT_PUBLIC_SITE_URL?.trim() || BOARD_CANONICAL_URL;
  const membershipAdapter: MembershipAdapter =
    env.BOARD_ACCESS_REGISTRY_ENABLED?.trim().toLowerCase() === "true"
      ? createBoardAccessMembershipAdapter()
      : createBoardMembershipAdapter(env);

  const config = defineServerConfig({
    dynamodb: {
      client: documentClient,
      tableName,
    },
    email: {
      transport: inertEmailTransport,
      from: env.EMAIL_FROM?.trim() || "PGPZ Board <board@pgpz.org>",
    },
    auth: {
      adapter: betterAuthAdapter,
      secret: secret || "",
      baseUrl,
      trustedOrigins: commaSeparatedOrigins(env.BETTER_AUTH_TRUSTED_ORIGINS, new URL(baseUrl).origin),
    },
    storage: {
      client: inertStorageClient,
      bucket: "board-storage-disabled",
      prefix: "board",
    },
    membership: {
      adapter: membershipAdapter,
    },
  });

  assertMembershipModeAlignment(boardSiteConfig, config);
  return config;
}

// The membership roster is read once per server process from the environment
// allowlist. An empty or missing allowlist locks every account out.
export const boardMembershipAdapter =
  process.env.BOARD_ACCESS_REGISTRY_ENABLED?.trim().toLowerCase() === "true"
    ? createBoardAccessMembershipAdapter()
    : createBoardMembershipAdapter(process.env);
