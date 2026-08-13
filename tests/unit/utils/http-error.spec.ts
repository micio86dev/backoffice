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
import { getErrorStatus, getErrorFields } from '../../../app/utils/http-error'

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

/**
 * getErrorFields (Unit 2b support) — extracts a Laravel 422 ValidationException
 * body's per-field message arrays from an ofetch rejection, so every form
 * introduced by this change (Project, organization profile, webhook
 * defaults, user) can map server errors onto the matching field instead of
 * only the form-level banner (admin-backoffice spec, "Form Field Validation
 * And Banner Contract").
 */
describe('getErrorFields', () => {
  it('reads .data.errors from an ofetch-shaped 422 rejection', () => {
    const error = Object.assign(new Error('Unprocessable'), {
      status: 422,
      data: { errors: { name: ['The name has already been taken.'] } },
    })
    expect(getErrorFields(error)).toEqual({ name: ['The name has already been taken.'] })
  })

  it('returns null when there is no .data.errors object', () => {
    expect(getErrorFields(Object.assign(new Error('boom'), { status: 500 }))).toBeNull()
  })

  it('returns null for a non-object error', () => {
    expect(getErrorFields('boom')).toBeNull()
  })
})
