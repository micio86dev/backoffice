/**
 * `applyBrandColor` writes into a live stylesheet, so what it refuses matters
 * as much as what it applies.
 *
 * WHICH TOKENS IT WRITES IS THE WHOLE BUG (fix/backoffice-brand-color-tokens).
 * It used to set `--primary`, and nothing reads that: this app is Tailwind v4,
 * where `@theme { --color-primary: #771aaf }` is a LITERAL and the utilities
 * `bg-primary` / `text-primary` / `border-primary` compile to
 * `var(--color-primary)`. main.css also states that `--color-primary` is
 * deliberately NOT bridged to `var(--primary)`, because re-declaring it inside
 * `@theme inline` would shadow the literal and regress `bg-primary` to
 * shadcn's grey. So the organization's colour was stored, written, and read by
 * no one — every operator saw the Quint purple whatever they configured.
 *
 * The sidebar is asserted for the same reason: it is the largest block of
 * brand colour on the screen and it carries its OWN hardcoded oklch, so
 * painting `--color-primary` alone leaves it purple and the fix looks broken.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { applyBrandColor, BRAND_COLOR_TOKENS } from '../../../app/composables/useBrandTheme'

function read(token: string): string {
  return document.documentElement.style.getPropertyValue(token)
}

afterEach(() => {
  for (const token of BRAND_COLOR_TOKENS) {
    document.documentElement.style.removeProperty(token)
  }
})

describe('applyBrandColor', () => {
  it('paints the token the Tailwind utilities actually read', () => {
    applyBrandColor('#7C3AED')

    expect(read('--color-primary')).toBe('#7C3AED')
  })

  it('paints the sidebar, which carries its own hardcoded brand purple', () => {
    applyBrandColor('#7C3AED')

    expect(read('--sidebar')).toBe('#7C3AED')
    expect(read('--sidebar-primary')).toBe('#7C3AED')
  })

  it('REMOVES every token when the organization has no colour', () => {
    // Removal, not a written default. An unset custom property falls through to
    // the stylesheet's own value — the Quint purple DESIGN.md defines — and
    // writing that constant here would put a second copy of it in the codebase
    // for the two to drift apart.
    applyBrandColor('#7C3AED')
    applyBrandColor(null)

    for (const token of BRAND_COLOR_TOKENS) {
      expect(read(token)).toBe('')
    }
  })

  it('refuses anything that is not a hex colour, and clears instead', () => {
    // The API validates and the database constrains, and this checks anyway: a
    // writer that trusts its input because something upstream promised to check
    // is how an injection survives a refactor.
    applyBrandColor('#7C3AED')
    applyBrandColor('red; } body { display: none } .x{')

    for (const token of BRAND_COLOR_TOKENS) {
      expect(read(token)).toBe('')
    }
  })

  it('refuses a payload that would close the declaration', () => {
    applyBrandColor('#123456; --x: y')

    expect(read('--color-primary')).toBe('')
  })

  it('accepts both cases', () => {
    applyBrandColor('#aabbcc')
    expect(read('--color-primary')).toBe('#aabbcc')

    applyBrandColor('#AABBCC')
    expect(read('--color-primary')).toBe('#AABBCC')
  })
})
