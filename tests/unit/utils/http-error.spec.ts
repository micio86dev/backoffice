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
  getConflictTemplates,
  applyServerFieldErrors,
  serverMessageCode,
  serverErrorCode,
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
 * getConflictTemplates (pluggable-conversation-llm PR P7, task P7.5 support
 * — RED) — extracts the bound template NAMES from a
 * `{data:{error, templates}}` 409, gated on a specific machine `error` code
 * so it never matches a differently-shaped conflict that happens to carry
 * the same field name.
 */
describe('getConflictTemplates', () => {
  it('reads .data.templates from a matching 409 rejection', () => {
    const error = Object.assign(new Error('Conflict'), {
      status: 409,
      data: {
        error: 'credential_in_use',
        message: 'in use',
        templates: ['Sales bot', 'Support bot'],
      },
    })
    expect(getConflictTemplates(error, 'credential_in_use')).toEqual(['Sales bot', 'Support bot'])
  })

  it('returns null when the error code does not match', () => {
    const error = Object.assign(new Error('Conflict'), {
      status: 409,
      data: { error: 'template_active', message: 'active', templates: ['Sales bot'] },
    })
    expect(getConflictTemplates(error, 'credential_in_use')).toBeNull()
  })

  it('returns null when templates is missing or not a string array', () => {
    const error = Object.assign(new Error('Conflict'), {
      status: 409,
      data: { error: 'credential_in_use', message: 'in use', templates: [1, 2] },
    })
    expect(getConflictTemplates(error, 'credential_in_use')).toBeNull()
  })

  it('returns null for a non-object error', () => {
    expect(getConflictTemplates('boom', 'credential_in_use')).toBeNull()
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

describe('serverMessageCode', () => {
  it('extracts a machine-facing code from the body', () => {
    // The API answers refusals with a stable snake_case code in `message`, so
    // the layer that knows the operator's locale can render it in their
    // language rather than printing whatever English the server happened to
    // have compiled in.
    expect(serverMessageCode({ data: { message: 'entry_link_participant_completed' } })).toBe(
      'entry_link_participant_completed'
    )
  })

  it('refuses a prose message, which is NOT a code', () => {
    // The framework's own 422 puts the English sentence "The given data was
    // invalid." in `message`. Handing that to a translator prints it verbatim
    // under a lookup miss — an English sentence in front of an Italian
    // operator, which is the exact failure this whole mechanism exists to end.
    expect(serverMessageCode({ data: { message: 'The given data was invalid.' } })).toBeNull()
  })

  it('returns null for a failure that carries no body at all', () => {
    // A network error. The caller falls back to its own generic copy.
    expect(serverMessageCode(new Error('offline'))).toBeNull()
    expect(serverMessageCode(null)).toBeNull()
    expect(serverMessageCode({ data: null })).toBeNull()
    expect(serverMessageCode({ data: { message: 42 } })).toBeNull()
  })
})

/**
 * A 422 can refuse for a reason no FIELD can fix. `POST /api/projects` answers
 * a `potential` project against an unseeded catalogue with
 * `{message: "Potential catalog incomplete: ...", code: "POTENTIAL_CATALOG_INCOMPLETE"}`
 * and NO `errors` object — so every form that only maps field errors fell back
 * to "could not save, check the highlighted fields" while highlighting nothing,
 * telling the operator to fix fields that were never the problem.
 *
 * `serverMessageCode` cannot carry this: it reads `data.message` and only
 * accepts lowercase snake_case, while this contract puts an UPPERCASE code in
 * `data.code` beside human prose in `data.message`.
 */
describe('serverErrorCode', () => {
  it('reads an uppercase machine code from data.code', () => {
    expect(
      serverErrorCode({
        data: {
          message: 'Potential catalog incomplete: MTG/LAT competencies are not seeded.',
          code: 'POTENTIAL_CATALOG_INCOMPLETE',
        },
      })
    ).toBe('POTENTIAL_CATALOG_INCOMPLETE')
  })

  it('refuses prose, so a sentence can never be rendered as a translation key', () => {
    expect(serverErrorCode({ data: { code: 'Something went badly wrong.' } })).toBeNull()
  })

  it('returns null when there is no code', () => {
    expect(serverErrorCode({ data: { message: 'nope' } })).toBeNull()
    expect(serverErrorCode({})).toBeNull()
    expect(serverErrorCode(null)).toBeNull()
  })
})
