import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  retries: 0,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: 390, height: 844 },
    baseURL: process.env.PLAYWRIGHT_WEB_URL || "http://localhost:3000",
    trace: "retain-on-failure",
    ...(process.env.PLAYWRIGHT_CHROME_EXECUTABLE && {
      launchOptions: {
        executablePath: process.env.PLAYWRIGHT_CHROME_EXECUTABLE,
      },
    }),
  },
});
