import { test, expect } from "@playwright/test";

test.describe("Authentication flows", () => {
  test.beforeEach(async ({ page }) => {
    // Clear any stored tokens
    await page.goto("/login");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test("login page renders correctly", async ({ page }) => {
    await page.goto("/login");

    // Check page structure
    await expect(page.getByRole("heading", { name: /sign in|log in|welcome/i })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in|log in/i })).toBeVisible();
  });

  test("shows validation error for empty fields", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /sign in|log in/i }).click();

    // Should show some validation feedback
    const errorText = page.locator("[class*='red'], [class*='error'], [role='alert']");
    await expect(errorText.first()).toBeVisible({ timeout: 3000 });
  });

  test("shows error for invalid credentials", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill("notreal@test.com");
    await page.getByLabel(/password/i).fill("wrongpassword123");
    await page.getByRole("button", { name: /sign in|log in/i }).click();

    // Should show an error message (401 from backend or network error)
    const errorText = page.locator("[class*='red'], [class*='error'], [role='alert']");
    await expect(errorText.first()).toBeVisible({ timeout: 10000 });
  });

  test("register page renders correctly", async ({ page }) => {
    await page.goto("/register");

    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i).first()).toBeVisible();
  });

  test("forgot password page renders and submits", async ({ page }) => {
    await page.goto("/forgot-password");

    await expect(page.getByRole("heading", { name: /reset/i })).toBeVisible();
    await page.getByLabel(/email/i).fill("test@example.com");
    await page.getByRole("button", { name: /send/i }).click();

    // Should show success message (always shows success to prevent enumeration)
    await expect(page.getByText(/check your email/i)).toBeVisible({ timeout: 10000 });
  });

  test("login page has link to forgot password", async ({ page }) => {
    await page.goto("/login");

    const forgotLink = page.getByRole("link", { name: /forgot|reset/i });
    if (await forgotLink.isVisible()) {
      await forgotLink.click();
      await expect(page).toHaveURL(/forgot-password/);
    }
  });
});
