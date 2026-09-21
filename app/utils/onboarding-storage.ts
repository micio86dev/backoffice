/**
 * Onboarding tour "seen" flag.
 *
 * Same defensive-`window` posture as `analytics-consent.ts`: an injected
 * `storage` param for testability, and no storage access — missing,
 * blocked, or throwing — is ever allowed to crash the app.
 *
 * Unlike consent, this is not a regulatory yes/no: it is a non-sensitive UI
 * preference, so there is no "must default to the safe answer" reasoning
 * here. An unavailable storage simply reads as "not seen" (the tour, being
 * non-blocking, shows again) and a blocked write silently no-ops.
 *
 * KEYED PER USER ID, DELIBERATELY NOT PER ROLE. A role change (e.g. viewer
 * promoted to operator) is not a first login — the person already knows
 * where the sidebar is — so re-triggering the tour on every role change
 * would train users to ignore it. `userId` is the STABLE identity across
 * that role change; the sidebar's own filtered contents already adapt via
 * `visibleNavItemsFor`, so the tour content is role-aware even though its
 * "seen" flag is not.
 */

const KEY_PREFIX = 'beai.onboarding.tour-seen.'

const SEEN = 'seen'

function keyFor(userId: string): string {
  return `${KEY_PREFIX}${userId}`
}

/**
 * Whether this user has already dismissed or completed the tour.
 *
 * No storage, an unset key, or a throwing storage all resolve to false — the
 * tour is offered again rather than assumed away, which is the harmless
 * direction for a dismissible, non-blocking coach mark.
 */
export function hasSeenOnboardingTour(storage: Storage | undefined, userId: string): boolean {
  if (storage === undefined) {
    return false
  }

  try {
    return storage.getItem(keyFor(userId)) === SEEN
  } catch {
    // Private mode, or storage blocked by policy. Same outcome as no storage
    // at all: the tour is offered again rather than crashing the page.
    return false
  }
}

/**
 * Records that this user has seen the tour, whether they finished it or
 * skipped it — both are "do not show this again for this person".
 *
 * Failures are swallowed: a tour that breaks the page because storage is
 * full or blocked is a far worse outcome than one that simply reappears on
 * the next visit.
 */
export function markOnboardingTourSeen(storage: Storage | undefined, userId: string): void {
  if (storage === undefined) {
    return
  }

  try {
    storage.setItem(keyFor(userId), SEEN)
  } catch {
    // Nowhere to record it. The dismissal still applies to this page load;
    // it simply cannot be remembered for the next one.
  }
}
