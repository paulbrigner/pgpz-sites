import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const applicationFor = (projectName: string) =>
  projectName.startsWith("community")
    ? { siteName: "PGPZ Community", joinLabel: "Join" }
    : { siteName: "PGPZ Coalition", joinLabel: "Request Access" };

test("public pages include the server-rendered application shell", async ({ request }, testInfo) => {
  const application = applicationFor(testInfo.project.name);
  const response = await request.get("/terms");

  expect(response.ok()).toBe(true);
  const html = await response.text();
  expect(html).toContain(application.siteName);
  expect(html).toContain("Terms of Service");
  expect(html).toContain("<main");
});

test("anonymous visitors see the sign-in gate on protected admin routes", async ({ page }) => {
  await page.goto("/admin");

  await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
  const signupHref = await page.getByRole("link", { name: /^New to the / }).getAttribute("href");

  expect(signupHref).not.toBeNull();
  const signupUrl = new URL(signupHref!, page.url());
  expect(signupUrl.pathname).toBe("/signin");
  expect(signupUrl.searchParams.get("callbackUrl")).toBe("/admin");
  expect(signupUrl.searchParams.get("reason")).toBe("signup");
});

test("mobile navigation exposes the anonymous critical paths", async ({ page }, testInfo) => {
  const application = applicationFor(testInfo.project.name);
  await page.goto("/terms");

  await page.getByRole("button", { name: "Open navigation menu" }).click();
  const menu = page.locator("#main-nav-mobile-menu");
  await expect(menu.getByRole("link", { name: "Home", exact: true })).toBeVisible();
  await expect(menu.getByRole("link", { name: application.joinLabel, exact: true })).toBeVisible();
  await expect(menu.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
});

test("public legal page has no serious or critical axe violations", async ({ page }) => {
  await page.goto("/terms");

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const severeViolations = results.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical",
  );

  expect(
    severeViolations,
    severeViolations
      .map((violation) => `${violation.id}: ${violation.help} (${violation.nodes.length} nodes)`)
      .join("\n"),
  ).toEqual([]);
});
