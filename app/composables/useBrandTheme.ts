/**
 * Paint the organization's primary colour over the product's.
 *
 * WHICH TOKENS, AND WHY THESE
 * ---------------------------
 * This used to set `--primary`, and nothing read it. The app is Tailwind v4:
 * `app/assets/css/main.css` declares `@theme { --color-primary: #771aaf }` as a
 * LITERAL, and the utilities `bg-primary` / `text-primary` / `border-primary`
 * compile to `var(--color-primary)`. main.css also records, at its shadcn
 * bridge, that `--color-primary` is deliberately NOT re-declared as
 * `var(--primary)` inside `@theme inline` — doing so would shadow the literal
 * (the last declaration in a rule wins) and regress `bg-primary` to shadcn's
 * default grey, a bug already confirmed in the frontend's own stylesheet.
 *
 * So `--primary` and `--color-primary` never met: the colour was validated,
 * stored, sent and written, and every operator still saw the Quint purple.
 * The fix is to write the token the compiled CSS actually reads.
 *
 * The sidebar is included because it carries its OWN hardcoded oklch copy of
 * the brand purple (`--sidebar`, `--sidebar-primary`) rather than deriving
 * from `--color-primary`. It is also the largest area of brand colour on the
 * screen, so painting the primary alone would leave the app looking exactly as
 * purple as before and the fix would read as not working. DESIGN.md §8.1
 * already specifies the sidebar AS the primary background, so following the
 * tenant's colour here honours that rule rather than contradicting it.
 *
 * SETS NOTHING WHEN THE ORGANIZATION HAS NO COLOUR, and that is the important
 * half. An unset custom property falls through to the stylesheet's own value,
 * which is the Quint purple DESIGN.md defines. Writing a "default" here would
 * duplicate that constant in a second place, and the two would drift.
 *
 * The value is a `#rrggbb` string validated by an anchored regex at the API AND
 * constrained by a database CHECK, so by the time it arrives it cannot carry a
 * `;` or a `}`. It is re-checked here anyway: this function writes into a
 * stylesheet, and a writer that trusts its input because something upstream
 * promised to check is exactly how an injection survives a refactor.
 */

import { readableForeground } from '~/utils/brand-color'

/** The same shape the API enforces. Duplicated deliberately — see above. */
const HEX = /^#[0-9a-f]{6}$/i

/**
 * Every custom property the tenant colour paints, and the single list both the
 * writer and its tests read — so a token added here cannot be left untested,
 * and one removed cannot leave a stale override behind on clear.
 *
 * `--sidebar-accent` and `--color-primary-dark` (the hover states) are
 * deliberately absent: both are DARKENED variants of the brand purple, and
 * deriving a darker shade of an arbitrary operator-chosen colour is a
 * colour-space problem this function has no business solving inline. They are
 * painted below, in `BRAND_DERIVED_TOKENS`, instead.
 */
export const BRAND_COLOR_TOKENS = ['--color-primary', '--sidebar', '--sidebar-primary'] as const

/**
 * Tokens painted with a shade DERIVED from the brand colour rather than the
 * colour itself.
 *
 * `--sidebar-accent` is the sidebar's hover state, and it carried its own
 * hardcoded oklch copy of the product's `#4f1aaf` — so an organization that
 * configured its colour got a branded sidebar that snapped back to Quint
 * purple the moment a pointer touched it. The most visible half-applied brand
 * in the app, and the reason this file previously said deriving a darker shade
 * was "a colour-space problem this function has no business solving inline".
 *
 * That was right about the problem and wrong about the conclusion: the
 * BROWSER has a colour space. `color-mix(in oklab, …)` does the darkening at
 * paint time, in the same perceptual space the rest of the theme is authored
 * in, with no conversion code shipped and nothing to get subtly wrong for
 * every colour that is not purple.
 *
 * `--color-primary-dark` is the SAME bug, on `ToggleGroup` / `Toggle`
 * (`data-[state=on]:hover:bg-primary-dark`, DESIGN.md §8.2.2's selected-toggle
 * hover): the comment that used to sit here claimed "buttons need no entry"
 * because `[a]:hover:bg-primary/80` is an alpha on `--color-primary` — true for
 * that one pattern, but `bg-primary-dark` reads the separate, still-literal
 * `--color-primary-dark` token, so a selected toggle hover kept snapping back
 * to Quint purple exactly like the sidebar did.
 */
