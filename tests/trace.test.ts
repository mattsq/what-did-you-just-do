import { describe, expect, it } from "vitest";
import { createInitialState, forceFinale } from "../src/shared/rules";
import { MAX_TRACE_LENGTH, parseTrace, replayTrace, type TraceEntry } from "../src/shared/trace";

const solve: TraceEntry[] = [
  { at: 0, kind: "act", role: "A", action: { type: "turn", controlId: "wheel", direction: 1 } },
  { at: 400, kind: "act", role: "A", action: { type: "toggle", controlId: "lever" } },
  { at: 900, kind: "act", role: "B", action: { type: "turn", controlId: "valve", direction: -1 } },
  { at: 1500, kind: "act", role: "B", action: { type: "press", controlId: "button" } },
];

describe("forced finale", () => {
  it("completes the finale once, with a fresh event ID", () => {
    const start = createInitialState();
    const forced = forceFinale(start);
    expect(forced.state.finaleComplete).toBe(true);
    expect(forced.state.revision).toBe(start.revision + 1);
    expect(forced.effects).toEqual([{ eventId: start.nextEventId, kind: "finale" }]);
    expect(forceFinale(forced.state)).toEqual({ state: forced.state, effects: [] });
  });
});

describe("trace replay", () => {
  it("is deterministic: the same trace from the same state gives the same result", () => {
    const first = replayTrace(solve, createInitialState());
    const second = replayTrace(solve, createInitialState());
    expect(second).toEqual(first);
    expect(first.state.finaleComplete).toBe(true);
    expect(first.effects.map((effect) => effect.kind)).toEqual(["pulse", "finale"]);
    expect(first.rejected).toBe(0);
  });

  it("applies resets and forced finales in order", () => {
    const result = replayTrace([...solve, { at: 2000, kind: "reset" }, { at: 2100, kind: "finale" }], createInitialState());
    expect(result.state.controls).toEqual(createInitialState().controls);
    expect(result.state.finaleComplete).toBe(true);
    expect(result.effects.map((effect) => effect.kind)).toEqual(["pulse", "finale", "finale"]);
  });

  it("skips and counts entries the rules refuse", () => {
    const result = replayTrace(
      [{ at: 0, kind: "act", role: "B", action: { type: "toggle", controlId: "lever" } }],
      createInitialState(),
    );
    expect(result.rejected).toBe(1);
    expect(result.state).toEqual(createInitialState());
  });
});

describe("trace validation", () => {
  it("accepts a well-formed trace", () => {
    expect(parseTrace(JSON.parse(JSON.stringify(solve)))).toEqual(solve);
    expect(parseTrace([])).toEqual([]);
  });

  it.each([
    ["not an array", { at: 0, kind: "reset" }],
    ["an unknown kind", [{ at: 0, kind: "explode" }]],
    ["a bad role", [{ at: 0, kind: "act", role: "C", action: { type: "toggle", controlId: "lever" } }]],
    ["a bad action", [{ at: 0, kind: "act", role: "A", action: { type: "turn", controlId: "wheel", direction: 2 } }]],
    ["a negative time", [{ at: -1, kind: "reset" }]],
    ["decreasing times", [{ at: 5, kind: "reset" }, { at: 4, kind: "reset" }]],
    ["a non-finite time", [{ at: Number.POSITIVE_INFINITY, kind: "reset" }]],
  ])("rejects %s", (_name, input) => {
    expect(parseTrace(input)).toBeNull();
  });

  it("rejects a trace longer than the limit", () => {
    expect(parseTrace(Array.from({ length: MAX_TRACE_LENGTH + 1 }, () => ({ at: 0, kind: "reset" })))).toBeNull();
  });
});
