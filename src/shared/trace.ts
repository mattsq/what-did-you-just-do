// Deterministic action traces for development inspection and replay. A trace
// records what happened in a room, never who the players are.
import { FIRST_CLEARING } from "./puzzles/first-clearing";
import { applyAction, forceFinale, parseAction, resetState } from "./rules";
import { isRole, type Action, type Effect, type GameState, type PuzzleDefinition, type Role } from "./types";

/** `at` is milliseconds since the trace started. */
export type TraceEntry =
  | { readonly at: number; readonly kind: "act"; readonly role: Role; readonly action: Action }
  | { readonly at: number; readonly kind: "reset" }
  | { readonly at: number; readonly kind: "finale" };

export const MAX_TRACE_LENGTH = 1000;

export interface ReplayResult {
  readonly state: GameState;
  readonly effects: readonly Effect[];
  /** Entries the rules refused, such as a control acted on by the wrong role. */
  readonly rejected: number;
}

/**
 * Pure: applies every entry in order, ignoring timestamps. Replaying the same
 * trace from the same state always gives the same state and effects.
 */
export function replayTrace(
  trace: readonly TraceEntry[],
  from: GameState,
  puzzle: PuzzleDefinition = FIRST_CLEARING,
): ReplayResult {
  let state = from;
  const effects: Effect[] = [];
  let rejected = 0;
  for (const entry of trace) {
    if (entry.kind === "reset") {
      state = resetState(state, puzzle);
    } else if (entry.kind === "finale") {
      const result = forceFinale(state);
      state = result.state;
      effects.push(...result.effects);
    } else {
      const result = applyAction(state, entry.role, entry.action, puzzle);
      if (!result.ok) {
        rejected += 1;
        continue;
      }
      state = result.state;
      effects.push(...result.effects);
    }
  }
  return { state, effects, rejected };
}

/** Runtime validation of a trace from outside the process; null if any entry is malformed. */
export function parseTrace(input: unknown): TraceEntry[] | null {
  if (!Array.isArray(input) || input.length > MAX_TRACE_LENGTH) return null;
  const trace: TraceEntry[] = [];
  let previous = 0;
  for (const item of input) {
    if (typeof item !== "object" || item === null) return null;
    const { at, kind, role, action } = item as Record<string, unknown>;
    if (typeof at !== "number" || !Number.isFinite(at) || at < previous) return null;
    previous = at;
    if (kind === "reset" || kind === "finale") {
      trace.push({ at, kind });
    } else if (kind === "act") {
      const parsed = parseAction(action);
      if (!isRole(role) || !parsed) return null;
      trace.push({ at, kind, role, action: parsed });
    } else {
      return null;
    }
  }
  return trace;
}
