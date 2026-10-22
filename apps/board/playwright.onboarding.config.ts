import { defineConfig, devices } from "@playwright/test";

function localUrl(name: string, fallback: string) {
  const value = process.env[name] || fallback;
  const url = new URL(value);
  if (url.protocol !== "http:" || !(url.hostname === "127.0.0.1" || name === "BOARD_ONBOARDING_BASE_URL" && url.hostname === "localhost") || url.username || url.password) {
    throw new Error(`${name} must use an explicit loopback HTTP endpoint.`);
  }
  return url.origin;
}

// WebAuthn RP IDs must be domain names; localhost is a secure-context exception.
const baseURL = localUrl("BOARD_ONBOARDING_BASE_URL", "http://localhost:3303");
const dynamoURL = localUrl("BOARD_ONBOARDING_DYNAMODB", "http://127.0.0.1:58000");
const mailURL = localUrl("BOARD_ONBOARDING_MAILHOG", "http://127.0.0.1:58025");
const table = process.env.BOARD_ONBOARDING_TABLE || `PGPZBoardOnboardingTest${Date.now()}`;
if (!/^PGPZBoardOnboardingTest\d+$/.test(table)) throw new Error("Only disposable onboarding test tables are permitted.");
Object.assign(process.env, { BOARD_ONBOARDING_TABLE: table, BOARD_ONBOARDING_DYNAMODB: dynamoURL, BOARD_ONBOARDING_MAILHOG: mailURL });

export default defineConfig({
  testDir: "./e2e",
  testMatch: "onboarding.spec.ts",
  workers: 1,
  timeout: 90_000,
  outputDir: "../../output/playwright/board-onboarding",
  reporter: "list",
  use: { ...devices["Desktop Chrome"], baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${new URL(baseURL).port}`,
    url: `${baseURL}/signin`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      AWS_ACCESS_KEY_ID: "onboardingtestonly", AWS_SECRET_ACCESS_KEY: "onboardingtestonly",
      AWS_EC2_METADATA_DISABLED: "true", AWS_PROFILE: "", AWS_ENDPOINT_URL_DYNAMODB: dynamoURL,
      REGION_AWS: "us-east-1", NEXTAUTH_TABLE: table, BOARD_AUDIT_TABLE: `${table}Audit`,
      BOARD_ACCESS_REGISTRY_ENABLED: "false", BOARD_MEMBER_EMAILS: "director@example.test", BOARD_ADMIN_EMAILS: "",
      BOARD_EXECUTIVE_DIRECTOR_EMAILS: "", BOARD_LEGAL_COUNSEL_EMAILS: "",
      BOARD_PASSWORDLESS_AUTH_ENABLED: "true", BOARD_PASSWORD_AUTH_ENABLED: "false",
      BETTER_AUTH_SECRET: "local-onboarding-test-secret-at-least-32-characters",
      BETTER_AUTH_URL: baseURL, NEXT_PUBLIC_SITE_URL: baseURL, BETTER_AUTH_TRUSTED_ORIGINS: baseURL,
      EMAIL_TRANSPORT: "smtp", EMAIL_SERVER_HOST: "127.0.0.1", EMAIL_SERVER_PORT: "51025",
      EMAIL_SERVER_SECURE: "false", EMAIL_FROM: "Board Test <board@example.test>",
      EMAIL_SERVER_USER: "", EMAIL_SERVER_PASSWORD: "",
    },
  },
});
