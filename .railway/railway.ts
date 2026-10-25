// Railway Infrastructure as Code for the single game service (issue #5).
// Nothing applies this automatically: preview it with `railway config plan`
// and apply it with `railway config apply` after `railway login` and
// `railway link`. See "Hosting" in README.md.
import { defineRailway, github, service } from "railway/iac";

export default defineRailway((_ctx, project) => {
  const game = service("game", {
    source: github("mattsq/what-did-you-just-do", { branch: "main" }),
    build: "npm run build",
    // `npm start` runs the same file, but through npm and a shell, which do not
    // pass Railway's SIGTERM on to the server; calling node directly lets the
    // server close its sockets before a redeploy replaces it.
    start: "node dist/server/index.js",
    healthcheck: "/health",
    healthcheckTimeout: 60,
    // Rooms live in this process's memory; a second replica would not see them.
    replicas: 1,
    env: {
      // Railpack reads `engines.node` (">=22.12.0") before `.nvmrc`, so pin
      // the Node major that CI tests.
      RAILPACK_NODE_VERSION: "24",
    },
  });

  return project("what-did-you-just-do", { resources: [game] });
});
