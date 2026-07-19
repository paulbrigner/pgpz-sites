export const MINIMUM_PRODUCTION_SIGNING_SECRET_BYTES = 32;

function validateSigningSecret(environment, name, issues, { required = true } = {}) {
  const configured = environment[name]?.trim();
  if (!configured) {
    if (required) issues.push(`${name} is required`);
    return null;
  }
  if (Buffer.byteLength(configured, "utf8") < MINIMUM_PRODUCTION_SIGNING_SECRET_BYTES) {
    issues.push(
      `${name} must contain at least ${MINIMUM_PRODUCTION_SIGNING_SECRET_BYTES} bytes`,
    );
  }
  return configured;
}

export function validateBrandedProductionEnvironment(
  environment,
  { applicationName } = {},
) {
  const issues = [];
  const trackingSecret = validateSigningSecret(
    environment,
    "EMAIL_TRACKING_SECRET",
    issues,
  );
  const previousTrackingSecret = validateSigningSecret(
    environment,
    "EMAIL_TRACKING_SECRET_PREVIOUS",
    issues,
    { required: false },
  );
  validateSigningSecret(environment, "BETTER_AUTH_SECRET", issues);

  if (applicationName === "community") {
    const autoverifySecret = validateSigningSecret(
      environment,
      "SOCIAL_PROOF_AUTOVERIFY_SECRET",
      issues,
    );
    const previousAutoverifySecret = validateSigningSecret(
      environment,
      "SOCIAL_PROOF_AUTOVERIFY_SECRET_PREVIOUS",
      issues,
      { required: false },
    );
    if (autoverifySecret && previousAutoverifySecret === autoverifySecret) {
      issues.push(
        "SOCIAL_PROOF_AUTOVERIFY_SECRET_PREVIOUS must differ from SOCIAL_PROOF_AUTOVERIFY_SECRET",
      );
    }
  }

  if (trackingSecret && previousTrackingSecret === trackingSecret) {
    issues.push(
      "EMAIL_TRACKING_SECRET_PREVIOUS must differ from EMAIL_TRACKING_SECRET",
    );
  }
  if (environment.EMAIL_TRANSPORT?.trim().toLowerCase() !== "ses") {
    issues.push("EMAIL_TRANSPORT must be ses for a production branded application");
  }

  if (issues.length > 0) {
    throw new Error(`Production environment validation failed:\n- ${issues.join("\n- ")}`);
  }
}
