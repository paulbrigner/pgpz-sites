import { defineConfig, devices } from "@playwright/test";

const host = "127.0.0.1";
const communityPort = 3201;
const coalitionPort = 3202;

const applicationEnvironment = (baseUrl: string) => ({
  AWS_ACCESS_KEY_ID: "e2e-only-access-key",
  AWS_EC2_METADATA_DISABLED: "true",
  AWS_REGION: "us-east-1",
  AWS_SECRET_ACCESS_KEY: "e2e-only-secret-key",
  BACKGROUND_JOBS_ENABLED: "false",
  BETTER_AUTH_SECRET: "e2e-only-better-auth-secret-at-least-32-characters",
  BETTER_AUTH_TRUSTED_ORIGINS: baseUrl,
  BETTER_AUTH_URL: baseUrl,
  EMAIL_FROM: "PGPZ E2E <e2e@example.invalid>",
  EMAIL_TRACKING_SECRET: "e2e-only-email-tracking-secret-at-least-32-characters",
  EMAIL_TRANSPORT: "ses",
  NEXTAUTH_TABLE: "PGPZE2EAuth",
  NEXT_PUBLIC_SITE_URL: baseUrl,
  REGION_AWS: "us-east-1",
  SOCIAL_PROOF_AUTOVERIFY_SECRET: "e2e-only-social-proof-secret-at-least-32-characters",
  X_BEARER_TOKEN: "e2e-only-x-token",
});

const communityBaseUrl = `http://${host}:${communityPort}`;
const coalitionBaseUrl = `http://${host}:${coalitionPort}`;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "output/playwright/test-results",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: "output/playwright/report", open: "never" }],
  ],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: `npm run dev --workspace=apps/community -- --hostname ${host} --port ${communityPort}`,
      url: `${communityBaseUrl}/terms`,
      env: applicationEnvironment(communityBaseUrl),
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `npm run dev --workspace=apps/coalition -- --hostname ${host} --port ${coalitionPort}`,
      url: `${coalitionBaseUrl}/terms`,
      env: applicationEnvironment(coalitionBaseUrl),
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: "community-mobile",
      use: { ...devices["Pixel 7"], baseURL: communityBaseUrl },
    },
    {
      name: "coalition-mobile",
      use: { ...devices["Pixel 7"], baseURL: coalitionBaseUrl },
    },
  ],
});
