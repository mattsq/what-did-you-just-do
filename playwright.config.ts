import { defineConfig, devices } from "@playwright/test";

/**
 * `E2E_BASE_URL` runs against an already running server, such as the
 * production build or a deployment, instead of starting `npm run dev`. Only
 * the boot test runs then: the others read panels that exist only in
 * development. `npm run smoke` covers the protocol against such a server.
 */
const remote = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: remote ? ["scaffold.spec.ts"] : undefined,
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: remote ?? "http://127.0.0.1:5173",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: remote
    ? undefined
    : {
        command: "npm run dev",
        url: "http://127.0.0.1:5173",
        reuseExistingServer: !process.env.CI,
        timeout: 90_000,
      },
});
