import { describe, expect, it } from "vitest";
import { isRole, ROLES } from "../src/shared/types";

describe("role validation", () => {
  it("accepts the two active roles", () => {
    expect(ROLES).toEqual(["A", "B"]);
    expect(isRole("A")).toBe(true);
    expect(isRole("B")).toBe(true);
  });

  it("rejects unexpected or malformed roles", () => {
    for (const value of ["C", "spectator", null, 1, {}]) {
      expect(isRole(value)).toBe(false);
    }
  });
});
