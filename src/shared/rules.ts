import { FIRST_CLEARING } from "./puzzles/first-clearing";
import type {
  Action,
  ActionResult,
  ControlValue,
  Effect,
  FixtureValue,
  GameState,
  PropertyBinding,
  PuzzleDefinition,
  Role,
} from "./types";

export function createInitialState(puzzle: PuzzleDefinition = FIRST_CLEARING): GameState {
  return {
    revision: 0,
    controls: initialControls(puzzle),
    finaleComplete: false,
    nextEventId: 1,
  };
}

/**
 * Deterministic reset for tests and repeat play. The revision and event
 * counter keep increasing so clients never mistake the reset for old state.
 */
export function resetState(state: GameState, puzzle: PuzzleDefinition = FIRST_CLEARING): GameState {
  return {
    revision: state.revision + 1,
    controls: initialControls(puzzle),
    finaleComplete: false,
    nextEventId: state.nextEventId,
  };
}

function initialControls(puzzle: PuzzleDefinition): Record<string, ControlValue> {
  const controls: Record<string, ControlValue> = {};
  for (const [id, control] of Object.entries(puzzle.controls)) {
    if (control.kind !== "momentary") controls[id] = control.initial;
  }
  return controls;
}

/** Pure transition: never mutates `state`. */
export function applyAction(
  state: GameState,
  role: Role,
  action: Action,
  puzzle: PuzzleDefinition = FIRST_CLEARING,
): ActionResult {
  const control = Object.hasOwn(puzzle.controls, action.controlId)
    ? puzzle.controls[action.controlId]
    : undefined;
  if (!control) return { ok: false, error: "unknown-control" };
  if (control.owner !== role) return { ok: false, error: "not-your-control" };

  const controls = { ...state.controls };
  const effects: Effect[] = [];
  let nextEventId = state.nextEventId;
  let finaleComplete = state.finaleComplete;

  if (action.type === "turn" && control.kind === "detent") {
    const current = Number(state.controls[action.controlId] ?? control.initial);
    controls[action.controlId] = mod(current + action.direction, control.positions);
  } else if (action.type === "toggle" && control.kind === "toggle") {
    controls[action.controlId] = !(state.controls[action.controlId] ?? control.initial);
  } else if (action.type === "press" && control.kind === "momentary") {
    for (const [fixtureId, fixture] of Object.entries(puzzle.fixtures)) {
      if (fixture.pulsesOn?.includes(action.controlId)) {
        effects.push({ eventId: nextEventId++, kind: "pulse", fixture: fixtureId });
      }
    }
    if (
      !finaleComplete &&
      puzzle.finale.trigger === action.controlId &&
      finaleConditionsHold(state, puzzle)
    ) {
      finaleComplete = true;
      effects.push({ eventId: nextEventId++, kind: "finale" });
    }
  } else {
    return { ok: false, error: "wrong-action-for-control" };
  }

  return {
    ok: true,
    state: { revision: state.revision + 1, controls, finaleComplete, nextEventId },
    effects,
  };
}

/**
 * Development inspection only: completes the finale regardless of the
 * conditions. A no-op once the finale is complete, like the real trigger.
 */
export function forceFinale(state: GameState): { readonly state: GameState; readonly effects: readonly Effect[] } {
  if (state.finaleComplete) return { state, effects: [] };
  return {
    state: { ...state, revision: state.revision + 1, finaleComplete: true, nextEventId: state.nextEventId + 1 },
    effects: [{ eventId: state.nextEventId, kind: "finale" }],
  };
}

export function finaleConditionsHold(state: GameState, puzzle: PuzzleDefinition = FIRST_CLEARING): boolean {
  return puzzle.finale.requires.every(
    (condition) => fixtureValue(state, puzzle, condition.fixture, condition.property) === condition.equals,
  );
}

/** The visible value of one fixture property, derived from authoritative control state. */
export function fixtureValue(
  state: GameState,
  puzzle: PuzzleDefinition,
  fixtureId: string,
  property: string,
): FixtureValue | undefined {
  const binding = puzzle.fixtures[fixtureId]?.properties[property];
  return binding ? evaluateBinding(state, binding) : undefined;
}

export function evaluateBinding(state: GameState, binding: PropertyBinding): FixtureValue {
  const value = state.controls[binding.control];
  if (binding.kind === "detent") {
    const mapped = binding.map[Number(value)];
    if (mapped === undefined) throw new Error(`No mapping for ${binding.control}=${String(value)}`);
    return mapped;
  }
  return binding.invert ? !value : Boolean(value);
}

/**
 * Runtime validation for an action arriving from outside the process.
 * Returns null for anything malformed; role and target checks happen in
 * applyAction.
 */
export function parseAction(input: unknown): Action | null {
  if (typeof input !== "object" || input === null) return null;
  const candidate = input as Record<string, unknown>;
  const { type, controlId } = candidate;
  if (typeof controlId !== "string" || controlId.length === 0 || controlId.length > 32) return null;
  switch (type) {
    case "turn": {
      const { direction } = candidate;
      if (direction !== 1 && direction !== -1) return null;
      return { type, controlId, direction };
    }
    case "toggle":
    case "press":
      return { type, controlId };
    default:
      return null;
  }
}

/** Lists inconsistencies in puzzle data; an empty list means the definition is usable. */
export function validatePuzzle(puzzle: PuzzleDefinition): string[] {
  const problems: string[] = [];
  for (const [id, control] of Object.entries(puzzle.controls)) {
    if (control.kind === "detent") {
      const { positions, initial } = control;
      if (!Number.isInteger(positions) || positions < 2) problems.push(`${id}: needs at least 2 positions`);
      if (!Number.isInteger(initial) || initial < 0 || initial >= positions) {
        problems.push(`${id}: initial position out of range`);
      }
    }
  }
  for (const [fixtureId, fixture] of Object.entries(puzzle.fixtures)) {
    for (const [property, binding] of Object.entries(fixture.properties)) {
      const where = `${fixtureId}.${property}`;
      const control = puzzle.controls[binding.control];
      if (!control) {
        problems.push(`${where}: unknown control ${binding.control}`);
      } else if (control.kind !== binding.kind) {
        problems.push(`${where}: ${binding.control} is not a ${binding.kind} control`);
      } else if (control.kind === "detent" && binding.kind === "detent" && binding.map.length !== control.positions) {
        problems.push(`${where}: map needs one value per position`);
      }
    }
    for (const trigger of fixture.pulsesOn ?? []) {
      if (puzzle.controls[trigger]?.kind !== "momentary") problems.push(`${fixtureId}: ${trigger} is not momentary`);
    }
  }
  if (puzzle.controls[puzzle.finale.trigger]?.kind !== "momentary") problems.push("finale: trigger must be momentary");
  for (const condition of puzzle.finale.requires) {
    if (!puzzle.fixtures[condition.fixture]?.properties[condition.property]) {
      problems.push(`finale: unknown property ${condition.fixture}.${condition.property}`);
    }
  }
  return problems;
}

function mod(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}
