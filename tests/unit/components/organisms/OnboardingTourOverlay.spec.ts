/**
 * OnboardingTourOverlay (backoffice-role-aware-onboarding-guide, T4).
 *
 * Integration-level on purpose: only `useCurrentUser` and `useSuperadmin`
 * are mocked (the two real network boundaries), so `useOnboardingTour.ts`,
 * `nav-items.ts`, `nav-visibility.ts` and `onboarding-storage.ts` all run
 * for real — this proves the WIRING, not a mock echoing this file's own
 * assumptions back at it.
 *
 * `localStorage` is real (jsdom), cleared per test — the composable's
 * default `defaultStorage()` reads `window.localStorage` when no override
 * is passed, which is exactly how the component calls it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import OnboardingTourOverlay from '../../../../app/components/organisms/OnboardingTourOverlay.vue'

const canMock = vi.fn<(ability: string) => boolean>(() => true)
const ensureLoadedMock = vi.fn()
// `useOnboardingTour.ts` reads `useCurrentUser().user.value.id` directly
// (not through `ensureLoaded()`'s return value), so this mock mirrors the
// real composable's shape: a plain ref-like object `ensureLoadedMock`'s
// default implementation populates as a side effect, exactly like the real
// `load()` populating `current.value` before the `user` computed reads it.
const userMock: { value: { id: number } | null } = { value: null }

vi.mock('../../../../app/composables/useCurrentUser', () => ({
  useCurrentUser: () => ({ ensureLoaded: ensureLoadedMock, can: canMock, user: userMock }),
}))

const fetchClientsMock = vi.fn().mockResolvedValue({ data: [], acting_organization_id: null })

vi.mock('../../../../app/composables/useSuperadmin', () => ({
  useSuperadmin: () => ({ fetchClients: fetchClientsMock }),
}))

const paramsAwareT = (key: string, params?: Record<string, unknown>) =>
  params ? `${key}|${JSON.stringify(params)}` : key

let wrapper: VueWrapper | undefined

function mountOverlay() {
  wrapper = mount(OnboardingTourOverlay, {
    attachTo: document.body,
    global: { mocks: { $t: paramsAwareT } },
  })
  return wrapper
}

function panel(): HTMLElement | null {
  return document.querySelector('[data-testid="onboarding-tour"]')
}

describe('OnboardingTourOverlay', () => {
  beforeEach(() => {
    localStorage.clear()
    // Permissive for the four other gated nav items, but NOT
    // 'clients.viewAny' — the component itself reads that exact ability to
    // decide whether to resolve the superadmin scope-narrowing branch, and
    // an ordinary operator (every test below except the two that override
    // this) genuinely never has it.
    canMock.mockReset().mockImplementation((ability: string) => ability !== 'clients.viewAny')
    userMock.value = { id: 1 }
    ensureLoadedMock.mockReset().mockImplementation(async () => {
      userMock.value = { id: 1 }
      return {
        user: { id: 1, name: 'Ada Lovelace', email: 'ada@example.test', locale: 'en' },
        organization: null,
        roles: ['operator'],
      }
    })
    fetchClientsMock.mockReset().mockResolvedValue({ data: [], acting_organization_id: null })
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    document.body.innerHTML = ''
  })

  it('opens automatically for a first-time user, on the first step', async () => {
    mountOverlay()
    await flushPromises()

    expect(panel()).not.toBeNull()
    expect(panel()?.textContent).toContain('nav.dashboard')
    expect(panel()?.textContent).toContain('help.topics.dashboard.summary')
    expect(document.querySelector('[data-testid="onboarding-tour-progress"]')?.textContent).toBe(
      'onboardingTour.progress|{"current":1,"total":8}'
    )
  })

  it('does NOT open for a user who has already seen the tour', async () => {
    localStorage.setItem('beai.onboarding.tour-seen.1', 'seen')

    mountOverlay()
    await flushPromises()

    expect(panel()).toBeNull()
  })

  it('does NOT open when the identity fetch fails — no user id to key the flag on', async () => {
    ensureLoadedMock.mockReset().mockRejectedValue(new Error('network'))

    mountOverlay()
    await flushPromises()

    expect(panel()).toBeNull()
  })

  it('hides Back on the first step and advances on Next', async () => {
    mountOverlay()
    await flushPromises()

    expect(document.querySelector('[data-testid="onboarding-tour-back"]')).toBeNull()

    document.querySelector<HTMLButtonElement>('[data-testid="onboarding-tour-next"]')?.click()
    await flushPromises()

    expect(panel()?.textContent).toContain('nav.projects')
    expect(document.querySelector('[data-testid="onboarding-tour-back"]')).not.toBeNull()
  })

  it('Back returns to the previous step', async () => {
    mountOverlay()
    await flushPromises()

    document.querySelector<HTMLButtonElement>('[data-testid="onboarding-tour-next"]')?.click()
    await flushPromises()
    document.querySelector<HTMLButtonElement>('[data-testid="onboarding-tour-back"]')?.click()
    await flushPromises()

    expect(panel()?.textContent).toContain('nav.dashboard')
  })

  it('Skip closes the tour and marks it seen for this user', async () => {
    mountOverlay()
    await flushPromises()

    document.querySelector<HTMLButtonElement>('[data-testid="onboarding-tour-skip"]')?.click()
    await flushPromises()

    expect(panel()).toBeNull()
    expect(localStorage.getItem('beai.onboarding.tour-seen.1')).toBe('seen')
  })

  it('the last step reads "finish", not "next", and closes on click', async () => {
    mountOverlay()
    await flushPromises()

    // 7 nav items reachable by this permissive `can()` mock, plus the
    // trailing help step — see nav-items.ts. Advance to the very last one.
    for (let i = 0; i < 7; i++) {
      document.querySelector<HTMLButtonElement>('[data-testid="onboarding-tour-next"]')?.click()
      await flushPromises()
    }

    expect(panel()?.textContent).toContain('help.label')
    expect(document.querySelector('[data-testid="onboarding-tour-next"]')?.textContent).toBe(
      'onboardingTour.finish'
    )

    document.querySelector<HTMLButtonElement>('[data-testid="onboarding-tour-next"]')?.click()
    await flushPromises()

    expect(panel()).toBeNull()
    expect(localStorage.getItem('beai.onboarding.tour-seen.1')).toBe('seen')
  })

  it('a restricted operator tours only the steps they can actually reach', async () => {
    // Same "requires" gate SidebarNav.vue applies: an operator has none of
    // the platform abilities, so /clients, /avatar-templates, /settings and
    // /catalogue never become steps at all.
    canMock.mockReset().mockReturnValue(false)

    mountOverlay()
    await flushPromises()

    expect(document.querySelector('[data-testid="onboarding-tour-progress"]')?.textContent).toBe(
      'onboardingTour.progress|{"current":1,"total":5}'
    )
  })

  it('highlights the real sidebar target when one is present in the DOM', async () => {
    const target = document.createElement('div')
    target.setAttribute('data-onboarding-target', '/')
    Object.assign(target.style, { position: 'fixed', top: '10px', left: '20px' })
    target.getBoundingClientRect = () =>
      ({ top: 10, left: 20, right: 120, bottom: 30, width: 100, height: 20 }) as DOMRect
    document.body.appendChild(target)

    mountOverlay()
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 320))

    const highlight = document.querySelector<HTMLElement>(
      '[data-testid="onboarding-tour-highlight"]'
    )
    expect(highlight).not.toBeNull()
    expect(highlight?.style.top).toBe('4px')
    expect(highlight?.style.left).toBe('14px')
  })
})
