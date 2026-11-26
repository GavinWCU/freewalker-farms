import { defineConfig, devices } from '@playwright/test';

const gl = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 1, // software WebGL in headless browsers is occasionally starved for CPU
  reporter: 'list',
  use: { baseURL: 'http://localhost:4173/', serviceWorkers: 'block', launchOptions: { args: gl } },
  webServer: { command: 'npm run build && npm run preview', url: 'http://localhost:4173/', reuseExistingServer: true, timeout: 120_000 },
  projects: [
    { name: 'ipad', use: { viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: false, userAgent: devices['iPad Pro 11'].userAgent } },
    { name: 'phone', use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
  ],
});
