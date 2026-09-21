import { describe, expect, it } from 'vitest'
import { hasSeenOnboardingTour, markOnboardingTourSeen } from '~/utils/onboarding-storage'

/**
 * Onboarding tour "seen" flag — keyed per USER, not per role.
 *
 * A role change (e.g. viewer promoted to operator) must not silently
 * re-trigger the tour for the same person: they already know where the
 * sidebar is, and a promotion is not a first login.
 *
 * Same defensive posture as analytics-consent.ts: no storage, a throwing
 * storage, or a write that fails must never crash the app. Unlike consent,
 * there is no "default to no" regulatory reason here — a blocked/unavailable
 * storage simply reports "not seen" (the tour shows, non-blockingly, again)
 * and a blocked write silently no-ops.
 */

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

describe('hasSeenOnboardingTour', () => {
  it('is false when nothing has been stored for this user', () => {
    expect(hasSeenOnboardingTour(storageWith(null), 'user-1')).toBe(false)
  })

  it('is false when there is no storage at all (SSR has no localStorage)', () => {
    expect(hasSeenOnboardingTour(undefined, 'user-1')).toBe(false)
  })

  it('is false when storage throws (private mode, storage blocked by policy)', () => {
    const hostile = {
      getItem: () => {
        throw new Error('SecurityError')
      },
    } as unknown as Storage

    expect(hasSeenOnboardingTour(hostile, 'user-1')).toBe(false)
  })

  it('is true once markOnboardingTourSeen has recorded this user', () => {
    const { storage } = recordingStorage()

    markOnboardingTourSeen(storage, 'user-1')

    expect(hasSeenOnboardingTour(storage, 'user-1')).toBe(true)
  })

  it('is keyed per user id, not shared: a different user on the same storage has not seen it', () => {
    const { storage } = recordingStorage()

    markOnboardingTourSeen(storage, 'user-1')

    expect(hasSeenOnboardingTour(storage, 'user-2')).toBe(false)
  })

  it('stays true across a role change for the same user id', () => {
    // The whole point of keying by userId rather than role: a promotion from
    // viewer to operator is not a first login, and must not silently
    // re-trigger the tour for a person who already dismissed it.
    const { storage } = recordingStorage()

    markOnboardingTourSeen(storage, 'user-1')

    expect(hasSeenOnboardingTour(storage, 'user-1')).toBe(true)
  })
})

describe('markOnboardingTourSeen', () => {
  it('does nothing when there is no storage at all', () => {
    expect(() => markOnboardingTourSeen(undefined, 'user-1')).not.toThrow()
  })

  it('does not throw when storage refuses to write', () => {
    const hostile = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    } as unknown as Storage

    expect(() => markOnboardingTourSeen(hostile, 'user-1')).not.toThrow()
  })
})
