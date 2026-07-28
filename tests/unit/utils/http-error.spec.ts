/**
 * http-error.ts (PR B3, task 20.1 support — RED)
 *
 * Extracts an HTTP status code from an ofetch/$fetch rejection so callers can
 * distinguish 409 (lifecycle_not_ready, temporal) from 403 (RBAC, permanent)
 * from 404 (not found) instead of collapsing every failure into one generic
 * error state (the whole point of D4's 409 choice — see useEvaluationReport
 * and the participant detail page).
 */
import { describe, it, expect } from 'vitest'
import { getErrorStatus } from '../../../app/utils/http-error'

describe('getErrorStatus', () => {
  it('reads .status when present', () => {
    expect(getErrorStatus(Object.assign(new Error('conflict'), { status: 409 }))).toBe(409)
  })

  it('falls back to .statusCode when .status is absent', () => {
    expect(getErrorStatus(Object.assign(new Error('forbidden'), { statusCode: 403 }))).toBe(403)
  })

  it('returns null for a non-object error', () => {
    expect(getErrorStatus('boom')).toBeNull()
  })

  it('returns null for null', () => {
    expect(getErrorStatus(null)).toBeNull()
  })

  it('returns null when neither status nor statusCode is a number', () => {
    expect(getErrorStatus(Object.assign(new Error('weird'), { status: 'nope' }))).toBeNull()
  })
})
