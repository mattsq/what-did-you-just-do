import { describe, expect, it } from "vitest";
import { observe, observeEffects } from "../src/shared/observe";
import { FIRST_CLEARING } from "../src/shared/puzzles/first-clearing";
import { applyAction, createInitialState, fixtureValue, seasonOf, seasonRelation, validatePuzzle } from "../src/shared/rules";
import type { Action, Effect, GameState, PuzzleDefinition, Role } from "../src/shared/types";

const SPRING = 0;
const SUMMER = 1;
const AUTUMN = 2;
const WINTER = 3;

/** A's sundial sets B's season; B's weathervane sets A's season. */
const sundial: [Role, Action] = ["A", { type: "turn", controlId: "sundial", direction: 1 }];
const weathervane: [Role, Action] = ["B", { type: "turn", controlId: "weathervane", direction: 1 }];

function run(steps: ReadonlyArray<[Role, Action]>, state: GameState = createInitialState()) {
  const effects: Effect[] = [];
  for (const [role, action] of steps) {
    const result = applyAction(state, role, action);
    if (!result.ok) throw new Error(result.error);
    state = result.state;
    effects.push(...result.effects);
  }
  return { state, effects };
}

const times = (step: [Role, Action], n: number) => Array.from({ length: n }, () => step);
const seasons = (state: GameState) => [seasonOf(state, FIRST_CLEARING, "A"), seasonOf(state, FIRST_CLEARING, "B")];

describe("seasons", () => {
  it("start in summer (A) and autumn (B): neither the same nor complementary", () => {
    const state = createInitialState();
    expect(seasons(state)).toEqual([SUMMER, AUTUMN]);
    expect(seasonRelation(state, FIRST_CLEARING)).toBeNull();
  });

  it("are set by the partner: the sundial turns B's season, the weathervane A's", () => {
    expect(seasons(run([sundial]).state)).toEqual([SUMMER, WINTER]);
    expect(seasons(run([weathervane]).state)).toEqual([AUTUMN, AUTUMN]);
  });

  it("cycle through all four seasons and come back", () => {
    const visited = [];
    let state = createInitialState();
    for (let i = 0; i < 4; i += 1) {
      state = run([sundial], state).state;
      visited.push(seasonOf(state, FIRST_CLEARING, "B"));
    }
    expect(visited).toEqual([WINTER, SPRING, SUMMER, AUTUMN]);
  });
});

describe("crossings", () => {
  it("sends a flock when the seasons become the same", () => {
    expect(run([weathervane]).effects).toEqual([{ eventId: 1, kind: "crossing", relation: "same" }]);
  });

  it("sends a drift from the cold clearing when the seasons become complementary", () => {
    // A summer, B winter: snow leaves B for A.
    expect(run([sundial]).effects).toEqual([{ eventId: 1, kind: "crossing", relation: "complementary", from: "B" }]);
    // A winter, B summer: snow leaves A for B.
    const { state, effects } = run([...times(weathervane, 2), ...times(sundial, 3)]);
    expect(seasons(state)).toEqual([WINTER, SUMMER]);
    expect(effects.at(-1)).toMatchObject({ kind: "crossing", relation: "complementary", from: "A" });
  });

  it("sends nothing when a season change breaks a relation or other controls move", () => {
    const together = run([weathervane]).state;
    expect(run([weathervane], together).effects).toEqual([]);
    expect(run([["A", { type: "turn", controlId: "wheel", direction: 1 }], ["A", { type: "toggle", controlId: "lever" }]]).effects).toEqual([]);
  });

  it("delivers a flock to both clearings and a drift as leaving or arriving, never the other season", () => {
    const flock = run([weathervane]).effects;
    expect(observeEffects(flock, "A")).toEqual(flock);
    expect(observeEffects(flock, "B")).toEqual(flock);

    const drift = run([sundial]).effects;
    expect(observeEffects(drift, "B")).toEqual([{ eventId: 1, kind: "crossing", relation: "complementary", direction: "leaving" }]);
    expect(observeEffects(drift, "A")).toEqual([{ eventId: 1, kind: "crossing", relation: "complementary", direction: "arriving" }]);
    expect(JSON.stringify(observeEffects(drift, "A"))).not.toMatch(/from|season|winter/);
  });
});

