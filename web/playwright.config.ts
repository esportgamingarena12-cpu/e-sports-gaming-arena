import { defineConfig } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';

// Tiny loader for web/.env.e2e (git-ignored): E2E_EMAIL=... and E2E_PASSWORD=... of a staff test account.
if (existsSync('.env.e2e')) {
  for (const line of readFileSync('.env.e2e', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  workers: 1, // one shared database: tests run one after another
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4200',
    channel: 'chrome', // the Google Chrome already installed on this PC (no browser download)
    headless: true,
    viewport: { width: 390, height: 844 }, // phone first
  },
  webServer: {
    command: 'npm start',
    url: 'http://localhost:4200',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
