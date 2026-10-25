import { describe, expect, it } from "vitest";
import { createRailwayContext, project } from "railway/iac";
import program from "../.railway/railway";

describe("Railway service definition", () => {
  it("builds, starts node directly, checks health and keeps exactly one replica on Node 24", async () => {
    const definition = await program(createRailwayContext(), project);
    expect(definition.resources).toHaveLength(1);
    expect(definition.resources?.[0]).toMatchObject({
      type: "service",
      source: { type: "github", repo: "mattsq/what-did-you-just-do", branch: "main" },
      build: { buildCommand: "npm run build" },
      // In-memory rooms: a second replica would split them.
      deploy: { startCommand: "node dist/server/index.js", healthcheckPath: "/health", numReplicas: 1 },
    });
    expect(definition.resources?.[0]).toMatchObject({ variables: { RAILPACK_NODE_VERSION: { type: "literal", value: "24" } } });
  });
});
