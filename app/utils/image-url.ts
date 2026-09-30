/**
 * image-url.ts
 *
 * The API builds absolute media URLs from `APP_URL` (`Organization::
 * absoluteLogoUrl()`). In local docker that is `http://localhost:8000`, a
 * cross-origin http URL that the backoffice CSP (`img-src 'self' data: blob:
 * https:`) blocks. The backoffice reaches the API same-origin through `/api/`,
 * so an http `/api/...` URL on a foreign origin is rewritten to its same-origin path
 * (query kept: the `?v=` cache-buster must survive). The CSP is not loosened.
 *
 * Everything else is returned untouched: null/empty, relative, `blob:`,
 * `data:`, `https:`, same-origin, and anything unparseable. Never throws.
 */
export function toSameOriginImageUrl(
  url: string | null | undefined,
  currentOrigin?: string
): string | null {
  if (url === null || url === undefined) return null
  if (url === '') return url

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return url
  }

  if (parsed.protocol !== 'http:') return url

  const origin = currentOrigin ?? (typeof window !== 'undefined' ? window.location.origin : '')

  if (parsed.origin === origin) return url

  // Only `/api/` is proxied by nginx. Any other path (e.g. a signed `/storage/`
  // URL, whose signature is bound to the request host) would 404 same-origin.
  if (!parsed.pathname.startsWith('/api/')) return url

  return parsed.pathname + parsed.search
}
