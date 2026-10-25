import { expect, test } from "@playwright/test";

test("the development inspector shows server state and acts, resets, forces the finale and replays", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("/?inspect");
  await page.getByRole("button", { name: "Create a room" }).click();
  const inspector = page.locator("#inspector");
  await expect(inspector).toContainText(/Room [A-Z0-9]{6} · revision 0 · A connected · B absent/);
  // The page keeps inspecting after a reload, but the invite link never carries it.
  await expect(page).toHaveURL(/\?room=[A-Z0-9]{6}&inspect$/);
  await expect(page.locator("#invite-link")).toHaveValue(/\?room=[A-Z0-9]{6}$/);

  const state = inspector.locator("pre").nth(0);
  const observationB = inspector.locator("pre").nth(2);
  await inspector.getByRole("button", { name: "A: wheel +1" }).click();
  await expect(state).toContainText('"wheel": 1');
  // B is not seated, but B's projection is computed all the same.
  await expect(observationB).toContainText('"orientation": 0');

  await inspector.getByRole("button", { name: "B: valve −1" }).click();
  await inspector.getByRole("button", { name: "A: toggle lever" }).click();
  await inspector.getByRole("button", { name: "B: press button" }).click();
  await expect(state).toContainText('"finaleComplete": true');
  const trace = await inspector.locator("textarea").inputValue();
  expect(JSON.parse(trace)).toHaveLength(4);

  await inspector.getByRole("button", { name: "Reset room" }).click();
  await expect(state).toContainText('"finaleComplete": false');
  await inspector.getByRole("button", { name: "Force finale" }).click();
  await expect(state).toContainText('"finaleComplete": true');

  await inspector.locator("textarea").fill(trace);
  await inspector.getByRole("button", { name: "Replay trace" }).click();
  await expect(state).toContainText('"wheel": 1');
  await expect(state).toContainText('"finaleComplete": true');
  await expect(inspector).toContainText("4 trace entries");
  expect(errors).toEqual([]);
});
