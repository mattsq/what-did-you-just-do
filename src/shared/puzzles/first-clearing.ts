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
 * Seasons (docs/DESIGN.md, "Seasons and crossings"):
 *
 * - A's sundial sets B's season; B's weathervane sets A's season. A starts in
 *   summer and B in autumn: neither the same nor complementary.
 * - When the seasons become the same, a flock flies over both clearings. When
 *   they become complementary, a drift leaves the cold clearing (leaves or
 *   snow) and arrives in the warm one (blossom or warm rain).
 * - In winter a clearing's remote readout freezes: A's pool stops showing the
 *   valve and B's tower arm stops following the wheel.
 * - The finale also needs both clearings in the same season, which winter's
 *   freeze rules out for winter itself.
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
    sundial: { kind: "detent", owner: "A", positions: 4, initial: 0 },
    weathervane: { kind: "detent", owner: "B", positions: 4, initial: 0 },
  },
  fixtures: {
    pool: {
      clearing: "A",
      properties: { pattern: { kind: "detent", control: "valve", map: [1, 2, 0], dormantIn: [3] } },
    },
    beacon: { clearing: "A", properties: {}, pulsesOn: ["button"] },
    tower: {
      clearing: "B",
      properties: {
        orientation: { kind: "detent", control: "wheel", map: [2, 0, 1], dormantIn: [3] },
        halo: { kind: "toggle", control: "lever" },
      },
    },
  },
  seasons: {
    clearings: {
      // Season indexes: 0 spring, 1 summer, 2 autumn, 3 winter.
      A: { control: "weathervane", map: [1, 2, 3, 0] },
      B: { control: "sundial", map: [2, 3, 0, 1] },
    },
  },
  finale: {
    seasons: "same",
    requires: [
      { fixture: "tower", property: "orientation", equals: 0 },
      { fixture: "tower", property: "halo", equals: true },
      { fixture: "pool", property: "pattern", equals: 0 },
    ],
    trigger: "button",
  },
};
