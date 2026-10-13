/**
 * i18n-base-url.client.ts — the module's `baseUrl` option is a function, which
 * does not survive the static SPA's JSON-serialised runtime config. The plugin
 * re-installs it on the live config object, before the i18n module reads it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('i18n-base-url.client.ts', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('defineNuxtPlugin', (definition: unknown) => definition)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('runs before the i18n module plugin', async () => {
    const plugin = (await import('../../../app/plugins/i18n-base-url.client')).default as {
      enforce: string
    }

    expect(plugin.enforce).toBe('pre')
  })

  it('installs a baseUrl that resolves to the CURRENT origin on every call', async () => {
    const config = { public: { i18n: {} as { baseUrl?: () => string } } }
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => config)
    )
    const plugin = (await import('../../../app/plugins/i18n-base-url.client')).default as {
      setup: () => void
    }

    plugin.setup()

    vi.stubGlobal('location', { origin: 'https://first.example' })
    expect(config.public.i18n.baseUrl?.()).toBe('https://first.example')

    vi.stubGlobal('location', { origin: 'https://second.example' })
    expect(config.public.i18n.baseUrl?.()).toBe('https://second.example')
  })
})
