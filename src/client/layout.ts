import type { Role } from "../shared/types";

export interface Placement {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  /** The avatar cannot walk through solid objects. */
  readonly solid?: boolean;
}

export interface ClearingLayout {
  readonly title: string;
  readonly spawn: { readonly x: number; readonly y: number };
  readonly controls: Readonly<Record<string, Placement & { readonly label: string }>>;
  readonly fixtures: Readonly<Record<string, Placement>>;
  /** Side of the screen with dense trees, facing the other clearing. */
  readonly treeEdge: "east" | "west";
}

/** View binding for the first encounter. Rules live in src/shared/puzzles. */
export const CLEARINGS: Readonly<Record<Role, ClearingLayout>> = {
  A: {
    title: "Western clearing",
    spawn: { x: 300, y: 250 },
    controls: {
      wheel: { x: 230, y: 380, radius: 42, label: "wheel", solid: true },
      lever: { x: 390, y: 450, radius: 28, label: "lever", solid: true },
    },
    fixtures: {
      pool: { x: 530, y: 230, radius: 95, solid: true },
      beacon: { x: 730, y: 380, radius: 42, solid: true },
    },
    treeEdge: "east",
  },
  B: {
    title: "Eastern clearing",
    spawn: { x: 330, y: 250 },
    controls: {
      valve: { x: 250, y: 400, radius: 36, label: "valve", solid: true },
      button: { x: 430, y: 455, radius: 26, label: "button", solid: true },
    },
    fixtures: {
      tower: { x: 620, y: 260, radius: 42, solid: true },
    },
    treeEdge: "west",
  },
};
