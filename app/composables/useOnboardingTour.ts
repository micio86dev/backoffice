/**
 * useOnboardingTour — the role-aware step list + state machine for the
 * first-login coach-mark tour (backoffice-role-aware-onboarding-guide, T2).
 *
 * PURE LOGIC ONLY. No element refs, no `getBoundingClientRect`, nothing
 * DOM-related — resolving each step's on-screen target is the T4 organism's
 * job, not this composable's.
 *
 * Steps mirror the SAME filtered nav list `SidebarNav.vue` renders: `NAV_ITEMS`
 * (`nav-items.ts`) filtered by the published `can(ability)` map, then by
 * `visibleNavItemsFor` for the superadmin-scope rule — never a hardcoded nav
 * list, and never `roles.includes(...)`. A final `kind: 'help'` step, not
 * tied to any nav item, always closes the tour on the existing Help button.
 */
import { computed, readonly, ref } from 'vue'
import { useCurrentUser } from './useCurrentUser'
import { NAV_ITEMS } from '../utils/nav-items'
import { visibleNavItemsFor } from '../utils/nav-visibility'
import { hasSeenOnboardingTour, markOnboardingTourSeen } from '../utils/onboarding-storage'

export interface NavOnboardingStep {
  kind: 'nav'
  to: string
  labelKey: string
  icon: unknown
}

export interface HelpOnboardingStep {
  kind: 'help'
}

export type OnboardingStep = NavOnboardingStep | HelpOnboardingStep

export interface UseOnboardingTourOptions {
  /**
   * Injected for testability, same signature as `onboarding-storage.ts`.
   * Defaults to `window.localStorage` when available (never assumed on the
   * server, where `window` does not exist).
   */
  storage?: Storage | undefined
  /**
   * The superadmin scope-narrowing inputs `visibleNavItemsFor` needs
   * (`nav-visibility.ts`). Not a permission — a superadmin passes every
   * ability gate — it is whether a client-scope page has an answer to
   * "whose data?" yet. Default to the UNRESTRICTED case (matching
   * `SidebarNav.vue`'s own refs before its async resolution), so an
   * ordinary operator is never affected by this parameter at all.
   */
  canSwitchClients?: boolean
  actingClientId?: number | null
}

function defaultStorage(): Storage | undefined {
  return typeof window === 'undefined' ? undefined : window.localStorage
}

export function useOnboardingTour(options: UseOnboardingTourOptions = {}) {
  const storage = options.storage ?? defaultStorage()
  const canSwitchClients = options.canSwitchClients ?? false
  const actingClientId = options.actingClientId ?? null

  const { user, can } = useCurrentUser()

  /**
   * Same TWO filters `SidebarNav.vue`'s `visibleNavItems` computed applies,
   * in the same order: `requires` asks whether the server would let this
   * viewer reach the page at all; `visibleNavItemsFor` asks whether the page
   * means anything for them yet (the superadmin "no client selected" case).
   */
  const steps = computed<OnboardingStep[]>(() => {
    const abilityFiltered = NAV_ITEMS.filter((item) => {
      // `as const` gives each literal only the keys it was written with, so
      // an item with no `requires` has no such property at all rather than
      // one set to `undefined` — same `'requires' in item` narrowing
      // `SidebarNav.vue`'s own filter uses over the identical literal type.
      const requires = 'requires' in item ? item.requires : undefined
      return requires === undefined || can(requires)
    })
    const visible = visibleNavItemsFor(abilityFiltered, { canSwitchClients, actingClientId })

    const navSteps: OnboardingStep[] = visible.map((item) => ({
      kind: 'nav',
      to: item.to,
      labelKey: item.labelKey,
      icon: item.icon,
    }))

    // The help step always closes the tour, anchored on the existing Help
    // button rather than any nav item — its on-screen target is resolved by
    // the T4 organism, not here.
    return [...navSteps, { kind: 'help' }]
  })

  const currentIndex = ref(0)
  const currentStep = computed(() => steps.value[currentIndex.value])

  function next(): void {
    currentIndex.value = Math.min(currentIndex.value + 1, steps.value.length - 1)
  }

  function back(): void {
    currentIndex.value = Math.max(currentIndex.value - 1, 0)
  }

  /**
   * `null` when the current user has not loaded yet — there is nothing to
   * key the "seen" flag on, so `hasSeenTour` reads as false (the tour is
   * offered, harmlessly, rather than assumed already seen) and `markSeen()`
   * has nothing to record.
   */
  const userId = computed<string | null>(() => {
    const id = user.value?.id
    return id === undefined || id === null ? null : String(id)
  })

  const hasSeenTour = computed(() => {
    const id = userId.value
    return id === null ? false : hasSeenOnboardingTour(storage, id)
  })

  /**
   * Keyed by USER ID, never role (onboarding-storage.ts): a role change is
   * not a first login, and must not silently re-trigger the tour for the
   * same person.
   */
  function markSeen(): void {
    const id = userId.value
    if (id === null) return
    markOnboardingTourSeen(storage, id)
  }

  /**
   * `skip()` (opted out early) and `finish()` (completed all steps) both
   * mark the tour seen — the SAME outcome for "don't show this again" — but
   * stay two distinct functions so a future analytics/callback need can tell
   * them apart without reshaping this composable's surface.
   */
  function skip(): void {
    markSeen()
  }

  function finish(): void {
    markSeen()
  }

  return {
    steps,
    currentIndex: readonly(currentIndex),
    currentStep,
    next,
    back,
    skip,
    finish,
    hasSeenTour,
    markSeen,
  }
}
