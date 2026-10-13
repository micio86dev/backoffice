/**
 * analytics.client.ts — loads GA4 only when a measurement id is configured AND
 * the operator granted consent. The policy lives in pure functions tested
 * elsewhere; what is held here is the wiring: nothing loads without consent,
 * a mid-visit grant loads it exactly once, and page views carry the redacted
 * path.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  ANALYTICS_CONSENT_EVENT,
  ANALYTICS_CONSENT_KEY,
} from '../../../app/utils/analytics-consent'

type AfterEach = (to: { fullPath: string }) => void

let afterEachHook: AfterEach | undefined
let listeners: Array<[string, EventListenerOrEventListenerObject]> = []

function runPlugin(options: { id: string; path?: string }) {
  vi.stubGlobal(
    'useRuntimeConfig',
    vi.fn(() => ({ public: { gaMeasurementId: options.id } }))
  )
  vi.stubGlobal(
    'useRouter',
    vi.fn(() => ({
      currentRoute: { value: { fullPath: options.path ?? '/projects' } },
      afterEach: (hook: AfterEach) => {
        afterEachHook = hook
      },
    }))
  )

  return import('../../../app/plugins/analytics.client').then((m) => (m.default as () => void)())
}

// Recorded, not inserted: happy-dom would try (and refuse) to fetch the real
// script and report the refusal on stderr.
let appended: HTMLScriptElement[] = []
const gaScripts = () => appended

describe('analytics.client.ts', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('defineNuxtPlugin', (setup: unknown) => setup)
    afterEachHook = undefined
    appended = []
    vi.spyOn(document.head, 'appendChild').mockImplementation(((node: Node) => {
      appended.push(node as HTMLScriptElement)
      return node
    }) as typeof document.head.appendChild)
    const realAdd = window.addEventListener.bind(window)
    vi.spyOn(window, 'addEventListener').mockImplementation(((
      type: string,
      listener: EventListenerOrEventListenerObject
    ) => {
      listeners.push([type, listener])
      realAdd(type, listener)
    }) as typeof window.addEventListener)
  })

  afterEach(() => {
    for (const [type, listener] of listeners) window.removeEventListener(type, listener)
    listeners = []
    vi.restoreAllMocks()
    delete window.gtag
    delete window.dataLayer
    window.localStorage.clear()
  })

  it('loads nothing without consent, and sends no page views', async () => {
    await runPlugin({ id: 'G-TEST' })

    expect(gaScripts()).toHaveLength(0)
    expect(window.gtag).toBeUndefined()

    afterEachHook?.({ fullPath: '/projects/1' })
    expect(window.dataLayer).toBeUndefined()
  })

  it('loads nothing when consent is granted but no measurement id is configured', async () => {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, 'granted')

    await runPlugin({ id: '' })

    expect(gaScripts()).toHaveLength(0)
  })

  it('with consent and an id, injects the script once and configures GA with advertising signals denied', async () => {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, 'granted')

    await runPlugin({ id: 'G-TEST', path: '/projects' })

    const script = gaScripts()[0]!
    expect(gaScripts()).toHaveLength(1)
    expect(script.src).toContain('googletagmanager.com/gtag/js?id=G-TEST')

    const calls = (window.dataLayer as ArrayLike<unknown>[]).map((a) => Array.from(a))
    expect(calls.map((c) => c[0])).toEqual(['js', 'consent', 'config'])
    expect(calls[1]).toEqual([
      'consent',
      'default',
      expect.objectContaining({
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
        analytics_storage: 'granted',
      }),
    ])
    expect(calls[2]![1]).toBe('G-TEST')
    expect(calls[2]![2]).toMatchObject({ send_page_view: false, page_path: '/projects' })
  })

  it('starts after a mid-visit grant, and a second grant does not re-initialise the container', async () => {
    await runPlugin({ id: 'G-TEST' })
    expect(window.dataLayer).toBeUndefined()

    window.dispatchEvent(new Event(ANALYTICS_CONSENT_EVENT))
    window.dispatchEvent(new Event(ANALYTICS_CONSENT_EVENT))

    expect(gaScripts()).toHaveLength(1)
    const jsCalls = (window.dataLayer as ArrayLike<unknown>[]).filter(
      (a) => Array.from(a)[0] === 'js'
    )
    expect(jsCalls).toHaveLength(1)
  })

  it('sends each navigation as a page_view with the redacted path and no location', async () => {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, 'granted')
    await runPlugin({ id: 'G-TEST' })
    const gtag = vi.fn()
    window.gtag = gtag

    afterEachHook?.({ fullPath: '/participants/42?email=a@b.it' })

    expect(gtag).toHaveBeenCalledTimes(1)
    const [event, name, payload] = gtag.mock.calls[0]!
    expect([event, name]).toEqual(['event', 'page_view'])
    expect(payload.page_location).toBe('')
    expect(payload.page_path).toBe('/participants/:id')
  })
})
