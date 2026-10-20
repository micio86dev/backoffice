/**
 * getErrorFields reads `data.errors` off a rejection the server (or a proxy in
 * front of it) wrote, so the per-field values are untrusted. A value that is
 * not an array of strings used to be cast straight through: `"boom"[0]` is
 * `"b"`, which a form then rendered as the field message, and a number made
 * `applyServerFieldErrors` call `.[0]` on something that has no such member.
 */
import { describe, expect, it } from 'vitest'
import { applyServerFieldErrors, getErrorFields } from '../../app/utils/http-error'

const rejection = (errors: unknown) =>
  Object.assign(new Error('Unprocessable'), { data: { errors } })

describe('getErrorFields with a malformed body', () => {
  it('drops a field whose value is a string and keeps the well-formed ones', () => {
    expect(getErrorFields(rejection({ name: 'boom', email: ['Taken.'] }))).toEqual({
      email: ['Taken.'],
    })
  })

  it('drops a field whose array carries a non-string member', () => {
    expect(getErrorFields(rejection({ name: [42], email: ['Taken.'] }))).toEqual({
      email: ['Taken.'],
    })
  })

  it('returns null when every field is malformed, so the caller shows its generic banner', () => {
    expect(getErrorFields(rejection({ name: 'boom', email: 7 }))).toBeNull()
  })

  it('returns null when errors is an array rather than a field map', () => {
    expect(getErrorFields(rejection(['boom']))).toBeNull()
  })

  it('still returns an empty map for an empty errors object', () => {
    expect(getErrorFields(rejection({}))).toEqual({})
  })
})

describe('applyServerFieldErrors with a malformed body', () => {
  it('never assigns a character of a string value as the message', () => {
    const assigned: string[] = []
    const unmapped = applyServerFieldErrors(
      rejection({ name: 'boom' }),
      { name: 'name' as const },
      (_key, message) => assigned.push(message)
    )

    expect(assigned).toEqual([])
    expect(unmapped).toBeNull()
  })
})
