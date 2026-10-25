import { expect, test, type Page } from "@playwright/test";

/** Holds a movement key until the avatar is next to the named control, then uses it. */
async function walkToAndUse(page: Page, key: string, control: string): Promise<void> {
  const hint = page.locator("#interaction-hint");
  await page.keyboard.down(key);
  await expect(hint).toContainText(`use the ${control}`);
  await page.keyboard.up(key);
  await page.keyboard.press("e");
}

test("each clearing's controls change the other clearing", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("/");
  await expect(page.locator("#game canvas")).toBeVisible();
  const panel = page.locator("#dev-panel");
  await expect(panel).toContainText('Observation B: {"role":"B","revision":0');
  await expect(panel).toContainText('"tower":{"orientation":2,"halo":false}');
  await expect(panel).toContainText('"pool":{"pattern":1}');

  // A turns the wheel: B's tower turns; A's own pool does not change.
  await walkToAndUse(page, "ArrowDown", "wheel");
  await expect(panel).toContainText('"tower":{"orientation":0,"halo":false}');
  await expect(panel).toContainText('"pool":{"pattern":1}');
  await expect(panel).toContainText('"wheel":{"kind":"detent","position":1');

  // B turns the valve: A's pool changes pattern.
  await page.getByRole("button", { name: "Eastern clearing (B)" }).click();
  await expect(page.getByRole("button", { name: "Eastern clearing (B)" })).toHaveAttribute("aria-pressed", "true");
  await walkToAndUse(page, "ArrowDown", "valve");
  await expect(panel).toContainText('"pool":{"pattern":2}');

  // Neither projection names the other role's controls.
  const [a, b] = (await panel.innerText()).split("\n");
  expect(a).not.toMatch(/valve|button|tower/);
  expect(b).not.toMatch(/wheel|lever|pool|beacon/);

  await page.getByRole("button", { name: "Reset" }).click();
  await expect(panel).toContainText('"tower":{"orientation":2,"halo":false}');
  await expect(panel).toContainText('"pool":{"pattern":1}');

  expect(errors).toEqual([]);
});
