/**
 * useOnboardingTour — the role-aware step list + state machine for the
 * first-login coach-mark tour (backoffice-role-aware-onboarding-guide, T2).
 *
 * Pure logic: no DOM, no element refs, no positioning. Steps mirror the SAME
 * filtered nav item list SidebarNav.vue renders (`NAV_ITEMS` from
 * `nav-items.ts`, filtered by `can()` then by `visibleNavItemsFor`), plus
 * one final `kind: 'help'` step that is not tied to a nav item — its target
 * is resolved later by the T4 organism.
 *
 * Mirrors SidebarNav.spec.ts's mocking convention: `useCurrentUser` mocked
 * at the module boundary with a `can` spy, defaulting to permissive so tests
 * about ordering/count are not also tests about authorization.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const canMock = vi.fn<(ability: string) => boolean>(() => true)
const userMock: { value: { id: number } | null } = { value: { id: 1 } }

vi.mock('../../../app/composables/useCurrentUser', () => ({
  useCurrentUser: () => ({ can: canMock, user: userMock }),
}))

function storageWith(value: string | null): Storage {
  return {
    getItem: () => value,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
    key: () => null,
    length: 0,
  }
}

function recordingStorage(): { storage: Storage; written: Record<string, string> } {
  const written: Record<string, string> = {}

  return {
    written,
    storage: {
      getItem: (k: string) => written[k] ?? null,
      setItem: (k: string, v: string) => {
        written[k] = v
      },
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    },
  }
}

describe('useOnboardingTour', () => {
  beforeEach(() => {
    canMock.mockReset().mockReturnValue(true)
    userMock.value = { id: 1 }
  })

  it('computes one step per visible nav item, plus one final help step', async () => {
    const { useOnboardingTour } = await import('../../../app/composables/useOnboardingTour')

    const tour = useOnboardingTour({ storage: storageWith(null) })

    const navSteps = tour.steps.value.filter((s) => s.kind === 'nav')
    const helpSteps = tour.steps.value.filter((s) => s.kind === 'help')

    expect(navSteps.length).toBeGreaterThan(0)
    expect(helpSteps).toHaveLength(1)
    // The help step is anchored last, ending the tour on the existing Help
    // button rather than in the middle of the nav walk.
    expect(tour.steps.value[tour.steps.value.length - 1]?.kind).toBe('help')
  })

  it('drops nav items the current role cannot reach, via can() — never roles.includes', async () => {
    canMock.mockReset().mockImplementation((ability: string) => ability !== 'users.viewAny')

    const { useOnboardingTour } = await import('../../../app/composables/useOnboardingTour')

    const tour = useOnboardingTour({ storage: storageWith(null) })

    const navSteps = tour.steps.value.filter((s) => s.kind === 'nav')
    expect(navSteps.some((s) => s.kind === 'nav' && s.to === '/settings')).toBe(false)
    expect(canMock).toHaveBeenCalledWith('users.viewAny')
  })

  it('hides client-scope steps for a superadmin with no acting client (same rule as visibleNavItemsFor)', async () => {
    const { useOnboardingTour } = await import('../../../app/composables/useOnboardingTour')

    const tour = useOnboardingTour({
      storage: storageWith(null),
      canSwitchClients: true,
      actingClientId: null,
    })

    const navSteps = tour.steps.value.filter((s) => s.kind === 'nav')
    expect(navSteps.some((s) => s.kind === 'nav' && s.to === '/projects')).toBe(false)
    expect(navSteps.some((s) => s.kind === 'nav' && s.to === '/')).toBe(false)
  })

  it('shows client-scope steps again once an acting client is selected', async () => {
    const { useOnboardingTour } = await import('../../../app/composables/useOnboardingTour')

    const tour = useOnboardingTour({
      storage: storageWith(null),
      canSwitchClients: true,
      actingClientId: 7,
    })

    const navSteps = tour.steps.value.filter((s) => s.kind === 'nav')
    expect(navSteps.some((s) => s.kind === 'nav' && s.to === '/projects')).toBe(true)
  })

  it('starts at step index 0', async () => {
    const { useOnboardingTour } = await import('../../../app/composables/useOnboardingTour')

    const tour = useOnboardingTour({ storage: storageWith(null) })

    expect(tour.currentIndex.value).toBe(0)
    expect(tour.currentStep.value).toBe(tour.steps.value[0])
  })

  it('next() advances the index and back() retreats it, without going out of bounds', async () => {
    const { useOnboardingTour } = await import('../../../app/composables/useOnboardingTour')

    const tour = useOnboardingTour({ storage: storageWith(null) })
    const total = tour.steps.value.length

    tour.back()
    expect(tour.currentIndex.value).toBe(0)

    for (let i = 0; i < total + 2; i++) tour.next()
    expect(tour.currentIndex.value).toBe(total - 1)

    tour.back()
    expect(tour.currentIndex.value).toBe(total - 2)
  })

  it('hasSeenTour reflects T1 storage for the current user id, not a hardcoded default', async () => {
    const { storage } = recordingStorage()
    const { useOnboardingTour } = await import('../../../app/composables/useOnboardingTour')

    const fresh = useOnboardingTour({ storage })
    expect(fresh.hasSeenTour.value).toBe(false)

    fresh.markSeen()

    const again = useOnboardingTour({ storage })
    expect(again.hasSeenTour.value).toBe(true)
  })

  it('is keyed per user id: a different signed-in user on the same storage has not seen it', async () => {
    const { storage } = recordingStorage()
    const { useOnboardingTour } = await import('../../../app/composables/useOnboardingTour')

    userMock.value = { id: 1 }
    useOnboardingTour({ storage }).markSeen()

    userMock.value = { id: 2 }
    expect(useOnboardingTour({ storage }).hasSeenTour.value).toBe(false)
  })

  it('hasSeenTour is false and markSeen() no-ops when the current user has not loaded yet', async () => {
    const { storage } = recordingStorage()
    userMock.value = null

    const { useOnboardingTour } = await import('../../../app/composables/useOnboardingTour')
    const tour = useOnboardingTour({ storage })

    expect(tour.hasSeenTour.value).toBe(false)
    expect(() => tour.markSeen()).not.toThrow()
  })

  it('skip() marks the tour seen for the current user', async () => {
    const { storage } = recordingStorage()
    const { useOnboardingTour } = await import('../../../app/composables/useOnboardingTour')

    useOnboardingTour({ storage }).skip()

    expect(useOnboardingTour({ storage }).hasSeenTour.value).toBe(true)
  })

  it('finish() marks the tour seen for the current user', async () => {
    const { storage } = recordingStorage()
    const { useOnboardingTour } = await import('../../../app/composables/useOnboardingTour')

    useOnboardingTour({ storage }).finish()

    expect(useOnboardingTour({ storage }).hasSeenTour.value).toBe(true)
  })

  it('does not mark the tour seen just by constructing the composable (caller decides whether to mount anything)', async () => {
    const { storage } = recordingStorage()
    const { useOnboardingTour } = await import('../../../app/composables/useOnboardingTour')

    useOnboardingTour({ storage })

    expect(useOnboardingTour({ storage }).hasSeenTour.value).toBe(false)
  })

  it('defaults storage to window.localStorage when none is injected', async () => {
    const { useOnboardingTour } = await import('../../../app/composables/useOnboardingTour')

    // No storage option passed: must not throw, and must use the injectable
    // default rather than crashing on an assumed browser API (jsdom's/happy-
    // dom's window.localStorage is available in this test environment).
    expect(() => useOnboardingTour()).not.toThrow()
  })
})
