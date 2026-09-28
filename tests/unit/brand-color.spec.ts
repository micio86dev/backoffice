/**
 * gga review finding: `useBrandTheme.ts` painted the tenant's brand colour but
 * left the foreground hardcoded white, breaking WCAG AA for a light tenant
 * colour. These are the functions that pick a readable foreground instead.
 */
import { describe, it, expect } from 'vitest'
import { contrastRatio, readableForeground } from '../../app/utils/brand-color'

describe('contrastRatio', () => {
  it('gives the known extremes', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 1)
    expect(contrastRatio('#771aaf', '#771aaf')).toBeCloseTo(1, 5)
  })

  it('is symmetric — the order of the pair cannot change the answer', () => {
    expect(contrastRatio('#771aaf', '#ffffff')).toBeCloseTo(contrastRatio('#ffffff', '#771aaf'), 10)
  })
})

describe('readableForeground', () => {
  it('picks white for a dark colour — the product default, #771aaf, measures 8.2:1 with white', () => {
    expect(readableForeground('#771aaf')).toBe('#ffffff')
    expect(contrastRatio('#771aaf', readableForeground('#771aaf'))).toBeGreaterThanOrEqual(4.5)
  })

  it('picks black for a light colour — the exact bug: white-on-light used to ship unguarded', () => {
    expect(readableForeground('#ffd400')).toBe('#000000')
    expect(contrastRatio('#ffd400', readableForeground('#ffd400'))).toBeGreaterThanOrEqual(4.5)
  })

  it('picks black for pure white and white for pure black — the boundary cases', () => {
    expect(readableForeground('#ffffff')).toBe('#000000')
    expect(readableForeground('#000000')).toBe('#ffffff')
  })

  it('falls back to white (the prior unconditional behaviour) for a value it cannot parse', () => {
    expect(readableForeground('not-a-color')).toBe('#ffffff')
  })
})
