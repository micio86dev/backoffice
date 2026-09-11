import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Proves the scrubber is actually WIRED to the SDK, not merely present.
 *
 * Every other test in `sentry-scrub.spec.ts` calls `scrubSentryEvent` /
 * `scrubBreadcrumb` directly. None of them proves the SDK ever calls them — and
 * that gap was demonstrated, not theorised: deleting BOTH `beforeSend` and
 * `beforeBreadcrumb` from the `Sentry.init()` call left the whole suite green.
 * Roughly 900 lines of privacy-critical redaction could be disconnected from
 * Sentry without one assertion going red.
 *
 * The source-text greps that used to stand in for this were the anti-pattern
 * this repo already names: "a token test must read a computed style, not grep
 * the stylesheet for a hex string — the hex was present the whole time in the
 * known-broken version". So these assertions run the captured hooks against a
 * marker string instead of looking for their names in the file.
 */

const initSpy = vi.fn()

vi.mock('@sentry/nuxt', () => ({
  init: (options: unknown) => initSpy(options),
}))

const runtimeConfig = {
  public: { sentryDsn: 'https://public@sentry.example.test/42', sentryEnvironment: 'test' },
}

vi.stubGlobal('useRuntimeConfig', () => runtimeConfig)

type InitOptions = {
  beforeSend?: (event: unknown) => unknown
  beforeBreadcrumb?: (breadcrumb: unknown) => unknown
  attachProps?: boolean
  sendDefaultPii?: boolean
}

async function loadClientConfig(): Promise<InitOptions> {
  vi.resetModules()
  initSpy.mockClear()

  await import('../../sentry.client.config')

  expect(initSpy, 'Sentry.init was never called').toHaveBeenCalledTimes(1)

  return initSpy.mock.calls[0]?.[0] as InitOptions
}

describe('the scrubber is connected to the SDK, not just defined beside it', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  // `runtimeConfig` is a module-scope object shared by every case, so the
  // empty-DSN case below must put it back.
  afterEach(() => {
    runtimeConfig.public.sentryDsn = 'https://public@sentry.example.test/42'
  })

  it('beforeSend actually redacts a candidate id before it leaves', async () => {
    const options = await loadClientConfig()

    expect(options.beforeSend, 'beforeSend is not wired').toBeTypeOf('function')

    const out = options.beforeSend?.({
      extra: { candidate_ref: 'LEAKED-REF' },
      request: { url: 'https://api.beai.io/api/participants/LEAKED-ID' },
    })

    expect(JSON.stringify(out)).not.toContain('LEAKED-REF')
    expect(JSON.stringify(out)).not.toContain('LEAKED-ID')
  })

  it('beforeBreadcrumb actually redacts a candidate id before it leaves', async () => {
    const options = await loadClientConfig()

    expect(options.beforeBreadcrumb, 'beforeBreadcrumb is not wired').toBeTypeOf('function')

    const out = options.beforeBreadcrumb?.({
      category: 'fetch',
      data: { url: 'https://api.beai.io/api/participants/LEAKED-ID' },
    })

    expect(JSON.stringify(out)).not.toContain('LEAKED-ID')
  })

  it('Vue props are not attached, and PII is pinned off', async () => {
    const options = await loadClientConfig()

    // attachProps is the ONLY thing between a plaintext password typed into an
    // `<Input v-model>` and Sentry: the value arrives under the framework's key
    // `modelValue`, which a denylist keyed on field names cannot see. Asserted
    // on the captured options object, so moving it out of the literal fails.
    expect(options.attachProps).toBe(false)
    expect(options.sendDefaultPii).toBe(false)
  })

  it('does not initialise at all without a DSN', async () => {
    // The guard this pins is the path EVERY deployment without Sentry takes —
    // `runtimeConfig.public.sentryDsn` defaults to ''. Rewriting the guard to
    // `if (true)` left the whole suite green: the wiring cases above stub a real
    // DSN and never re-stub it empty, and `shouldInitSentry('')` tested as a
    // pure function proves the helper works, not that the config file calls it.
    //
    // What the guard prevents is documented and was observed in a browser:
    // `enabled: false` does NOT make the SDK inert — the page still gets a
    // populated `window.__SENTRY__` and the recurring reportAllChanges TypeError.
    vi.resetModules()
    initSpy.mockClear()
    runtimeConfig.public.sentryDsn = ''

    await import('../../sentry.client.config')

    expect(initSpy).not.toHaveBeenCalled()
  })
})
