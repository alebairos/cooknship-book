import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npx wrangler dev --port 8787 --var BEARER_TOKEN:test-token',
    url: 'http://127.0.0.1:8787/',
    timeout: 120000,
    reuseExistingServer: !process.env.CI,
  },
});
