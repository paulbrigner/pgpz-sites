import { expect, test } from "@playwright/test";

// Markers that only exist inside the authenticated portal payload. Their
// absence from anonymous document and RSC bodies proves the leaf-level
// authorization guard runs before any portal content serializes.
const PORTAL_MARKERS = [
  "Welcome,",
  "Meeting materials",
  "Decisions & resolutions",
  "Administrator controls",
];

test.describe("board portal privacy boundary", () => {
  test("anonymous document requests redirect to sign-in without portal payload", async ({ request }) => {
    for (const path of ["/", "/terms", "/privacy", "/admin"]) {
      const response = await request.get(path, { maxRedirects: 0 });

      expect(response.status(), path).toBe(307);
      const location = response.headers()["location"] || "";
      expect(location, path).toMatch(/^\/signin\?callbackUrl=/);
      expect(decodeURIComponent(location), path).toContain(`callbackUrl=${path}`);

      const body = await response.text();
      for (const marker of PORTAL_MARKERS) {
        expect(body, `${path} leaked ${marker} in an anonymous body`).not.toContain(marker);
      }
    }
  });

  test("anonymous RSC requests never receive the portal payload", async ({ request }) => {
    // This is the exact crafted-request shape from the security scan: a bare
    // cookie-free RSC request. The leaf guard must answer with a redirect
    // (in-flight or 307) and never serialize portal content.
    const response = await request.get("/", {
      headers: {
        RSC: "1",
      },
    });

    const body = await response.text();
    for (const marker of PORTAL_MARKERS) {
      expect(body, `RSC response (${response.status()}) leaked ${marker}`).not.toContain(marker);
    }
    if (response.status() === 200) {
      expect(body, "200 RSC flight must be a redirect action, not content").toContain("NEXT_REDIRECT");
    } else {
      expect(response.status()).toBeGreaterThanOrEqual(300);
    }
  });

  test("privacy pages stay behind the same gate as the dashboard", async ({ request }) => {
    // Page titles legitimately appear in the redirect shell's metadata head;
    // the legal-document body content must not.
    const bodyMarkers = [
      ["/terms", "Confidential materials"],
      ["/privacy", "Rate-limit metadata"],
    ] as const;

    for (const [path, marker] of bodyMarkers) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(307);
      const body = await response.text();
      expect(body, `${path} leaked legal-document content anonymously`).not.toContain(marker);
    }
  });
});

test.describe("board portal sign-in callback validation", () => {
  const cases: Array<[string, string]> = [
    ["callbackUrl=javascript%3Aalert(1)", "/"],
    ["callbackUrl=JAVASCRIPT%3Aalert(1)", "/"],
    ["callbackUrl=data%3Atext%2Fhtml%2Cx", "/"],
    ["callbackUrl=https%3A%2F%2Fevil.example%2Fsteal", "/"],
    ["callbackUrl=%2F%2Fevil.example", "/"],
    ["callbackUrl=%2F%5Cevil.example", "/"],
    ["callbackUrl=%2F%252F%252Fevil.example", "/"],
    ["callbackUrl=mailto%3Adirector%40example.org", "/"],
    ["callbackUrl=%2Fterms", "/terms"],
    ["callbackUrl=%2Fprivacy%3Ftab%3Dnotice", "/privacy?tab=notice"],
    ["callbackUrl=https%3A%2F%2Fboard.pgpz.org%2Fterms", "/"],
  ];

  for (const [query, expected] of cases) {
    test(`resolves ${query} to ${expected}`, async ({ page }) => {
      await page.goto(`/signin?${query}`);

      const signInControls = page.locator("[data-safe-callback]");
      await expect(signInControls).toBeVisible();
      await expect(signInControls).toHaveAttribute("data-safe-callback", expected);
    });
  }

  test("resolves missing callbacks to the dashboard root", async ({ page }) => {
    await page.goto("/signin");

    await expect(page.locator("[data-safe-callback]")).toHaveAttribute("data-safe-callback", "/");
  });
});

test.describe("board portal hardening surface", () => {
  test("private headers and robots are applied", async ({ request }) => {
    const response = await request.get("/signin");
    expect(response.headers()["x-robots-tag"]).toContain("noindex");
    expect(response.headers()["x-frame-options"]).toBe("DENY");
    expect(response.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(response.headers()["referrer-policy"]).toBe("no-referrer");

    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toContain("User-Agent: *");
    expect(robots).toContain("Disallow: /");
  });

  test("anonymous footer offers no links into the protected portal", async ({ page }) => {
    await page.goto("/signin");

    await expect(page.locator("footer")).toContainText("Sign in to access portal terms");
    await expect(page.locator("footer a[href='/terms'], footer a[href='/privacy']")).toHaveCount(0);
  });
});
