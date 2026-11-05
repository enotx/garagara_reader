import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    command: 'pnpm exec vite --host 127.0.0.1',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Keep a developer's local .env from changing the unconfigured-LLM tests.
    env: {
      ...Object.fromEntries(
        Object.entries(process.env).filter((entry): entry is [string, string] => {
          return entry[1] !== undefined;
        }),
      ),
      VITE_LLM_BASE_URL: '',
      VITE_LLM_MODEL: '',
      VITE_LLM_API_KEY: '',
      VITE_LLM_STRATEGY: '',
      VITE_LLM_AUTO_REQUEST: '',
      VITE_LLM_PREPROCESS: '',
      VITE_LLM_PREPROCESS_CHAPTERS: '',
    },
  },
});
