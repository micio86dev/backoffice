/**
 * browser-gate.ts — Pure browser-support gate function (SA-11).
 *
 * Ported from `frontend/app/utils/browser-gate.ts`. The backoffice is SPA-only
 * (`ssr: false`, D2/D11) — every navigation, including the first, resolves
 * client-side, so unlike the frontend port there is no server branch and no
 * `Infinity`-width convention to document.
 *
 * This is a PURE function: no browser globals at module scope, no side
 * effects. The caller (the middleware wrapper) supplies the UA string and
 * viewport width, reading `navigator`/`window` itself.
 *
 * Detection strategy (DESIGN.md §2 / §6):
 *   Firefox-denylist: /Firefox\//i — Firefox is explicitly rejected; all other
 *   desktop UA strings (Chrome/Edge/Opera/Safari) pass.
 *
 *   Mobile UA: /Mobi|Android|iPhone|iPad/i — catches mobile Chrome, Firefox for
 *   Android, Safari on iPhone/iPad. iPadOS 13+ sends a Mac-like UA string by
 *   default, so the viewport width check below is the authoritative tablet
 *   gate for modern iPads.
 *
 *   Viewport: width < 1024px — per DESIGN.md §6, the supported floor is
 *   >= 1024px (the `lg` breakpoint); 768-1023px (tablet) and < 768px (mobile)
 *   are both unsupported.
 *
 * @param ua     The User-Agent string (from navigator.userAgent).
 * @param width  The viewport width in pixels (from window.innerWidth).
 * @returns      true when the browser/viewport combination is supported.
 */
export function isSupportedBrowser(ua: string, width: number): boolean {
  if (/Firefox\//i.test(ua)) {
    return false
  }

  if (/Mobi|Android|iPhone|iPad/i.test(ua)) {
    return false
  }

  if (width < 1024) {
    return false
  }

  return true
}