describe("observations of seasons", () => {
  it("show each role its own season only", () => {
    const state = run([sundial]).state;
    expect(observe(state, "A").season).toBe(SUMMER);
    expect(observe(state, "B").season).toBe(WINTER);
  });

  it("do not change for the operator when they turn the partner's season", () => {
    const start = createInitialState();
    let state = start;
    for (let i = 0; i < 4; i += 1) {
      state = run([sundial], state).state;
      const { controls: _a, revision: _r, ...a } = observe(state, "A");
      const { controls: _b, revision: _s, ...before } = observe(start, "A");
      expect(a).toEqual(before);
    }
    expect(observe(run([weathervane]).state, "B").season).toBe(AUTUMN);
    expect(observe(run([weathervane]).state, "B").fixtures).toEqual(observe(start, "B").fixtures);
  });
});

describe("winter", () => {
  it("freezes B's tower arm: its orientation is dormant, the halo is not", () => {
    const frozen = run([sundial, ["A", { type: "toggle", controlId: "lever" }]]).state;
    expect(observe(frozen, "B").fixtures.tower).toEqual({ halo: true });
    // The wheel still turns, but B cannot see it until the thaw.
    const turned = run([["A", { type: "turn", controlId: "wheel", direction: 1 }]], frozen).state;
    expect(observe(turned, "B").fixtures).toEqual(observe(frozen, "B").fixtures);
    expect(observe(run([sundial], turned).state, "B").fixtures.tower).toEqual({ orientation: 0, halo: true });
  });

  it("freezes A's pool", () => {
    const state = run(times(weathervane, 2)).state;
    expect(seasonOf(state, FIRST_CLEARING, "A")).toBe(WINTER);
    expect(observe(state, "A").fixtures.pool).toEqual({});
    expect(fixtureValue(state, FIRST_CLEARING, "pool", "pattern")).toBeUndefined();
  });
});

describe("finale and seasons", () => {
  const alignedFixtures: ReadonlyArray<[Role, Action]> = [
    ["A", { type: "turn", controlId: "wheel", direction: 1 }],
    ["A", { type: "toggle", controlId: "lever" }],
    ["B", { type: "turn", controlId: "valve", direction: -1 }],
  ];
  const press: [Role, Action] = ["B", { type: "press", controlId: "button" }];

  it("needs the same season in both clearings", () => {
    expect(run([...alignedFixtures, press]).state.finaleComplete).toBe(false);
    // Complementary is not enough.
    expect(run([...alignedFixtures, sundial, press]).state.finaleComplete).toBe(false);
    expect(run([...alignedFixtures, weathervane, press]).state.finaleComplete).toBe(true);
  });

  it("works in every shared season except winter, when the pool and tower are frozen", () => {
    const outcomes = [];
    let state = run([...alignedFixtures, weathervane]).state;
    for (let i = 0; i < 4; i += 1) {
      const season = seasonOf(state, FIRST_CLEARING, "A");
      outcomes.push([season, run([press], state).state.finaleComplete]);
      state = run([weathervane, sundial], state).state;
    }
    expect(Object.fromEntries(outcomes)).toEqual({ [SPRING]: true, [SUMMER]: true, [AUTUMN]: true, [WINTER]: false });
  });
});

describe("season data", () => {
  it("reports inconsistent season bindings", () => {
    const broken: PuzzleDefinition = {
      ...FIRST_CLEARING,
      seasons: { clearings: { A: { control: "lever", map: [0, 1] }, B: { control: "sundial", map: [0, 1, 2, 7] } } },
    };
    expect(validatePuzzle(broken)).toEqual([
      "seasons.A: lever is not a detent control",
      "seasons.B: map values must be seasons",
    ]);
  });
});
