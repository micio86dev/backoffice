/**
 * error-state.ts (D4) — the shared HTTP-rejection → user-facing state map.
 *
 * Each status is asserted SEPARATELY and each assertion also states what the
 * result must NOT be, so a future "simplification" that collapses 409/403/404
 * into one generic error fails here rather than silently degrading three
 * distinct operator messages into one.
 */
import { describe, it, expect } from 'vitest'
import {
  resolveResourceErrorState,
  resourceErrorKey,
  type ResourceErrorState,
} from '../../../app/utils/error-state'

function httpError(status: number): Error & { status: number } {
  return Object.assign(new Error(`HTTP ${status}`), { status })
}

describe('resolveResourceErrorState', () => {
  it('maps 409 to not-ready (temporal, self-resolving — NOT a failure)', () => {
    expect(resolveResourceErrorState(httpError(409))).toBe('not-ready')
  })

  it('maps 403 to forbidden', () => {
    expect(resolveResourceErrorState(httpError(403))).toBe('forbidden')
  })

  it('maps 404 to not-found', () => {
    expect(resolveResourceErrorState(httpError(404))).toBe('not-found')
  })

  it('maps an unmapped status to the generic error state', () => {
    expect(resolveResourceErrorState(httpError(500))).toBe('error')
  })

  it('maps a non-HTTP rejection (network failure, thrown string) to the generic error state', () => {
    expect(resolveResourceErrorState(new Error('Network request failed'))).toBe('error')
    expect(resolveResourceErrorState('boom')).toBe('error')
    expect(resolveResourceErrorState(null)).toBe('error')
  })

  it("reads ofetch's `statusCode` as well as `status`", () => {
    expect(resolveResourceErrorState({ statusCode: 403 })).toBe('forbidden')
  })

  it('produces four MUTUALLY DISTINCT states for 409/403/404/500', () => {
    const states = [409, 403, 404, 500].map((status) =>
      resolveResourceErrorState(httpError(status))
    )

    expect(new Set(states).size).toBe(4)
  })
})

describe('resourceErrorKey', () => {
  const cases: Array<[ResourceErrorState, string]> = [
    ['not-ready', 'notReady'],
    ['forbidden', 'forbidden'],
    ['not-found', 'notFound'],
    ['error', 'error'],
  ]

  it.each(cases)('builds the generic title/message keys for %s', (state, segment) => {
    expect(resourceErrorKey(state, 'title')).toBe(`errors.states.${segment}.title`)
    expect(resourceErrorKey(state, 'message')).toBe(`errors.states.${segment}.message`)
  })

  it('honours a caller-supplied namespace (the report keeps its own wording)', () => {
    expect(resourceErrorKey('not-ready', 'title', 'report.states')).toBe(
      'report.states.notReady.title'
    )
  })

  it('produces four MUTUALLY DISTINCT keys (collapsing states would collide here)', () => {
    const keys = cases.map(([state]) => resourceErrorKey(state, 'title'))

    expect(new Set(keys).size).toBe(4)
  })
})
