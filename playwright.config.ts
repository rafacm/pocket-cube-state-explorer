import { defineConfig, devices } from '@playwright/test';
import { CHROMIUM_ARGS, chromiumEnv } from './scripts/chromium';

// End-to-end tests: build the app, serve it with vite preview, drive it in headless Chromium with
// software WebGL. bun run e2e
export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1400, height: 900 },
    trace: 'retain-on-failure',
    launchOptions: { args: CHROMIUM_ARGS, env: chromiumEnv() },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 900 } } }],
  webServer: {
    command: 'bun run build && bun run preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
