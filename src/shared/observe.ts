import { FIRST_CLEARING } from "./puzzles/first-clearing";
import { evaluateBinding } from "./rules";
import type {
  ControlView,
  Effect,
  FixtureValue,
  GameState,
  Observation,
  PuzzleDefinition,
  Role,
} from "./types";

/**
 * Allowlisted projection of authoritative state for one role: its own
 * controls, plus derived (not raw) values of fixtures in its own clearing.
 */
export function observe(
  state: GameState,
  role: Role,
  puzzle: PuzzleDefinition = FIRST_CLEARING,
): Observation {
  const controls: Record<string, ControlView> = {};
  for (const [id, control] of Object.entries(puzzle.controls)) {
    if (control.owner !== role) continue;
    if (control.kind === "detent") {
      controls[id] = {
        kind: "detent",
        position: Number(state.controls[id] ?? control.initial),
        positions: control.positions,
      };
    } else if (control.kind === "toggle") {
      controls[id] = { kind: "toggle", on: Boolean(state.controls[id] ?? control.initial) };
    } else {
      controls[id] = { kind: "momentary" };
    }
  }

  const fixtures: Record<string, Record<string, FixtureValue>> = {};
  for (const [id, fixture] of Object.entries(puzzle.fixtures)) {
    if (fixture.clearing !== role) continue;
    const properties: Record<string, FixtureValue> = {};
    for (const [property, binding] of Object.entries(fixture.properties)) {
      properties[property] = evaluateBinding(state, binding);
    }
    fixtures[id] = properties;
  }

  return { role, revision: state.revision, controls, fixtures, finaleComplete: state.finaleComplete };
}

/** The ephemeral effects one role may witness. */
export function observeEffects(
  effects: readonly Effect[],
  role: Role,
  puzzle: PuzzleDefinition = FIRST_CLEARING,
): Effect[] {
  return effects.filter(
    (effect) => effect.kind === "finale" || puzzle.fixtures[effect.fixture]?.clearing === role,
  );
}
