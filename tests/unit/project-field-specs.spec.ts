/**
 * project-field-specs.ts (Unit 2b, task 20.1 — RED)
 *
 * Static bounds mirrored from `StoreProjectRequest.php`/`UpdateProjectRequest.php`
 * (design D9 — "no new `/projects/field-specs` endpoint": the project field
 * SET is fixed, unlike the avatar-template field set which varies by
 * provider).
 */
import { describe, it, expect } from 'vitest'
import {
  PROJECT_FIELD_BOUNDS,
  isPauseEveryNCompetenciesValid,
  isNudgeMinCharsValid,
  isUrlLengthValid,
  isProjectUrlValid,
} from '../../app/utils/project-field-specs'

describe('project-field-specs', () => {
  it('exposes the exact bounds validated server-side', () => {
    expect(PROJECT_FIELD_BOUNDS.pauseEveryNCompetencies).toEqual({ min: 1, max: 255 })
    expect(PROJECT_FIELD_BOUNDS.nudgeMinChars).toEqual({ min: 0, max: 65535 })
    expect(PROJECT_FIELD_BOUNDS.urlMaxLength).toBe(2048)
  })

  describe('isPauseEveryNCompetenciesValid', () => {
    it.each([1, 128, 255])('accepts %i (in range)', (value) => {
      expect(isPauseEveryNCompetenciesValid(value)).toBe(true)
    })

    it.each([0, 256, -1])('rejects %i (out of range)', (value) => {
      expect(isPauseEveryNCompetenciesValid(value)).toBe(false)
    })

    it('accepts null/undefined — the field is optional', () => {
      expect(isPauseEveryNCompetenciesValid(null)).toBe(true)
      expect(isPauseEveryNCompetenciesValid(undefined)).toBe(true)
    })
  })

  describe('isNudgeMinCharsValid', () => {
    it.each([0, 40000, 65535])('accepts %i (in range)', (value) => {
      expect(isNudgeMinCharsValid(value)).toBe(true)
    })

    it.each([-1, 65536])('rejects %i (out of range)', (value) => {
      expect(isNudgeMinCharsValid(value)).toBe(false)
    })

    it('accepts null/undefined — the field is optional', () => {
      expect(isNudgeMinCharsValid(null)).toBe(true)
    })
  })

  describe('isUrlLengthValid', () => {
    it('accepts an empty/absent URL — every URL field is optional', () => {
      expect(isUrlLengthValid(null)).toBe(true)
      expect(isUrlLengthValid('')).toBe(true)
    })

    it('accepts a URL at exactly the 2048 boundary', () => {
      const url = `https://example.com/${'a'.repeat(2048 - 'https://example.com/'.length)}`
      expect(url.length).toBe(2048)
      expect(isUrlLengthValid(url)).toBe(true)
    })

    it('rejects a URL one character over the boundary', () => {
      const url = `https://example.com/${'a'.repeat(2049 - 'https://example.com/'.length)}`
      expect(url.length).toBe(2049)
      expect(isUrlLengthValid(url)).toBe(false)
    })
  })
})

describe('isProjectUrlValid', () => {
  it.each([
    ['https://example.com/hook'],
    ['http://localhost:8000/hook'],
    ['https://example.com:8443/a/b?c=d#e'],
  ])('accepts the absolute http(s) URL %s', (value) => {
    expect(isProjectUrlValid(value)).toBe(true)
  })

  it.each([[''], [null], [undefined]])(
    'treats %s as valid — both columns are nullable, empty means "not configured"',
    (value) => {
      expect(isProjectUrlValid(value)).toBe(true)
    }
  )

  it.each([['example.com'], ['/hooks/beai'], ['not a url'], ['http://']])(
    'rejects %s, which is not an absolute address',
    (value) => {
      expect(isProjectUrlValid(value)).toBe(false)
    }
  )

  // Stricter than Laravel's `url` rule on purpose: BEAI dereferences these.
  it.each([['javascript:alert(1)'], ['file:///etc/passwd'], ['ftp://example.com']])(
    'rejects the non-http scheme %s',
    (value) => {
      expect(isProjectUrlValid(value)).toBe(false)
    }
  )

  it('rejects a URL longer than the 2048 cap the server enforces', () => {
    const tooLong = `https://example.com/${'a'.repeat(PROJECT_FIELD_BOUNDS.urlMaxLength)}`

    expect(isProjectUrlValid(tooLong)).toBe(false)
  })
})
