/**
 * The ONE place the real-stack tier decides which origin it may talk to.
 *
 * The tier signs in with real admin credentials and WRITES a reusable link, so a
 * mistakenly exported `BEAI_E2E_STACK_URL` pointing at staging or production must
 * fail before any request is sent. Only the PARSED hostname is compared, never a
 * prefix or substring of the raw string (`localhost.evil.com`, `127.0.0.1@evil.com`
 * and `evil.com#localhost` all look local to a string match).
 */
const DEFAULT_URL = 'http://localhost:3001'
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

export function resolveStackUrl(env: Record<string, string | undefined> = process.env): string {
  const raw = env['BEAI_E2E_STACK_URL']?.trim() || DEFAULT_URL
  const refuse = (reason: string): never => {
    throw new Error(
      `[stack e2e] Refusing BEAI_E2E_STACK_URL: ${reason}. The real-stack tier signs in and ` +
        'writes data, so it only targets a local stack. Set BEAI_E2E_ALLOW_NON_LOCAL=1 to ' +
        'override, for deliberate use only.'
    )
  }

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return refuse('it is not a valid URL')
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return refuse('the protocol is not http or https')
  }

  if (url.username !== '' || url.password !== '') {
    return refuse('it embeds credentials')
  }

  if (!LOCAL_HOSTNAMES.has(url.hostname) && env['BEAI_E2E_ALLOW_NON_LOCAL'] !== '1') {
    return refuse(`host "${url.hostname}" is not local`)
  }

  return `${url.origin}${url.pathname}`.replace(/\/+$/, '')
}
