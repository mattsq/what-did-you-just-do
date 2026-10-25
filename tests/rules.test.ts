import { describe, expect, it } from "vitest";
import { FIRST_CLEARING } from "../src/shared/puzzles/first-clearing";
import {
  applyAction,
  createInitialState,
  fixtureValue,
  parseAction,
  resetState,
  validatePuzzle,
} from "../src/shared/rules";
import type { Action, GameState, PuzzleDefinition, Role } from "../src/shared/types";

/** Applies a sequence that must succeed, returning the final state and all effects. */
function run(steps: ReadonlyArray<[Role, Action]>, state = createInitialState(), puzzle = FIRST_CLEARING) {
  const effects = [];
  for (const [role, action] of steps) {
    const result = applyAction(state, role, action, puzzle);
    if (!result.ok) throw new Error(`${role} ${action.type} ${action.controlId}: ${result.error}`);
    state = result.state;
    effects.push(...result.effects);
  }
  return { state, effects };
}

const turnWheel: [Role, Action] = ["A", { type: "turn", controlId: "wheel", direction: 1 }];
const toggleLever: [Role, Action] = ["A", { type: "toggle", controlId: "lever" }];
const turnValve: [Role, Action] = ["B", { type: "turn", controlId: "valve", direction: 1 }];
const pressButton: [Role, Action] = ["B", { type: "press", controlId: "button" }];

/** Wheel and valve each moved to the detent that the puzzle data calls aligned. */
const aligned: ReadonlyArray<[Role, Action]> = [turnWheel, toggleLever, turnValve, turnValve];

describe("puzzle data", () => {
  it("is internally consistent", () => {
    expect(validatePuzzle(FIRST_CLEARING)).toEqual([]);
  });

  it("reports inconsistent bindings", () => {
    const broken: PuzzleDefinition = {
      ...FIRST_CLEARING,
      fixtures: {
        pool: { clearing: "A", properties: { pattern: { kind: "detent", control: "valve", map: [0, 1] } } },
        tower: { clearing: "B", properties: { halo: { kind: "toggle", control: "wheel" } } },
      },
      finale: { requires: [{ fixture: "tower", property: "missing", equals: 1 }], trigger: "lever" },
    };
    expect(validatePuzzle(broken)).toHaveLength(4);
  });
});

describe("initial state", () => {
  it("starts at the defined positions with no finale and no aligned fixtures", () => {
    const state = createInitialState();
    expect(state).toEqual({
      revision: 0,
      controls: { wheel: 0, lever: false, valve: 0 },
      finaleComplete: false,
      nextEventId: 1,
    });
    expect(fixtureValue(state, FIRST_CLEARING, "tower", "orientation")).not.toBe(0);
    expect(fixtureValue(state, FIRST_CLEARING, "pool", "pattern")).not.toBe(0);
  });
});

describe("control transitions", () => {
  it("turns a detent control through every position and wraps in both directions", () => {
    const positions = [];
    let state = createInitialState();
    for (let i = 0; i < 4; i += 1) {
      state = run([turnWheel], state).state;
      positions.push(state.controls.wheel);
    }
    expect(positions).toEqual([1, 2, 0, 1]);
    const back = run([["A", { type: "turn", controlId: "wheel", direction: -1 }]], createInitialState());
    expect(back.state.controls.wheel).toBe(2);
  });

  it("only ever holds legal detent values", () => {
    let state = createInitialState();
    for (let i = 0; i < 20; i += 1) {
      state = run([turnValve, ["B", { type: "turn", controlId: "valve", direction: i % 3 === 0 ? -1 : 1 }]], state).state;
      expect([0, 1, 2]).toContain(state.controls.valve);
    }
  });

  it("toggles the lever and back", () => {
    const once = run([toggleLever]).state;
    expect(once.controls.lever).toBe(true);
    expect(run([toggleLever], once).state.controls.lever).toBe(false);
  });

  it("moves the remote fixture through three distinct values", () => {
    const orientations = new Set();
    const patterns = new Set();
    let state = createInitialState();
    for (let i = 0; i < 3; i += 1) {
      orientations.add(fixtureValue(state, FIRST_CLEARING, "tower", "orientation"));
      patterns.add(fixtureValue(state, FIRST_CLEARING, "pool", "pattern"));
      state = run([turnWheel, turnValve], state).state;
    }
    expect(orientations.size).toBe(3);
    expect(patterns.size).toBe(3);
  });

  it("makes the beacon pulse on every button press, with unique event IDs", () => {
    const { effects, state } = run([pressButton, pressButton]);
    expect(effects).toEqual([
      { eventId: 1, kind: "pulse", fixture: "beacon" },
      { eventId: 2, kind: "pulse", fixture: "beacon" },
    ]);
    expect(state.controls).toEqual(createInitialState().controls);
  });

  it("increments the revision on every accepted action", () => {
    expect(run([turnWheel, toggleLever, pressButton]).state.revision).toBe(3);
  });

  it("does not mutate the input state", () => {
    const state = createInitialState();
    const snapshot = structuredClone(state);
    run([turnWheel, toggleLever, turnValve, pressButton], state);
    expect(state).toEqual(snapshot);
  });

  it("is deterministic", () => {
    const steps = [...aligned, pressButton, turnWheel, pressButton];
    expect(run(steps)).toEqual(run(steps));
  });
});

