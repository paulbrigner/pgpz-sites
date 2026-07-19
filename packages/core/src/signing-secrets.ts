export const MINIMUM_PRODUCTION_SIGNING_SECRET_BYTES = 32;

export type SigningSecretOptions = Readonly<{
  name: string;
  value?: string | null;
  nodeEnv?: string | null;
  requiredInProduction?: boolean;
}>;

/**
 * Normalizes a signing secret while failing closed for missing or undersized
 * production values. Development and test retain their existing permissive
 * behavior so local fixtures do not need production credentials.
 */
export function resolveSigningSecret({
  name,
  value,
  nodeEnv,
  requiredInProduction = true,
}: SigningSecretOptions) {
  const configured = value?.trim() || null;

  if (nodeEnv !== "production") return configured;

  if (!configured) {
    if (requiredInProduction) throw new Error(`${name} is required in production`);
    return null;
  }

  if (Buffer.byteLength(configured, "utf8") < MINIMUM_PRODUCTION_SIGNING_SECRET_BYTES) {
    throw new Error(
      `${name} must contain at least ${MINIMUM_PRODUCTION_SIGNING_SECRET_BYTES} bytes in production`,
    );
  }

  return configured;
}
