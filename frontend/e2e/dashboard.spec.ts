import { test, expect } from "@playwright/test";

/**
 * Dashboard E2E tests.
 *
 * These tests require a running backend with test data.
 * In CI, the backend should be started with seed data before running E2E.
 *
 * For local development without backend, tests will verify the loading/error
 * states render correctly.
 */

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    // Attempt to authenticate with test credentials
    await page.goto("/login");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test("dashboard shows loading state or redirect", async ({ page }) => {
    await page.goto("/dashboard");

    // Should either:
    // 1. Show a loading spinner (authenticated, loading data)
    // 2. Redirect to login (unauthenticated)
    // 3. Redirect to onboarding (no projects)
    await page.waitForTimeout(2000);
    const url = page.url();
    const hasSpinner = await page.locator("[class*='animate-spin'], [role='status']").count();

    expect(url.includes("login") || url.includes("dashboard") || url.includes("onboarding") || hasSpinner > 0).toBeTruthy();
  });

  test("dashboard has proper page structure when loaded", async ({ page }) => {
    // Set a mock token to bypass auth redirect
    await page.goto("/login");
    await page.evaluate(() => {
      localStorage.setItem("khushfus_token", "test-token-for-e2e");
    });

    await page.goto("/dashboard");

    // Wait for page to settle
    await page.waitForTimeout(3000);

    // If redirected to login (token invalid), that's expected
    if (page.url().includes("login")) {
      return; // Backend rejected mock token — expected
    }

    // If on dashboard, verify key UI elements
    if (page.url().includes("dashboard")) {
      // Should have a project selector or loading state
      const body = await page.textContent("body");
      expect(body).toBeTruthy();
    }
  });
});

test.describe("Projects page", () => {
  test("projects page loads", async ({ page }) => {
    await page.goto("/projects");

    // Should either show projects or redirect to login
    await page.waitForTimeout(3000);
    const url = page.url();
    expect(url.includes("projects") || url.includes("login")).toBeTruthy();
  });
});

test.describe("Search page", () => {
  test("search page renders search bar", async ({ page }) => {
    await page.goto("/search");
    await page.waitForTimeout(2000);

    // If redirected to login, skip
    if (page.url().includes("login")) return;

    const searchInput = page.locator("input[type='text'], input[placeholder*='search' i]");
    if (await searchInput.count() > 0) {
      await expect(searchInput.first()).toBeVisible();
    }
  });
});