describe("invalid actions", () => {
  const state = createInitialState();

  it("rejects a control owned by the other role", () => {
    expect(applyAction(state, "B", turnWheel[1])).toEqual({ ok: false, error: "not-your-control" });
    expect(applyAction(state, "A", pressButton[1])).toEqual({ ok: false, error: "not-your-control" });
  });

  it("rejects unknown controls, including prototype keys", () => {
    for (const controlId of ["tower", "pool", "constructor", "__proto__"]) {
      expect(applyAction(state, "A", { type: "press", controlId })).toEqual({ ok: false, error: "unknown-control" });
    }
  });

  it("rejects an action that does not fit the control", () => {
    expect(applyAction(state, "A", { type: "press", controlId: "wheel" })).toEqual({
      ok: false,
      error: "wrong-action-for-control",
    });
    expect(applyAction(state, "A", { type: "turn", controlId: "lever", direction: 1 })).toEqual({
      ok: false,
      error: "wrong-action-for-control",
    });
    expect(applyAction(state, "B", { type: "toggle", controlId: "button" })).toEqual({
      ok: false,
      error: "wrong-action-for-control",
    });
  });

  it("parses only well-formed actions", () => {
    expect(parseAction({ type: "turn", controlId: "wheel", direction: -1 })).toEqual({
      type: "turn",
      controlId: "wheel",
      direction: -1,
    });
    expect(parseAction({ type: "press", controlId: "button", extra: "ignored" })).toEqual({
      type: "press",
      controlId: "button",
    });
    for (const input of [
      null,
      "turn",
      42,
      {},
      { type: "turn", controlId: "wheel" },
      { type: "turn", controlId: "wheel", direction: 2 },
      { type: "turn", controlId: "wheel", direction: "1" },
      { type: "spin", controlId: "wheel" },
      { type: "press", controlId: "" },
      { type: "press", controlId: 7 },
      { type: "press", controlId: "x".repeat(100) },
    ]) {
      expect(parseAction(input)).toBeNull();
    }
  });
});

describe("finale", () => {
  it("does not fire when the button is pressed out of alignment", () => {
    for (const partial of [
      [turnWheel, toggleLever],
      [turnWheel, turnValve, turnValve],
      [toggleLever, turnValve, turnValve],
    ]) {
      const { state, effects } = run([...partial, pressButton]);
      expect(state.finaleComplete).toBe(false);
      expect(effects.map((effect) => effect.kind)).toEqual(["pulse"]);
    }
  });

  it("fires once when B presses the button with everything aligned", () => {
    const { state, effects } = run([...aligned, pressButton, pressButton]);
    expect(state.finaleComplete).toBe(true);
    expect(effects).toEqual([
      { eventId: 1, kind: "pulse", fixture: "beacon" },
      { eventId: 2, kind: "finale" },
      { eventId: 3, kind: "pulse", fixture: "beacon" },
    ]);
  });

  it("follows the puzzle data when a causal relation changes", () => {
    // Re-map the wheel so its starting detent already aligns the tower.
    const tower = FIRST_CLEARING.fixtures.tower!;
    const remapped: PuzzleDefinition = {
      ...FIRST_CLEARING,
      fixtures: {
        ...FIRST_CLEARING.fixtures,
        tower: {
          ...tower,
          properties: { ...tower.properties, orientation: { kind: "detent", control: "wheel", map: [0, 1, 2] } },
        },
      },
    };
    expect(validatePuzzle(remapped)).toEqual([]);
    const result = run([toggleLever, turnValve, turnValve, pressButton], createInitialState(remapped), remapped);
    expect(result.state.finaleComplete).toBe(true);
    expect(run([toggleLever, turnValve, turnValve, pressButton]).state.finaleComplete).toBe(false);
  });
});

describe("reset", () => {
  it("restores initial controls but keeps revisions and event IDs increasing", () => {
    const played = run([...aligned, pressButton]).state;
    const reset: GameState = resetState(played);
    expect(reset.controls).toEqual(createInitialState().controls);
    expect(reset.finaleComplete).toBe(false);
    expect(reset.revision).toBe(played.revision + 1);
    const after = run([pressButton], reset);
    expect(after.effects[0]?.eventId).toBeGreaterThan(2);
  });

  it("allows the finale to be achieved again after reset", () => {
    const reset = resetState(run([...aligned, pressButton]).state);
    expect(run([...aligned, pressButton], reset).state.finaleComplete).toBe(true);
  });
});
