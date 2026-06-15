import { defineConfig, devices } from "@playwright/test";

const webPort = process.env.QDCA_WEB_PORT ?? "5174";
const apiPort = process.env.QDCA_API_PORT ?? "8788";
const baseURL = `http://127.0.0.1:${webPort}`;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 8_000
  },
  fullyParallel: true,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry"
  },
  webServer: {
    command: "node scripts/dev.mjs --mock-data",
    url: baseURL,
    reuseExistingServer: false,
    env: {
      QDCA_API_PORT: apiPort,
      QDCA_WEB_PORT: webPort
    },
    timeout: 120_000
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"] }
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] }
    }
  ]
});
