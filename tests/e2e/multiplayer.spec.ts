import { expect, test, type Browser, type Page } from "@playwright/test";

/** A player in their own browser context, recording every frame the server sends them. */
async function player(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const frames: string[] = [];
  const errors: string[] = [];
  page.on("websocket", (socket) => {
    socket.on("framereceived", ({ payload }) => frames.push(String(payload)));
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return { context, page, frames, errors };
}

/** Resolves once at least `minMs` and at least one animation frame have passed in the page. */
function settle(page: Page, minMs: number): Promise<void> {
  return page.evaluate(
    (ms) =>
      new Promise<void>((resolve) => {
        const start = performance.now();
        const tick = () => (performance.now() - start >= ms ? resolve() : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      }),
    minMs,
  );
}

/**
 * Walks in short taps until the hint satisfies `done`. On a slow machine,
 * holding a key and reacting to the hint can overshoot a control; a tap moves
 * well under the length of path along which each control stays in reach, and
 * the avatar is standing still whenever the hint is checked.
 */
async function stepUntil(page: Page, key: string, done: (hint: string) => boolean): Promise<void> {
  const hint = page.locator("#interaction-hint");
  for (let step = 0; step < 100; step += 1) {
    if (done(await hint.innerText())) return;
    await page.keyboard.down(key);
    await settle(page, 80);
    await page.keyboard.up(key);
    await settle(page, 0);
    await settle(page, 0);
  }
  throw new Error(`Walking ${key} never satisfied the hint condition`);
}

const names = (control: string) => (hint: string) => hint.includes(`use the ${control}`);

async function use(page: Page, control: string, times = 1): Promise<void> {
  await expect(page.locator("#interaction-hint")).toContainText(`use the ${control}`);
  for (let i = 0; i < times; i += 1) await page.keyboard.press("e");
}

test("two independent browsers share a room and see each other's effects, never each other's controls", async ({ browser }) => {
  // One long scenario across three browser contexts.
  test.setTimeout(120_000);
  const a = await player(browser);
  const b = await player(browser);

  await a.page.goto("/");
  await a.page.getByRole("button", { name: "Create a room" }).click();
  await expect(a.page.getByText("You are in the western clearing (A).")).toBeVisible();
  await expect(a.page.getByRole("status")).toContainText("Waiting for your partner");
  const invite = await a.page.locator("#invite-link").inputValue();
  expect(invite).toMatch(/\?room=[23456789A-HJKMNP-Z]{6}$/);

  await b.page.goto(invite);
  await expect(b.page.getByText("You are in the eastern clearing (B).")).toBeVisible();
  await expect(a.page.getByRole("status")).toContainText("Your partner is here");
  await expect(b.page.getByRole("status")).toContainText("Your partner is here");

  const panelA = a.page.locator("#dev-panel");
  const panelB = b.page.locator("#dev-panel");
  await expect(panelB).toContainText('"tower":{"orientation":2,"halo":false}');
  await expect(panelA).toContainText('"pool":{"pattern":1}');

  // A turns the wheel and pulls the lever: B's tower turns and glows.
  // Paths: straight down from the spawn point passes the wheel; further down,
  // then right along the bottom edge, passes the lever.
  await stepUntil(a.page, "ArrowDown", names("wheel"));
  await use(a.page, "wheel");
  await expect(panelB).toContainText('"tower":{"orientation":0,"halo":false}');
  await stepUntil(a.page, "ArrowDown", (hint) => !names("wheel")(hint));
  await stepUntil(a.page, "ArrowRight", names("lever"));
  await use(a.page, "lever");
  await expect(panelB).toContainText('"tower":{"orientation":0,"halo":true}');
  await expect(panelA).toContainText('"pool":{"pattern":1}');

  // B refreshes: the same role and the latest observation come back.
  await b.page.reload();
  await expect(b.page.getByText("You are in the eastern clearing (B).")).toBeVisible();
  await expect(panelB).toContainText('"tower":{"orientation":0,"halo":true}');

  // A third browser cannot take a seat.
  const c = await player(browser);
  await c.page.goto(invite);
  await expect(c.page.getByRole("status")).toContainText("already has two players");
  await expect(c.page.getByRole("button", { name: "Create a room" })).toBeVisible();
  await c.context.close();

  // A second tab carrying B's token (as a duplicated tab does) takes the seat over;
  // the first tab keeps the room link, so reloading it takes the seat back.
  const storage = await b.page.evaluate(() => JSON.stringify(sessionStorage));
  const copy = await b.context.newPage();
  await copy.addInitScript((saved) => {
    for (const [key, value] of Object.entries(JSON.parse(saved) as Record<string, string>)) sessionStorage.setItem(key, value);
  }, storage);
  await copy.goto(invite);
  await expect(copy.getByText("You are in the eastern clearing (B).")).toBeVisible();
  await expect(b.page.getByRole("status")).toContainText("opened in another tab");
  expect(b.page.url()).toBe(invite);
  await copy.close();
  await b.page.reload();
  await expect(b.page.getByText("You are in the eastern clearing (B).")).toBeVisible();
  await expect(panelB).toContainText('"tower":{"orientation":0,"halo":true}');

  // B turns the weathervane: A's summer becomes autumn, B's season too, so a
  // flock crosses both clearings. The path runs left from the spawn point.
  await expect(panelA).toContainText('"season":1');
  await stepUntil(b.page, "ArrowLeft", names("weathervane"));
  await use(b.page, "weathervane");
  await expect(panelA).toContainText('"season":2');
  await expect(panelB).toContainText('"season":2');

  // B turns the valve to still A's pool, then presses the button: the finale reaches both.
  await stepUntil(b.page, "ArrowDown", names("valve"));
  await use(b.page, "valve");
  await expect(panelA).toContainText('"pool":{"pattern":2}');
  await use(b.page, "valve");
  await expect(panelA).toContainText('"pool":{"pattern":0}');
  await stepUntil(b.page, "ArrowDown", (hint) => !names("valve")(hint));
  await stepUntil(b.page, "ArrowRight", names("button"));
  await use(b.page, "button");
  await expect(panelA).toContainText('"finaleComplete":true');
  await expect(panelB).toContainText('"finaleComplete":true');

  // Either player can reset for both.
  await b.page.getByRole("button", { name: "Reset" }).click();
  await expect(panelA).toContainText('"pool":{"pattern":1}');
  await expect(panelA).toContainText('"finaleComplete":false');
  await expect(panelB).toContainText('"tower":{"orientation":2,"halo":false}');
  await expect(panelA).toContainText('"season":1');

  // What actually crossed the network: each player's frames name only their own side.
  const fromServerA = a.frames.join("\n");
  const fromServerB = b.frames.join("\n");
  expect(fromServerA).toContain("world:update");
  expect(fromServerB).toContain("world:update");
  expect(fromServerA).toContain('"kind":"pulse"');
  expect(fromServerA).toContain('"relation":"same"');
  expect(fromServerB).toContain('"relation":"same"');
  expect(fromServerA).not.toMatch(/valve|button|tower|weathervane/);
  expect(fromServerB).not.toMatch(/wheel|lever|pool|beacon|sundial/);

  expect([...a.errors, ...b.errors, ...c.errors]).toEqual([]);
  await Promise.all([a.context.close(), b.context.close()]);
});

test("one key press turns a control once, however the key is held or typed", async ({ browser }) => {
  const a = await player(browser);
  let sent = 0;
  a.page.on("websocket", (socket) => {
    socket.on("framesent", ({ payload }) => {
      if (String(payload).includes("control:act")) sent += 1;
    });
  });
  await a.page.goto("/");
  await a.page.getByRole("button", { name: "Create a room" }).click();
  await expect(a.page.getByText("You are in the western clearing (A).")).toBeVisible();
  const panel = a.page.locator("#dev-panel");
  await stepUntil(a.page, "ArrowDown", names("wheel"));

  // Holding E: one press followed by auto-repeated keydowns.
  await a.page.keyboard.down("e");
  for (let i = 0; i < 6; i += 1) await a.page.keyboard.down("e");
  await a.page.keyboard.up("e");
  await expect(panel).toContainText('"wheel":{"kind":"detent","position":1');

  // Quick presses back to back, several within one frame: one turn each.
  for (let i = 0; i < 4; i += 1) await a.page.keyboard.press("e");
  await expect(panel).toContainText('"wheel":{"kind":"detent","position":2');

  // Typing into the invite link field is not game input.
  await a.page.locator("#invite-link").focus();
  await a.page.keyboard.press("e");
  await a.page.keyboard.press(" ");
  await settle(a.page, 300);
  expect(sent).toBe(5);
  await expect(panel).toContainText('"wheel":{"kind":"detent","position":2');
  expect(a.errors).toEqual([]);
  await a.context.close();
});
