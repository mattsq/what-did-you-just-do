import type { PuzzleDefinition } from "../types";

/**
 * The first encounter's causal map (docs/DESIGN.md, "Initial causal map").
 * Tunable: edit this data, then the matching tests, to change a relation.
 *
 * - A's wheel turns B's tower between three orientations (orientation 0 is
 *   "aligned": the tower's arm points west, towards A's clearing).
 * - A's lever gives B's tower a halo.
 * - B's valve changes the ripple pattern of A's pool (pattern 0 is "still
 *   concentric rings", the aligned state).
 * - B's button makes A's beacon pulse. Pressing it while the tower is aligned
 *   and haloed and the pool is still triggers the finale.
 *
 * The maps are deliberately not the identity, so the starting detent is not
 * the aligned one and neither player can infer the other's raw control value.
 */
export const FIRST_CLEARING: PuzzleDefinition = {
  controls: {
    wheel: { kind: "detent", owner: "A", positions: 3, initial: 0 },
    lever: { kind: "toggle", owner: "A", initial: false },
    valve: { kind: "detent", owner: "B", positions: 3, initial: 0 },
    button: { kind: "momentary", owner: "B" },
  },
  fixtures: {
    pool: {
      clearing: "A",
      properties: { pattern: { kind: "detent", control: "valve", map: [1, 2, 0] } },
    },
    beacon: { clearing: "A", properties: {}, pulsesOn: ["button"] },
    tower: {
      clearing: "B",
      properties: {
        orientation: { kind: "detent", control: "wheel", map: [2, 0, 1] },
        halo: { kind: "toggle", control: "lever" },
      },
    },
  },
  finale: {
    requires: [
      { fixture: "tower", property: "orientation", equals: 0 },
      { fixture: "tower", property: "halo", equals: true },
      { fixture: "pool", property: "pattern", equals: 0 },
    ],
    trigger: "button",
  },
};
