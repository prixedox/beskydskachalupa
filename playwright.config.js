import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:5178' },
  webServer: {
    command: 'npx vite --port 5178 --strictPort',
    url: 'http://localhost:5178',
    reuseExistingServer: true,
  },
});
