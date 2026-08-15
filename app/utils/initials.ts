/**
 * initials.ts (user-profile-self-service, design D7).
 *
 * Derives a shell-identity avatar fallback from a display name: FIRST +
 * LAST token, not the first two — "Ada Byron King Lovelace" is "AL", not
 * "AB". Uses `Array.from(token)[0]`, never `token[0]` — indexing a string
 * splits a surrogate pair (e.g. an emoji or many CJK characters outside the
 * BMP) and emits a replacement glyph instead of the intended grapheme.
 * `toLocaleUpperCase()`, not `toUpperCase()`.
 */
export function initials(name: string): string {
  const tokens = name.trim().split(/\s+/).filter(Boolean)

  if (tokens.length === 0) return '?'

  const firstToken = tokens[0] as string
  const lastToken = tokens[tokens.length - 1] as string

  const firstLetter = Array.from(firstToken)[0] ?? ''
  const lastLetter = tokens.length > 1 ? (Array.from(lastToken)[0] ?? '') : ''

  return (firstLetter + lastLetter).toLocaleUpperCase()
}
