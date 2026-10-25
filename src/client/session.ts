import { observe, observeEffects } from "../shared/observe";
import { applyAction, createInitialState, resetState } from "../shared/rules";
import type { Action, Effect, GameState, Observation, Role } from "../shared/types";

export interface SessionUpdate {
  readonly observation: Observation;
  readonly effects: readonly Effect[];
}

/** What a clearing scene may use: one role's observation stream and its actions. */
export interface ClientSession {
  readonly role: Role;
  observation(): Observation;
  act(action: Action): void;
  subscribe(listener: (update: SessionUpdate) => void): () => void;
}

/**
 * Single-browser developer preview (Milestone 1): runs the shared rules in
 * the page so either clearing can be tried without a server. Scenes still
 * receive only one role's observation. Milestone 2 replaces this with a
 * server-backed session that implements the same ClientSession interface.
 */
export class LocalPreview {
  private state: GameState = createInitialState();
  private readonly listeners = new Set<(state: GameState, effects: readonly Effect[]) => void>();

  view(role: Role): ClientSession {
    return {
      role,
      observation: () => observe(this.state, role),
      act: (action) => {
        const result = applyAction(this.state, role, action);
        if (result.ok) this.commit(result.state, result.effects);
        else console.warn("Action rejected", result.error);
      },
      subscribe: (listener) => this.onChange((state, effects) => {
        listener({ observation: observe(state, role), effects: observeEffects(effects, role) });
      }),
    };
  }

  reset(): void {
    this.commit(resetState(this.state), []);
  }

  /** Development inspection only: both projections, never the raw state. */
  onChange(listener: (state: GameState, effects: readonly Effect[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  snapshot(): GameState {
    return this.state;
  }

  private commit(state: GameState, effects: readonly Effect[]): void {
    this.state = state;
    for (const listener of this.listeners) listener(state, effects);
  }
}
