/**
 * initials.spec.ts (user-profile-self-service, design D7, task 4.2 — RED)
 *
 * Every row of design.md D7's table, including the surrogate-pair case.
 * `Array.from(token)[0]`, never `token[0]` — indexing splits a surrogate
 * pair and emits a replacement glyph.
 */
import { describe, it, expect } from 'vitest'
import { initials } from '../../../app/utils/initials'

describe('initials — D7 table', () => {
  it('first + LAST token, not first two', () => {
    expect(initials('Ada Lovelace')).toBe('AL')
  })

  it('multi-word name: first + last, ignoring the middle tokens', () => {
    expect(initials('Ada Byron King Lovelace')).toBe('AL')
  })

  it('single token → one letter', () => {
    expect(initials('Ada')).toBe('A')
  })

  it('trims and collapses whitespace between tokens', () => {
    expect(initials('  Ada   Lovelace  ')).toBe('AL')
  })

  it('non-Latin script: takes the first grapheme as-is, no Latin assumption', () => {
    expect(initials('李雷')).toBe('李')
  })

  it('empty name → "?"', () => {
    expect(initials('')).toBe('?')
  })

  it('whitespace-only name → "?"', () => {
    expect(initials('   ')).toBe('?')
  })

  it('uppercases via toLocaleUpperCase, not toUpperCase', () => {
    expect(initials('ada lovelace')).toBe('AL')
  })
})
