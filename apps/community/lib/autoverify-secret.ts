import { timingSafeEqual } from "node:crypto";
import { resolveSigningSecret } from "@pgpz/core";

export function resolveAutoverifySecrets({
  currentSecret,
  previousSecret,
  nodeEnv,
}: {
  currentSecret?: string | null;
  previousSecret?: string | null;
  nodeEnv?: string | null;
}) {
  const current = resolveSigningSecret({
    name: "SOCIAL_PROOF_AUTOVERIFY_SECRET",
    value: currentSecret,
    nodeEnv,
  });
  const previous = resolveSigningSecret({
    name: "SOCIAL_PROOF_AUTOVERIFY_SECRET_PREVIOUS",
    value: previousSecret,
    nodeEnv,
    requiredInProduction: false,
  });
  if (current && previous === current) {
    throw new Error(
      "SOCIAL_PROOF_AUTOVERIFY_SECRET_PREVIOUS must differ from SOCIAL_PROOF_AUTOVERIFY_SECRET",
    );
  }
  return { current, previous };
}

function secretsMatch(actual: string, expected: string) {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes);
}

export function isAutoverifySecretAuthorized({
  suppliedSecret,
  currentSecret,
  previousSecret,
}: {
  suppliedSecret?: string | null;
  currentSecret?: string | null;
  previousSecret?: string | null;
}) {
  if (!suppliedSecret || !currentSecret) return false;
  return [currentSecret, previousSecret]
    .filter((secret): secret is string => !!secret)
    .some((secret) => secretsMatch(suppliedSecret, secret));
}
