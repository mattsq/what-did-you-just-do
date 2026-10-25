import { expect, test } from "@playwright/test";

test("client boots Phaser and connects to the Node server", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "What Did You Just Do?" })).toBeVisible();
  await expect(page.locator("#game canvas")).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Server connected");
  await expect(page.getByRole("button", { name: "Create a room" })).toBeVisible();
});
