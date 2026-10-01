import { expect, test } from "@playwright/test";

test("首頁載入", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
