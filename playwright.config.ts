import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E configuration — 3 required browser projects per D14.
 *
 * Projects:
 *   chromium  — Desktop Chromium, full suite (all E2E specs)
 *   webkit    — Desktop Safari/WebKit, full suite (all E2E specs)
 *   mobile    — Mobile device viewport, SA-11 gate spec ONLY (asserts unsupported-experience)
 *
 * Firefox is intentionally excluded per NFR (product is desktop Chrome/Edge/Safari only).
 * E2E is a required, blocking tier and must run 100% green (D15).
 * SPA mode (ssr: false): `nuxt generate` → static output served with SPA fallback.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: [['html', { open: 'never' }], ['list']],

  // Screenshot visual-regression tolerance (absorbs sub-pixel font/AA rendering noise).
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.02 },
  },

  use: {
    // IPv4 explicitly to avoid IPv6 `localhost` resolution timeouts.
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      // SA-11 — mobile viewport: asserts the unsupported-experience gate ONLY.
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
      testMatch: ['**/unsupported-gate.spec.ts'],
    },
  ],

  // Generate the static SPA and serve it with SPA fallback (-s). Readiness is
  // checked against the /health route (served as the SPA shell → 200).
  webServer: {
    command: 'bun run generate && bunx serve .output/public -p 3000 -s --no-port-switching',
    url: 'http://127.0.0.1:3000/health',
    env: {
      // C13 task 5.6: the consent banner only appears where there is something
      // to ask permission FOR, so E2E needs a measurement ID configured.
      //
      // Set at GENERATE time, not serve time, and that is not incidental: this
      // app is a static SPA with no server to read the environment at runtime,
      // so a value supplied later would never reach the bundle.
      //
      // The ID is fake and analytics-consent.spec.ts blocks the third-party
      // hosts at the network layer — a suite that phoned Google on every run
      // would be slow, flaky, and reporting CI traffic into a real property.
      NUXT_PUBLIC_GA_MEASUREMENT_ID: 'G-E2ETEST',
    },
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
  },
})
