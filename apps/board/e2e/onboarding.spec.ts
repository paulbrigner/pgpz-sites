import { expect, test } from "@playwright/test";
import { CreateTableCommand, DeleteTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

const endpoint = process.env.BOARD_ONBOARDING_DYNAMODB!;
const mailEndpoint = process.env.BOARD_ONBOARDING_MAILHOG!;
const table = process.env.BOARD_ONBOARDING_TABLE!;
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(endpoint || "") || !/^http:\/\/127\.0\.0\.1:\d+$/.test(mailEndpoint || "") || !/^PGPZBoardOnboardingTest\d+$/.test(table || "")) {
  throw new Error("Run with playwright.onboarding.config.ts and isolated local services only.");
}
const raw = new DynamoDBClient({ endpoint, region: "us-east-1", credentials: { accessKeyId: "onboardingtestonly", secretAccessKey: "onboardingtestonly" } });
const db = DynamoDBDocumentClient.from(raw);
const email = "director@example.test";
const userId = "onboarding-test-director";
const createdTables: string[] = [];

test.beforeAll(async () => {
  for (const name of [table, `${table}Audit`]) {
    const authTable = name === table;
    await raw.send(new CreateTableCommand({
      TableName: name, BillingMode: "PAY_PER_REQUEST",
      AttributeDefinitions: ["pk", "sk", ...(authTable ? ["GSI1PK", "GSI1SK", "GSI2PK", "GSI2SK"] : [])].map((AttributeName) => ({ AttributeName, AttributeType: "S" })),
      KeySchema: [{ AttributeName: "pk", KeyType: "HASH" }, { AttributeName: "sk", KeyType: "RANGE" }],
      ...(authTable ? { GlobalSecondaryIndexes: ["GSI1", "GSI2"].map((IndexName) => ({ IndexName, KeySchema: [{ AttributeName: `${IndexName}PK`, KeyType: "HASH" as const }, { AttributeName: `${IndexName}SK`, KeyType: "RANGE" as const }], Projection: { ProjectionType: "ALL" as const } })) } : {}),
    }));
    createdTables.push(name);
  }
  const now = new Date().toISOString();
  await db.send(new PutCommand({ TableName: table, Item: {
    pk: `BETTER_AUTH#better_auth_users#${userId}`, sk: `BETTER_AUTH#better_auth_users#${userId}`,
    type: "BETTER_AUTH#better_auth_users", id: userId, email, emailVerified: true,
    name: "Test Director", createdAt: now, updatedAt: now,
    GSI1PK: `BETTER_AUTH#better_auth_users#email#${email}`, GSI1SK: userId,
  } }));
});

test.afterAll(async () => {
  for (const TableName of createdTables) await raw.send(new DeleteTableCommand({ TableName }));
  raw.destroy();
});

test("email preview preserves the link, first-time setup works, and reuse explains recovery", async ({ page, browser, request }) => {
  const sentAfter = Date.now();
  const destination = "/terms?section=access&from=email";
  await page.goto(`/signin?callbackUrl=${encodeURIComponent(destination)}`);
  await page.screenshot({ path: test.info().outputPath("sign-in.png"), fullPage: true });
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("10 minutes");
  let landing = "";
  await expect.poll(async () => {
    const inbox = await (await request.get(`${mailEndpoint}/api/v2/messages`)).json();
    const message = inbox.items.find((item: { Created: string; Content: { Headers: { To: string[]; Subject: string[] } } }) =>
      Date.parse(item.Created) >= sentAfter && item.Content.Headers.To.some((to) => to.includes(email)) && item.Content.Headers.Subject.some((subject) => subject.includes("PGPZ Board")));
    const body = message?.Content.Body.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (_: string, hex: string) => String.fromCharCode(parseInt(hex, 16))) || "";
    landing = body.match(/http:\/\/(?:localhost|127\.0\.0\.1):\d+\/signin\/email-link[^\s<"]+/)?.[0] || "";
    return landing;
  }).not.toBe("");
  landing = landing.replace(/&amp;/g, "&");

  // A mail scanner can GET/HEAD the emailed URL without consuming the token.
  expect((await request.head(landing)).status()).toBe(200);
  const preview = await request.get(landing);
  expect(preview.status()).toBe(200);
  expect(preview.headers()["referrer-policy"]).toBe("no-referrer");
  expect(preview.headers()["cache-control"]).toContain("no-store");
  const sessions = await db.send(new QueryCommand({ TableName: table, IndexName: "GSI2", KeyConditionExpression: "GSI2PK = :pk", ExpressionAttributeValues: { ":pk": `BETTER_AUTH#better_auth_sessions#userId#${userId}` }, Select: "COUNT" }));
  expect(sessions.Count).toBe(0);

  await page.goto(landing);
  await expect(page.locator('a[href*="magic-link/verify"]')).toHaveCount(0);
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/account/security" && url.searchParams.get("callbackUrl") === destination);
  await expect(page.getByRole("heading", { name: "Set up your passkey" })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("first-passkey-setup.png"), fullPage: true });
  // Email verification alone still cannot open private Board content.
  const privatePage = await page.request.get("/terms", { maxRedirects: 0 });
  expect(privatePage.status()).toBe(307);
  expect(privatePage.headers().location).toContain("/account/security");

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await page.getByRole("button", { name: /Create.*passkey|Add passkey/ }).click();
  await expect(page.getByRole("button", { name: "Verify passkey to continue" })).toBeVisible();
  await page.getByRole("button", { name: "Verify passkey to continue" }).click();
  await expect(page).toHaveURL((url) => `${url.pathname}${url.search}` === destination);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Terms");

  const fresh = await browser.newContext();
  try {
    const retry = await fresh.newPage();
    await retry.goto(landing);
    await retry.getByRole("button", { name: /Continue/ }).click();
    await expect(retry).toHaveURL(/\/signin\?.*error=INVALID_TOKEN/);
    await expect(retry.getByRole("alert")).toContainText(/expired|already used|no longer/);
    await expect(retry.locator("[data-safe-callback]")).toHaveAttribute("data-safe-callback", destination);
  } finally { await fresh.close(); }
});