export const BRAND_DERIVED_TOKENS = ['--sidebar-accent', '--color-primary-dark'] as const

/**
 * The foreground painted on TOP of each `BRAND_COLOR_TOKENS` background.
 *
 * gga review finding: this app hardcoded `--primary-foreground` /
 * `--sidebar-foreground` / `--sidebar-primary-foreground` to white
 * (`main.css`, "white, 8.2:1 on primary" — true only against the product's
 * OWN `#771aaf`), unconditionally, for every tenant colour. "Contrast is the
 * operator's responsibility once they choose a colour" — this file's own
 * stated philosophy, two paragraphs below — does not cover the foreground,
 * because the product picks that, not the operator. A light tenant colour
 * (e.g. `#ffd400`, 1.43:1 with white) shipped white text on a light
 * background: a real, unguarded WCAG AA violation, not a hypothetical one.
 *
 * Order matches `BRAND_COLOR_TOKENS` — each index pairs a background token
 * with the foreground painted on it, so a token added to one without the
 * other is a mismatched-length array, not a silently wrong pairing.
 */
export const BRAND_FOREGROUND_TOKENS = [
  '--primary-foreground',
  '--sidebar-foreground',
  '--sidebar-primary-foreground',
] as const

/**
 * How much of the brand colour survives the darkening.
 *
 * gga review finding, corrected: this used to claim 70%/black in OKLab
 * reproduces `#431695` from `#771aaf` — verified false (OKLab `color-mix`
 * moves L, a, AND b together; matching only L, as the prior version of this
 * comment implicitly assumed, is not the same operation). Restated honestly:
 * this reproduces the SAME KIND of shift `--color-primary-light`'s derivation
 * already documents for the frontend's copy of this file — the ROLE the
 * shade plays (a meaningfully darker hover, not a precise colorimetric match
 * to the product's own literal `#431695`), the same way `#771aaf` → `#c222d3`
 * is a role, not an exact reproducible formula, per that file's own header.
 */
const HOVER_MIX = 'color-mix(in oklab, COLOR 70%, black)'

/**
 * A plain hex is a valid CSS colour in every browser this product supports
 * (DESIGN.md §2), so the override does not need converting to the OKLCH the
 * stylesheet's own values happen to use. Contrast of the BACKGROUND against
 * arbitrary surrounding content is the operator's responsibility once they
 * choose a colour of their own — the product cannot verify a colour it did
 * not pick — but the FOREGROUND painted on top of it is the product's own
 * choice, so `readableForeground` guards it (see `BRAND_FOREGROUND_TOKENS`).
 */
export function applyBrandColor(color: string | null | undefined): void {
  if (typeof document === 'undefined') return

  const root = document.documentElement

  if (!color || !HEX.test(color)) {
    // Remove rather than reset: removing restores the stylesheet's own value,
    // while writing one here would hardcode a second copy of the brand colour.
    for (const token of [
      ...BRAND_COLOR_TOKENS,
      ...BRAND_DERIVED_TOKENS,
      ...BRAND_FOREGROUND_TOKENS,
    ]) {
      root.style.removeProperty(token)
    }

    return
  }

  for (const token of BRAND_COLOR_TOKENS) {
    root.style.setProperty(token, color)
  }

  // Interpolated only AFTER the hex has passed the regex above — the value
  // reaches a stylesheet either way, and a `color-mix()` wrapper would hide a
  // malformed payload rather than stop it.
  for (const token of BRAND_DERIVED_TOKENS) {
    root.style.setProperty(token, HOVER_MIX.replace('COLOR', color))
  }

  const foreground = readableForeground(color)

  for (const token of BRAND_FOREGROUND_TOKENS) {
    root.style.setProperty(token, foreground)
  }
}
