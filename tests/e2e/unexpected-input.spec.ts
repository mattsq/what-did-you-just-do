import { expect, test, type Browser, type Page } from "@playwright/test";

// Players doing things the happy path does not: double clicks, keyboard focus
// on page buttons, and fiddling with controls while the finale is playing.

/**
 * A player in their own browser context. Test-only hook: records the Phaser
 * game as `window.__game` so a test can place the avatar next to a control
 * and read what the scene shows, instead of walking there key by key.
 */
async function player(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const sent: string[] = [];
  const received: string[] = [];
  const errors: string[] = [];
  await page.addInitScript(() => {
    type Step = (...args: unknown[]) => unknown;
    type PhaserLike = { Game: { prototype: { step: Step } } };
    let phaser: PhaserLike | undefined;
    Object.defineProperty(window, "Phaser", {
      configurable: true,
      get: () => phaser,
      set: (value: PhaserLike) => {
        phaser = value;
        const step = value.Game.prototype.step;
        value.Game.prototype.step = function (this: unknown, ...args: unknown[]) {
          (window as unknown as { __game: unknown }).__game = this;
          return step.apply(this, args);
        };
      },
    });
  });
  page.on("websocket", (socket) => {
    socket.on("framesent", ({ payload }) => sent.push(String(payload)));
    socket.on("framereceived", ({ payload }) => received.push(String(payload)));
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return { context, page, sent, received, errors };
}

/** Runs `body` with the clearing scene as `s`; the scene's fields are private to TypeScript only. */
function inScene<T>(page: Page, body: string, arg?: unknown): Promise<T> {
  return page.evaluate(
    ([source, value]) => {
      const game = (window as unknown as { __game?: { scene: { getScene(key: string): unknown } } }).__game;
      return new Function("s", "arg", source)(game?.scene.getScene("GameScene"), value) as T;
    },
    [body, arg] as const,
  );
}

/** Where to stand to use each control: just outside it, on its northern side. */
const SPOTS: Readonly<Record<string, readonly [number, number]>> = {
  wheel: [230, 313],
  lever: [390, 397],
  valve: [250, 339],
  button: [430, 404],
  weathervane: [200, 145],
};

async function use(page: Page, control: string, times = 1): Promise<void> {
  await inScene(page, "s.avatar.setPosition(arg[0], arg[1])", SPOTS[control]);
  await expect(page.locator("#interaction-hint")).toContainText(`use the ${control}`);
  for (let i = 0; i < times; i += 1) await page.keyboard.press("e");
}

async function createRoom(page: Page): Promise<string> {
  await page.goto("/");
  await page.getByRole("button", { name: "Create a room" }).click();
  await expect(page.getByText("You are in the western clearing (A).")).toBeVisible();
  return page.locator("#invite-link").inputValue();
}

const actions = (frames: readonly string[]) => frames.filter((frame) => frame.includes("control:act")).length;

test("double-clicking Create a room creates one room", async ({ browser }) => {
  const a = await player(browser);
  await a.page.goto("/");
  await a.page.getByRole("button", { name: "Create a room" }).dblclick();
  await expect(a.page.getByText("You are in the western clearing (A).")).toBeVisible();
  // The world:update that follows room:ready shows the server has answered everything sent so far.
  await expect.poll(() => a.received.filter((frame) => frame.includes("world:update")).length).toBeGreaterThan(0);
  expect(a.sent.filter((frame) => frame.includes("room:create"))).toHaveLength(1);
  expect(a.received.filter((frame) => frame.includes("room:ready"))).toHaveLength(1);
  expect(a.errors).toEqual([]);
  await a.context.close();
});

test("Space presses a focused page button rather than the control in reach", async ({ browser }) => {
  const a = await player(browser);
  await createRoom(a.page);
  const panel = a.page.locator("#dev-panel");
  await inScene(a.page, "s.avatar.setPosition(arg[0], arg[1])", SPOTS.wheel);
  await expect(a.page.locator("#interaction-hint")).toContainText("use the wheel");

  // Keyboard focus on Sound on: Space mutes, and the wheel stays put.
  const mute = a.page.locator("#mute");
  await mute.focus();
  await a.page.keyboard.press(" ");
  await expect(mute).toHaveAttribute("aria-pressed", "true");
  await mute.blur();

  // With no button focused, Space uses the wheel and does not scroll the page.
  await a.page.setViewportSize({ width: 700, height: 400 });
  await a.page.keyboard.press(" ");
  await a.page.keyboard.press("ArrowDown");
  await expect(panel).toContainText('"wheel":{"kind":"detent","position":1');
  expect(await a.page.evaluate(() => scrollY)).toBe(0);
  expect(actions(a.sent)).toBe(1);

  // Keyboard focus on Reset: Space resets, and sends no action.
  await a.page.locator("#reset").focus();
  await a.page.keyboard.press(" ");
  await expect(panel).toContainText('"wheel":{"kind":"detent","position":0');
  expect(actions(a.sent)).toBe(1);
  expect(a.errors).toEqual([]);
  await a.context.close();
});

test("game keys are released for the page once the clearing closes", async ({ browser }) => {
  const a = await player(browser);
  const invite = await createRoom(a.page);
  // Another tab takes the seat over with the same token: this tab returns to the lobby.
  const storage = await a.page.evaluate(() => JSON.stringify(sessionStorage));
  const copy = await a.context.newPage();
  await copy.addInitScript((saved) => {
    for (const [key, value] of Object.entries(JSON.parse(saved) as Record<string, string>)) sessionStorage.setItem(key, value);
  }, storage);
  await copy.goto(invite);
  await expect(a.page.getByRole("status")).toContainText("opened in another tab");

  // Phaser recognises keys by the legacy keyCode, so the events carry one.
  const prevented = await a.page.evaluate(() =>
    ([[" ", 32], ["ArrowDown", 40], ["w", 87]] as const).map(([key, keyCode]) => {
      const event = new KeyboardEvent("keydown", { key, keyCode, bubbles: true, cancelable: true });
      document.body.dispatchEvent(event);
      return event.defaultPrevented;
    }),
  );
  expect(prevented).toEqual([false, false, false]);
  await a.context.close();
});

test("the finale's swell ends at normal size even if players keep using controls", async ({ browser }) => {
  test.setTimeout(60_000);
  const a = await player(browser);
  const b = await player(browser);
  const invite = await createRoom(a.page);
  await b.page.goto(invite);
  await expect(b.page.getByText("You are in the eastern clearing (B).")).toBeVisible();

  // Solve: tower aligned and haloed, both clearings in autumn, pool still.
  await use(a.page, "wheel");
  await use(a.page, "lever");
  await use(b.page, "weathervane");
  await use(b.page, "valve");
  await expect(a.page.locator("#dev-panel")).toContainText('"pool":{"pattern":2}');
  await b.page.keyboard.press("e");
  await expect(a.page.locator("#dev-panel")).toContainText('"pool":{"pattern":0}');

  // The finale, then at once another press and a turn of the wheel.
  await use(b.page, "button");
  await expect(a.page.locator("#dev-panel")).toContainText('"finaleComplete":true');
  await expect.poll(() => inScene<number>(a.page, "return s.beacon.body.scale")).toBeGreaterThan(1);
  await b.page.keyboard.press("e");
  await use(a.page, "wheel");
  await expect(b.page.locator("#dev-panel")).toContainText('"orientation":1');

  const sizes = (page: Page, body: string) => () => inScene<number[]>(page, body);
  await expect.poll(sizes(a.page, "return [s.beacon.body.scale]"), { timeout: 8000 }).toEqual([1]);
  await expect.poll(sizes(b.page, "return [s.tower.base.scale, s.tower.arm.scale]"), { timeout: 8000 }).toEqual([1, 1]);

  // A reset in the middle of a second finale also leaves the tower at normal size.
  await b.page.getByRole("button", { name: "Reset" }).click();
  await expect(b.page.locator("#dev-panel")).toContainText('"finaleComplete":false');
  await use(a.page, "wheel");
  await use(a.page, "lever");
  await use(b.page, "weathervane");
  await use(b.page, "valve", 2);
  await expect(a.page.locator("#dev-panel")).toContainText('"pool":{"pattern":0}');
  await use(b.page, "button");
  await expect.poll(() => inScene<number>(b.page, "return s.tower.arm.scale")).toBeGreaterThan(1);
  await a.page.getByRole("button", { name: "Reset" }).click();
  await expect.poll(sizes(b.page, "return [s.tower.base.scale, s.tower.arm.scale]"), { timeout: 8000 }).toEqual([1, 1]);

  expect([...a.errors, ...b.errors]).toEqual([]);
  await Promise.all([a.context.close(), b.context.close()]);
});
