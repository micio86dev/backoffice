/**
 * `applyBrandColor` writes into a live stylesheet, so what it refuses matters
 * as much as what it applies.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { applyBrandColor } from '../../../app/composables/useBrandTheme'

afterEach(() => {
  document.documentElement.style.removeProperty('--primary')
})

describe('applyBrandColor', () => {
  it('applies a valid colour', () => {
    applyBrandColor('#7C3AED')

    expect(document.documentElement.style.getPropertyValue('--primary')).toBe('#7C3AED')
  })

  it('REMOVES the property when the organization has no colour', () => {
    // Removal, not a written default. An unset custom property falls through to
    // the stylesheet's own value — the Quint purple DESIGN.md defines — and
    // writing that constant here would put a second copy of it in the codebase
    // for the two to drift apart.
    applyBrandColor('#7C3AED')
    applyBrandColor(null)

    expect(document.documentElement.style.getPropertyValue('--primary')).toBe('')
  })

  it('refuses anything that is not a hex colour, and clears instead', () => {
    // The API validates and the database constrains, and this checks anyway: a
    // writer that trusts its input because something upstream promised to check
    // is how an injection survives a refactor.
    applyBrandColor('#7C3AED')
    applyBrandColor('red; } body { display: none } .x{')

    expect(document.documentElement.style.getPropertyValue('--primary')).toBe('')
  })

  it('refuses a payload that would close the declaration', () => {
    applyBrandColor('#123456; --x: y')

    expect(document.documentElement.style.getPropertyValue('--primary')).toBe('')
  })

  it('accepts both cases', () => {
    applyBrandColor('#aabbcc')
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe('#aabbcc')

    applyBrandColor('#AABBCC')
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe('#AABBCC')
  })

  it('refuses three-digit shorthand, matching the server', () => {
    // One canonical form. A client that accepted `#abc` would let an operator
    // set a colour the API then rejects.
    applyBrandColor('#abc')

    expect(document.documentElement.style.getPropertyValue('--primary')).toBe('')
  })
})
