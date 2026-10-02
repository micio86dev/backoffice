import { describeReadiness } from './stack-readiness'
import { resolveStackUrl } from './stack-url'

/**
 * Real-stack tier global setup: refuse to run a single test against a stack that
 * is not ready, and say how to fix it.
 *
 * It goes through the SAME origin the browser uses (the backoffice nginx, which
 * proxies `/api/`), so the proxy is exercised too. Liveness first, then
 * readiness: liveness never touches the database, readiness is what notices a
 * schema that is behind the code.
 */

async function probe(stackUrl: string, path: string): Promise<{ status: number; body: string }> {
  try {
    const response = await fetch(`${stackUrl}${path}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    })

    return { status: response.status, body: await response.text() }
  } catch {
    return { status: 0, body: '' }
  }
}

export default async function globalSetup(): Promise<void> {
  // Throws on a non-local origin before a single request is sent.
  const STACK_URL = resolveStackUrl()
  const live = await probe(STACK_URL, '/api/health')

  if (live.status !== 200) {
    const hint =
      live.status === 0
        ? describeReadiness(0, '').message
        : `Liveness check failed (HTTP ${live.status}).`

    throw new Error(`[stack e2e] ${STACK_URL}/api/health: ${hint}`)
  }

  const ready = await probe(STACK_URL, '/api/health/ready')
  const verdict = describeReadiness(ready.status, ready.body)

  if (!verdict.ok) {
    throw new Error(`[stack e2e] ${STACK_URL}/api/health/ready: ${verdict.message}`)
  }
}
