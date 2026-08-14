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
import {
  getErrorStatus,
  getErrorFields,
  applyServerFieldErrors,
} from '../../../app/utils/http-error'

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

/**
 * applyServerFieldErrors (form-clarity-and-console-warnings, D2) — the
 * generic 422-to-field mapper every submitting form adopts. Generic over the
 * caller's own error-key union `K`, so the `assign` callback's `key`
 * parameter is checked against the caller's local `errors` type, not eroded
 * to `string` at the boundary.
 */
describe('applyServerFieldErrors', () => {
  it('assigns a mapped server field to the caller via the assign callback', () => {
    const error = Object.assign(new Error('422'), {
      status: 422,
      data: { errors: { name: ['The name has already been taken.'] } },
    })
    const map = { name: 'name' } as const
    const assigned: Record<string, string> = {}

    const unmapped = applyServerFieldErrors(error, map, (key, message) => {
      assigned[key] = message
    })

    expect(assigned).toEqual({ name: 'The name has already been taken.' })
    expect(unmapped).toEqual([])
  })

  it('splits a server field at the first "." so an indexed field lands on its parent', () => {
    const error = Object.assign(new Error('422'), {
      status: 422,
      data: { errors: { 'competency_ids.3': ['Invalid competency.'] } },
    })
    const map = { competency_ids: 'competencyIds' } as const
    const assigned: Record<string, string> = {}

    applyServerFieldErrors(error, map, (key, message) => {
      assigned[key] = message
    })

    expect(assigned).toEqual({ competencyIds: 'Invalid competency.' })
  })

  it('returns a de-duplicated list of messages for fields the map does not cover', () => {
    const error = Object.assign(new Error('422'), {
      status: 422,
      data: {
        errors: {
          status: ['Cannot transition from draft to archived.'],
          webhook_secret: ['Cannot transition from draft to archived.'],
        },
      },
    })

    const unmapped = applyServerFieldErrors(error, {}, () => {})

    expect(unmapped).toEqual(['Cannot transition from draft to archived.'])
  })

  it('returns null when the rejection carries no {data:{errors}} body', () => {
    const error = Object.assign(new Error('boom'), { status: 500 })

    const unmapped = applyServerFieldErrors(error, {}, () => {})

    expect(unmapped).toBeNull()
  })
})
