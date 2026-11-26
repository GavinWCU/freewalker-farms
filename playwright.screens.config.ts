import { defineConfig } from '@playwright/test';

// `npm run screenshots`: captures the key scenes at full quality into /screenshots.
export default defineConfig({
  testDir: 'tests/screens',
  timeout: 180_000,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173/',
    serviceWorkers: 'block',
    viewport: { width: 1180, height: 820 },
    hasTouch: true,
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  webServer: { command: 'npm run build && npm run preview', url: 'http://localhost:4173/', reuseExistingServer: true, timeout: 120_000 },
});
