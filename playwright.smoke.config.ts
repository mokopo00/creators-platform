import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  testMatch: 'smoke.staging.ts',
  workers: 1,
  timeout: 60_000,
  reporter: 'list',
  use: { baseURL: process.env.E2E_BASE_URL, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
