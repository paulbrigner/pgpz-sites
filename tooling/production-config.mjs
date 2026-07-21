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
  validateSigningSecret(environment, "BACKGROUND_JOBS_INTERNAL_SECRET", issues);

  if (!new Set(["true", "false"]).has(environment.BACKGROUND_JOBS_ENABLED?.trim().toLowerCase())) {
    issues.push("BACKGROUND_JOBS_ENABLED must be true or false");
  }
  if (!environment.BACKGROUND_JOBS_TABLE?.trim()) {
    issues.push("BACKGROUND_JOBS_TABLE is required");
  }
  if (!/^https:\/\/sqs\.[a-z0-9-]+\.amazonaws\.com\//.test(environment.BACKGROUND_JOBS_QUEUE_URL?.trim() || "")) {
    issues.push("BACKGROUND_JOBS_QUEUE_URL must be an AWS SQS queue URL");
  }
  const smokeAllowlist = new Set(
    (environment.BACKGROUND_JOB_SMOKE_ALLOWLIST || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  const expectedSmokeRecipients = ["paul@paulbrigner.com", "div@accrediv.com"];
  if (
    smokeAllowlist.size !== expectedSmokeRecipients.length ||
    expectedSmokeRecipients.some((email) => !smokeAllowlist.has(email))
  ) {
    issues.push("BACKGROUND_JOB_SMOKE_ALLOWLIST must contain only Paul and Div");
  }

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

    const xMonitorFlag = environment.NEXT_PUBLIC_XMONITOR_ENABLED?.trim().toLowerCase();
    if (xMonitorFlag && !new Set(["true", "false"]).has(xMonitorFlag)) {
      issues.push("NEXT_PUBLIC_XMONITOR_ENABLED must be true or false");
    }
    if (xMonitorFlag === "true") {
      let readApiUrl;
      try {
        readApiUrl = new URL(environment.XMONITOR_READ_API_BASE_URL?.trim() || "");
      } catch {
        readApiUrl = null;
      }
      if (
        !readApiUrl ||
        readApiUrl.protocol !== "https:" ||
        readApiUrl.username ||
        readApiUrl.password ||
        readApiUrl.search ||
        readApiUrl.hash
      ) {
        issues.push("XMONITOR_READ_API_BASE_URL must be a credential-free HTTPS URL");
      }
      if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(environment.XMONITOR_READ_CLIENT_ID?.trim() || "")) {
        issues.push("XMONITOR_READ_CLIENT_ID is invalid");
      }
      validateSigningSecret(environment, "XMONITOR_READ_CLIENT_SECRET", issues);
      const configuredTimeout = environment.XMONITOR_READ_TIMEOUT_MS?.trim();
      if (configuredTimeout) {
        const timeout = Number(configuredTimeout);
        if (!Number.isInteger(timeout) || timeout < 1_000 || timeout > 30_000) {
          issues.push("XMONITOR_READ_TIMEOUT_MS must be an integer from 1000 to 30000");
        }
      }
    }
    const briefingsFlag = environment.NEXT_PUBLIC_XMONITOR_BRIEFINGS_ENABLED?.trim().toLowerCase();
    if (briefingsFlag && !new Set(["true", "false"]).has(briefingsFlag)) {
      issues.push("NEXT_PUBLIC_XMONITOR_BRIEFINGS_ENABLED must be true or false");
    }
    if (briefingsFlag === "true") {
      if (xMonitorFlag !== "true") {
        issues.push("NEXT_PUBLIC_XMONITOR_BRIEFINGS_ENABLED requires NEXT_PUBLIC_XMONITOR_ENABLED");
      }
      const adminClientId = environment.XMONITOR_BRIEFINGS_ADMIN_CLIENT_ID?.trim() || "";
      if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(adminClientId)) {
        issues.push("XMONITOR_BRIEFINGS_ADMIN_CLIENT_ID is invalid");
      }
      if (adminClientId && adminClientId === environment.XMONITOR_READ_CLIENT_ID?.trim()) {
        issues.push("XMONITOR_BRIEFINGS_ADMIN_CLIENT_ID must differ from XMONITOR_READ_CLIENT_ID");
      }
      const adminSecret = validateSigningSecret(
        environment,
        "XMONITOR_BRIEFINGS_ADMIN_CLIENT_SECRET",
        issues,
      );
      if (adminSecret && adminSecret === environment.XMONITOR_READ_CLIENT_SECRET?.trim()) {
        issues.push("XMONITOR_BRIEFINGS_ADMIN_CLIENT_SECRET must differ from XMONITOR_READ_CLIENT_SECRET");
      }
      const configuredAdminTimeout = environment.XMONITOR_BRIEFINGS_ADMIN_TIMEOUT_MS?.trim();
      if (configuredAdminTimeout) {
        const timeout = Number(configuredAdminTimeout);
        if (!Number.isInteger(timeout) || timeout < 1_000 || timeout > 30_000) {
          issues.push("XMONITOR_BRIEFINGS_ADMIN_TIMEOUT_MS must be an integer from 1000 to 30000");
        }
      }
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
