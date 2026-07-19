import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  MINIMUM_PRODUCTION_SIGNING_SECRET_BYTES,
  validateBrandedProductionEnvironment,
} from "./production-config.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const validEnvironment = () => ({
  EMAIL_TRACKING_SECRET: "e".repeat(64),
  BETTER_AUTH_SECRET: "b".repeat(64),
  EMAIL_TRANSPORT: "ses",
});

test("accepts the current 64-character production secret shape", () => {
  assert.doesNotThrow(() =>
    validateBrandedProductionEnvironment(validEnvironment(), {
      applicationName: "coalition",
    }),
  );
});

test("rejects missing or undersized production signing secrets", () => {
  assert.throws(
    () =>
      validateBrandedProductionEnvironment(
        {
          ...validEnvironment(),
          EMAIL_TRACKING_SECRET: "x".repeat(
            MINIMUM_PRODUCTION_SIGNING_SECRET_BYTES - 1,
          ),
          BETTER_AUTH_SECRET: "",
        },
        { applicationName: "coalition" },
      ),
    /EMAIL_TRACKING_SECRET must contain at least 32 bytes[\s\S]*BETTER_AUTH_SECRET is required/,
  );
});

test("validates the optional previous key and refuses a duplicate", () => {
  assert.throws(
    () =>
      validateBrandedProductionEnvironment(
        {
          ...validEnvironment(),
          EMAIL_TRACKING_SECRET_PREVIOUS: "weak",
        },
        { applicationName: "coalition" },
      ),
    /EMAIL_TRACKING_SECRET_PREVIOUS must contain at least 32 bytes/,
  );
  const same = validEnvironment();
  assert.throws(
    () =>
      validateBrandedProductionEnvironment(
        {
          ...same,
          EMAIL_TRACKING_SECRET_PREVIOUS: same.EMAIL_TRACKING_SECRET,
        },
        { applicationName: "coalition" },
      ),
    /must differ/,
  );
});

test("requires the SES transport for production branded builds", () => {
  assert.throws(
    () =>
      validateBrandedProductionEnvironment(
        {
          ...validEnvironment(),
          EMAIL_TRANSPORT: "smtp",
        },
        { applicationName: "coalition" },
      ),
    /EMAIL_TRANSPORT must be ses/,
  );
});

test("requires strong distinct Community autoverify rotation keys", () => {
  const environment = {
    ...validEnvironment(),
    SOCIAL_PROOF_AUTOVERIFY_SECRET: "a".repeat(64),
  };
  assert.doesNotThrow(() =>
    validateBrandedProductionEnvironment(environment, {
      applicationName: "community",
    }),
  );
  assert.throws(
    () =>
      validateBrandedProductionEnvironment(
        {
          ...environment,
          SOCIAL_PROOF_AUTOVERIFY_SECRET_PREVIOUS: "weak",
        },
        { applicationName: "community" },
      ),
    /SOCIAL_PROOF_AUTOVERIFY_SECRET_PREVIOUS must contain at least 32 bytes/,
  );
  assert.throws(
    () =>
      validateBrandedProductionEnvironment(
        {
          ...environment,
          SOCIAL_PROOF_AUTOVERIFY_SECRET_PREVIOUS:
            environment.SOCIAL_PROOF_AUTOVERIFY_SECRET,
        },
        { applicationName: "community" },
      ),
    /must differ/,
  );
});

test("keeps long-lived AWS, SMTP, and NextAuth credentials out of production serialization", () => {
  const productionSerializers = [
    "tooling/write-amplify-env.mjs",
    "apps/community/amplify.yml",
    "apps/coalition/amplify.yml",
  ].map((path) => readFileSync(resolve(repositoryRoot, path), "utf8"));
  for (const source of productionSerializers) {
    for (const prohibited of [
      "PGPZ_AWS_ACCESS_KEY_ID",
      "PGPZ_AWS_SECRET_ACCESS_KEY",
      "NEXTAUTH_SECRET",
      "NEXTAUTH_URL",
      "EMAIL_SERVER_PASSWORD",
      "EMAIL_SERVER_USER",
    ]) {
      assert.ok(!source.includes(prohibited), `${prohibited} must not be serialized`);
    }
  }
});

test("keeps explicit credentials out of branded AWS runtime clients", () => {
  for (const applicationName of ["community", "coalition"]) {
    for (const path of ["lib/dynamodb.ts", "lib/s3.ts", "lib/aws-runtime.ts"]) {
      const source = readFileSync(
        resolve(repositoryRoot, "apps", applicationName, path),
        "utf8",
      );
      assert.ok(!source.includes("PGPZ_AWS_"));
      assert.ok(!source.includes("credentials:"));
    }
  }
});

test("direct Amplify builds enforce distinct rotation keys before serialization", () => {
  const community = readFileSync(
    resolve(repositoryRoot, "apps/community/amplify.yml"),
    "utf8",
  );
  const coalition = readFileSync(
    resolve(repositoryRoot, "apps/coalition/amplify.yml"),
    "utf8",
  );
  for (const source of [community, coalition]) {
    assert.match(
      source,
      /EMAIL_TRACKING_SECRET_PREVIOUS\}" != "\$\{EMAIL_TRACKING_SECRET\}/,
    );
  }
  assert.match(
    community,
    /SOCIAL_PROOF_AUTOVERIFY_SECRET_PREVIOUS\}" != "\$\{SOCIAL_PROOF_AUTOVERIFY_SECRET\}/,
  );
});

test("all branded production mail routes use the shared SES-aware transport", () => {
  const coalitionResourceShare = readFileSync(
    resolve(repositoryRoot, "apps/coalition/app/api/resources/share/route.ts"),
    "utf8",
  );
  assert.match(
    coalitionResourceShare,
    /import \{ buildEmailServerConfig \} from "@\/lib\/admin\/email-transport"/,
  );
  assert.doesNotMatch(coalitionResourceShare, /EMAIL_SERVER_(?:HOST|USER|PASSWORD)/);
});
