import { defineConfig, devices } from '@playwright/test'
import { resolveStackUrl } from './tests/e2e/support/stack-url'

/**
 * Playwright E2E configuration — 2 required browser projects.
 *
 * Projects:
 *   chromium  — Desktop Chromium, full suite (all E2E specs)
 *   webkit    — Desktop Safari/WebKit, full suite (all E2E specs)
 *
 * No mobile project and no Firefox/viewport exclusion here: the backoffice is
 * a plain admin CRUD SPA with no camera/microphone requirement, so it carries
 * no browser or viewport gate — unlike the candidate-facing `frontend` app,
 * which runs the avatar interview and keeps its own SA-11 gate + dedicated
 * mobile Playwright project for that reason.
 * E2E is a required, blocking tier and must run 100% green (D15).
 * SPA mode (ssr: false): `nuxt generate` → static output served with SPA fallback.
 */
/**
 * Opt-in real-stack tier (`BEAI_E2E_STACK=1`, `bun run test:e2e:stack`).
 *
 * Runs `tests/e2e/stack/**` against the RUNNING local stack (backoffice nginx ->
 * real api -> real database): no webServer, no `page.route`, no retries, one
 * worker. It exists because every other suite here is fully mocked and so cannot
 * see an api whose database schema is behind its code. Its global setup refuses
 * to start on a stack that is not ready. The default (mocked, CI) projects
 * ignore `tests/e2e/stack/**` entirely, so they behave exactly as before.
 */
const STACK = process.env['BEAI_E2E_STACK'] === '1'
// Resolved (and origin-checked) only for the stack tier, so a bad value never affects CI.
const STACK_URL = STACK ? resolveStackUrl() : ''

export default defineConfig({
  testDir: './tests/e2e',
  ...(STACK
    ? {
        testMatch: 'stack/**/*.stack.spec.ts',
        globalSetup: './tests/e2e/support/stack-global-setup.ts',
      }
    : { testIgnore: '**/stack/**' }),
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: STACK ? 0 : process.env['CI'] ? 2 : 0,
  // A test that fails and then passes on a retry is reported as "flaky" and, by
  // default, leaves the run green. That is exactly how a race (an assertion that
  // beats the request it checks, a banner that arrives a frame late) stays in a
  // suite for months: nobody is told. With this set the retry still happens and
  // its trace is still kept, but the run FAILS, so the flake has to be fixed
  // rather than absorbed. `retries` stays: it is what produces the trace.
  failOnFlakyTests: true,
  workers: STACK || process.env['CI'] ? 1 : undefined,
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
    baseURL: STACK ? STACK_URL : 'http://127.0.0.1:4173',
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

  projects: STACK
    ? [
        { name: 'stack-chromium', use: { ...devices['Desktop Chrome'] } },
        { name: 'stack-webkit', use: { ...devices['Desktop Safari'] } },
      ]
    : [
        {
          name: 'chromium',
          use: { ...devices['Desktop Chrome'] },
        },
        {
          name: 'webkit',
          use: { ...devices['Desktop Safari'] },
        },
      ],

  // Generate the static SPA and serve it with SPA fallback (-s). Readiness is
  // checked against the /health route (served as the SPA shell → 200).
  webServer: STACK
    ? undefined
    : {
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
