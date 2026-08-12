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
    //
    // NOT 3000. `docker-compose.yml` publishes the candidate `frontend` on
    // 3000, and that collision silently defeated this entire suite: `serve`
    // could not bind, fell back to a random port, and the readiness probe
    // below was answered 200 by the FRONTEND's own `/health` route — so
    // Playwright declared the server ready and every test then navigated the
    // candidate app, which has no `/projects`, `/settings` or `/reports` and
    // returned its own Nuxt 404. The failure looked like broken routing in
    // the backoffice; nothing was broken except the port.
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',

    // Pinned, because @nuxtjs/i18n's browser-language detection otherwise
    // decides it from `Accept-Language` — which Playwright sends as en-US by
    // default, overriding `defaultLocale: 'it'`. Every locator that matches an
    // accessible name then depends on the machine running the suite, so the
    // same spec passes locally and fails in CI (or vice versa) for reasons
    // that have nothing to do with the code under test.
    locale: 'it-IT',
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
    // `-l tcp://…` rather than `-p`: serve 14 does not honour `-p`, and it
    // silently port-switches instead of failing, which is exactly how the
    // collision above went unnoticed. `-l` binds where told or errors out.
    command: 'bun run generate && bunx serve .output/public -l tcp://127.0.0.1:4173 -s',
    url: 'http://127.0.0.1:4173/health',
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
