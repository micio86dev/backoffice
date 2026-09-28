/**
 * WCAG contrast arithmetic for tenant branding (gga review finding, D9-equivalent
 * to the frontend's own `app/utils/brand-color.ts`).
 *
 * `useBrandTheme.ts` painted `--color-primary` / `--sidebar` / `--sidebar-primary`
 * with an arbitrary tenant hex but left `--primary-foreground` /
 * `--sidebar-foreground` / `--sidebar-primary-foreground` hardcoded white
 * (`main.css`, annotated "white, 8.2:1 on primary" — a ratio that only holds
 * against the product's own `#771aaf`). A light tenant colour left white text on
 * a light background: WCAG AA's binding 4.5:1 floor, silently broken for any
 * operator who picked a colour lighter than roughly mid-tone.
 *
 * The FOREGROUND is not the operator's choice — the product hardcodes it — so
 * "contrast is the operator's responsibility" (this file's sibling composable)
 * does not cover it. The product picks a colour it did not choose a foreground
 * for; it has to pick a foreground that works.
 */

const HEX = /^#[0-9a-f]{6}$/i

function toRgb(hex: string): { r: number; g: number; b: number } {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  }
}

/** WCAG 2.1 relative luminance. The formula, not an approximation of it. */
function relativeLuminance(hex: string): number {
  const { r, g, b } = toRgb(hex)

  const linear = (value: number): number => {
    const channel = value / 255

    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  }

  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

/** WCAG 2.1 contrast ratio between two opaque colours, 1:1 … 21:1. */
export function contrastRatio(a: string, b: string): number {
  const light = Math.max(relativeLuminance(a), relativeLuminance(b))
  const dark = Math.min(relativeLuminance(a), relativeLuminance(b))

  return (light + 0.05) / (dark + 0.05)
}

/**
 * Black or white, whichever measures the higher contrast against `background`.
 *
 * Not a guarantee of 4.5:1 for every conceivable background — a narrow band of
 * true mid-tone greys clears neither by much — but for the wide range of
 * saturated or clearly light/dark brand colours an operator actually picks,
 * one of the two comfortably passes AA. Falls back to white (the product's
 * prior, unconditional choice) for a value this function cannot parse, so a
 * malformed value degrades to the old behaviour rather than a new failure mode.
 */
export function readableForeground(background: string): '#000000' | '#ffffff' {
  if (!HEX.test(background)) return '#ffffff'

  return contrastRatio(background, '#ffffff') >= contrastRatio(background, '#000000')
    ? '#ffffff'
    : '#000000'
}
