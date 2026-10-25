// Shared domain types may not depend on Phaser, browser APIs or Socket.IO.
export const ROLES = ["A", "B"] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return value === "A" || value === "B";
}

export function otherRole(role: Role): Role {
  return role === "A" ? "B" : "A";
}

// ---------------------------------------------------------------------------
// Puzzle definition (data). Changing a cause-effect relation should only need
// edits to a PuzzleDefinition value, never to rules, observation or networking.
// ---------------------------------------------------------------------------

/** A control with a fixed number of discrete positions that wraps around. */
export interface DetentControlDef {
  readonly kind: "detent";
  readonly owner: Role;
  readonly positions: number;
  readonly initial: number;
}

/** A two-state control, such as a lever. */
export interface ToggleControlDef {
  readonly kind: "toggle";
  readonly owner: Role;
  readonly initial: boolean;
}

/** A control with no lasting state; each press is an event. */
export interface MomentaryControlDef {
  readonly kind: "momentary";
  readonly owner: Role;
}

export type ControlDef = DetentControlDef | ToggleControlDef | MomentaryControlDef;

/**
 * How a fixture property is derived from a control. `map[position]` gives the
 * observed value, so the relation between control position and visible effect
 * is not simply the identity.
 */
export type PropertyBinding =
  | { readonly kind: "detent"; readonly control: string; readonly map: readonly number[] }
  | { readonly kind: "toggle"; readonly control: string; readonly invert?: boolean };

export interface FixtureDef {
  /** The clearing (and therefore the role) that can see this fixture. */
  readonly clearing: Role;
  readonly properties: Readonly<Record<string, PropertyBinding>>;
  /** Momentary controls whose presses make this fixture emit a pulse. */
  readonly pulsesOn?: readonly string[];
}

export interface FixtureCondition {
  readonly fixture: string;
  readonly property: string;
  readonly equals: FixtureValue;
}

export interface FinaleDef {
  /** Every condition must hold when the trigger is pressed. */
  readonly requires: readonly FixtureCondition[];
  readonly trigger: string;
}

export interface PuzzleDefinition {
  readonly controls: Readonly<Record<string, ControlDef>>;
  readonly fixtures: Readonly<Record<string, FixtureDef>>;
  readonly finale: FinaleDef;
}

// ---------------------------------------------------------------------------
// Authoritative state, actions and effects.
// ---------------------------------------------------------------------------

export type ControlValue = number | boolean;
export type FixtureValue = number | boolean;

/** Full authoritative state. Never send this to an ordinary player client. */
export interface GameState {
  readonly revision: number;
  /** Lasting values of detent and toggle controls. Momentary controls are absent. */
  readonly controls: Readonly<Record<string, ControlValue>>;
  readonly finaleComplete: boolean;
  /** Next ephemeral effect ID; never reset so IDs stay unique per room. */
  readonly nextEventId: number;
}

export type Action =
  | { readonly type: "turn"; readonly controlId: string; readonly direction: 1 | -1 }
  | { readonly type: "toggle"; readonly controlId: string }
  | { readonly type: "press"; readonly controlId: string };

export type ActionError =
  | "unknown-control"
  | "not-your-control"
  | "wrong-action-for-control";

/** Ephemeral, non-state effects. `eventId` is stable so replays can be deduplicated. */
export type Effect =
  | { readonly eventId: number; readonly kind: "pulse"; readonly fixture: string }
  | { readonly eventId: number; readonly kind: "finale" };

export type ActionResult =
  | { readonly ok: true; readonly state: GameState; readonly effects: readonly Effect[] }
  | { readonly ok: false; readonly error: ActionError };

// ---------------------------------------------------------------------------
// Player-specific projections.
// ---------------------------------------------------------------------------

export type ControlView =
  | { readonly kind: "detent"; readonly position: number; readonly positions: number }
  | { readonly kind: "toggle"; readonly on: boolean }
  | { readonly kind: "momentary" };

/**
 * What one role may know: its own controls and the fixtures in its own
 * clearing. It never contains the other role's control values.
 */
export interface Observation {
  readonly role: Role;
  readonly revision: number;
  readonly controls: Readonly<Record<string, ControlView>>;
  readonly fixtures: Readonly<Record<string, Readonly<Record<string, FixtureValue>>>>;
  /** Public only once true; before the finale it is always false. */
  readonly finaleComplete: boolean;
}
