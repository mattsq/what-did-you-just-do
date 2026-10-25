// Shared domain types may not depend on Phaser, browser APIs or Socket.IO.
// The puzzle agent should extend these with explicit state, actions and views.
export const ROLES = ["A", "B"] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return value === "A" || value === "B";
}
