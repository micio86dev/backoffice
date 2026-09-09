/**
 * The product's own brand constants, in one place.
 *
 * `BrandingForm` needs both as JavaScript values — a CSS custom property
 * cannot be read into an `<input>`'s `value` or `placeholder` — and the hex
 * rule must be the same predicate everywhere, because two copies are two
 * chances to disagree about what a valid colour is.
 *
 * Deliberately NOT exported from `useBrandTheme`: that composable owns
 * applying a colour to the document, and it carries its own private copy of
 * this regex today. Merging the two means touching a file whose contrast
 * decisions deserve their own review, and this change is not that review.
 * Recorded as a follow-up rather than smuggled in.
 */

/**
 * The SAME shape the server enforces (`UpdateOrganizationRequest`'s
 * `\A#[0-9a-fA-F]{6}\z`), and they agree: without the `m` flag JavaScript's
 * `$` matches end-of-input only, which is exactly what `\z` means. A client
 * rule merely "similar" to the server's produces a field the operator can
 * fill in and the server then rejects.
 */
export const HEX = /^#[0-9a-f]{6}$/i

/**
 * `--color-primary` from DESIGN.md 3.1. The token is the source of truth for
 * anything CSS can style; this literal exists only for the two places a
 * custom property cannot reach.
 */
export const BRAND_PRIMARY = '#771AAF'
