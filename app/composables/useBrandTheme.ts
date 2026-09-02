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

/** The same shape the API enforces. Duplicated deliberately — see above. */
const HEX = /^#[0-9a-f]{6}$/i

/**
 * Every custom property the tenant colour paints, and the single list both the
 * writer and its tests read — so a token added here cannot be left untested,
 * and one removed cannot leave a stale override behind on clear.
 *
 * `--sidebar-accent` (the hover state) is deliberately absent: it is a
 * DARKENED variant of the brand purple, and deriving a darker shade of an
 * arbitrary operator-chosen colour is a colour-space problem this function has
 * no business solving inline. It keeps the product's own hover shade.
 */
export const BRAND_COLOR_TOKENS = ['--color-primary', '--sidebar', '--sidebar-primary'] as const

/**
 * A plain hex is a valid CSS colour in every browser this product supports
 * (DESIGN.md §2), so the override does not need converting to the OKLCH the
 * stylesheet's own values happen to use. Contrast against the foreground is
 * the operator's responsibility once they choose a colour of their own; the
 * product cannot verify a colour it did not pick.
 */
export function applyBrandColor(color: string | null | undefined): void {
  if (typeof document === 'undefined') return

  const root = document.documentElement

  if (!color || !HEX.test(color)) {
    // Remove rather than reset: removing restores the stylesheet's own value,
    // while writing one here would hardcode a second copy of the brand colour.
    for (const token of BRAND_COLOR_TOKENS) {
      root.style.removeProperty(token)
    }

    return
  }

  for (const token of BRAND_COLOR_TOKENS) {
    root.style.setProperty(token, color)
  }
}
