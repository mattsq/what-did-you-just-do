import { describe, expect, it } from "vitest";
import { observe, observeEffects } from "../src/shared/observe";
import { FIRST_CLEARING } from "../src/shared/puzzles/first-clearing";
import { applyAction, createInitialState } from "../src/shared/rules";
import type { Action, GameState, Role } from "../src/shared/types";

function act(state: GameState, role: Role, action: Action) {
  const result = applyAction(state, role, action);
  if (!result.ok) throw new Error(result.error);
  return result;
}

function keysDeep(value: unknown, keys: string[] = []): string[] {
  if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      keys.push(key);
      keysDeep(child, keys);
    }
  }
  return keys;
}

describe("player observations", () => {
  it("shows each role only its own controls and its own clearing's fixtures", () => {
    const state = createInitialState();
    const a = observe(state, "A");
    const b = observe(state, "B");
    expect(Object.keys(a.controls).sort()).toEqual(["lever", "wheel"]);
    expect(Object.keys(a.fixtures).sort()).toEqual(["beacon", "pool"]);
    expect(Object.keys(b.controls).sort()).toEqual(["button", "valve"]);
    expect(Object.keys(b.fixtures)).toEqual(["tower"]);
  });

  it("never names the other role's controls anywhere in the projection", () => {
    const state = createInitialState();
    for (const role of ["A", "B"] as const) {
      const keys = keysDeep(observe(state, role));
      for (const [id, control] of Object.entries(FIRST_CLEARING.controls)) {
        if (control.owner !== role) expect(keys).not.toContain(id);
      }
    }
  });

  it("changes A's pool, not B's view of anything raw, when B turns the valve", () => {
    const before = createInitialState();
    const after = act(before, "B", { type: "turn", controlId: "valve", direction: 1 }).state;
    const aBefore = observe(before, "A");
    const aAfter = observe(after, "A");
    expect(aAfter.fixtures.pool?.pattern).not.toEqual(aBefore.fixtures.pool?.pattern);
    expect(aAfter.controls).toEqual(aBefore.controls);
    expect(aAfter).not.toHaveProperty("controls.valve");
  });

  it("changes B's tower when A turns the wheel or pulls the lever", () => {
    const start = createInitialState();
    const turned = act(start, "A", { type: "turn", controlId: "wheel", direction: 1 }).state;
    const pulled = act(turned, "A", { type: "toggle", controlId: "lever" }).state;
    const [b0, b1, b2] = [start, turned, pulled].map((state) => observe(state, "B"));
    expect(b1?.fixtures.tower?.orientation).not.toEqual(b0?.fixtures.tower?.orientation);
    expect(b2?.fixtures.tower?.halo).toBe(true);
    expect(b2?.controls).toEqual(b0?.controls);
    expect(b2).not.toHaveProperty("controls.wheel");
    expect(b2).not.toHaveProperty("controls.lever");
  });

  it("does not let the operator see the remote consequence of their own control", () => {
    const start = createInitialState();
    const turned = act(start, "A", { type: "turn", controlId: "wheel", direction: 1 }).state;
    expect(observe(turned, "A").fixtures).toEqual(observe(start, "A").fixtures);
    const valved = act(start, "B", { type: "turn", controlId: "valve", direction: 1 }).state;
    expect(observe(valved, "B").fixtures).toEqual(observe(start, "B").fixtures);
  });

  it("reports the finale as incomplete until it actually happens, then to both", () => {
    let state = createInitialState();
    const steps: Array<[Role, Action]> = [
      ["A", { type: "turn", controlId: "wheel", direction: 1 }],
      ["A", { type: "toggle", controlId: "lever" }],
      ["B", { type: "turn", controlId: "valve", direction: -1 }],
    ];
    for (const [role, action] of steps) {
      state = act(state, role, action).state;
      expect(observe(state, "A").finaleComplete).toBe(false);
      expect(observe(state, "B").finaleComplete).toBe(false);
    }
    state = act(state, "B", { type: "press", controlId: "button" }).state;
    expect(observe(state, "A").finaleComplete).toBe(true);
    expect(observe(state, "B").finaleComplete).toBe(true);
  });
});

describe("effect observations", () => {
  it("delivers the beacon pulse to A only", () => {
    const { effects } = act(createInitialState(), "B", { type: "press", controlId: "button" });
    expect(observeEffects(effects, "A")).toEqual([{ eventId: 1, kind: "pulse", fixture: "beacon" }]);
    expect(observeEffects(effects, "B")).toEqual([]);
  });

  it("delivers the finale to both roles", () => {
    const finale = [{ eventId: 9, kind: "finale" as const }];
    expect(observeEffects(finale, "A")).toEqual(finale);
    expect(observeEffects(finale, "B")).toEqual(finale);
  });
});
