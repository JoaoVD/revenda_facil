import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev -- --hostname 127.0.0.1',
        url: 'http://127.0.0.1:3000/login',
        reuseExistingServer: !process.env.CI,
      },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        channel: process.env.UX_BROWSER_CHANNEL,
      },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], channel: process.env.UX_BROWSER_CHANNEL },
    },
  ],
});
