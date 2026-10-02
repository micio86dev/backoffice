import { describeReadiness } from './stack-readiness'

/**
 * Real-stack tier global setup: refuse to run a single test against a stack that
 * is not ready, and say how to fix it.
 *
 * It goes through the SAME origin the browser uses (the backoffice nginx, which
 * proxies `/api/`), so the proxy is exercised too. Liveness first, then
 * readiness: liveness never touches the database, readiness is what notices a
 * schema that is behind the code.
 */
export const STACK_URL = (process.env['BEAI_E2E_STACK_URL'] ?? 'http://localhost:3001').replace(
  /\/+$/,
  ''
)

async function probe(path: string): Promise<{ status: number; body: string }> {
  try {
    const response = await fetch(`${STACK_URL}${path}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    })

    return { status: response.status, body: await response.text() }
  } catch {
    return { status: 0, body: '' }
  }
}

export default async function globalSetup(): Promise<void> {
  const live = await probe('/api/health')

  if (live.status !== 200) {
    const hint =
      live.status === 0
        ? describeReadiness(0, '').message
        : `Liveness check failed (HTTP ${live.status}).`

    throw new Error(`[stack e2e] ${STACK_URL}/api/health: ${hint}`)
  }

  const ready = await probe('/api/health/ready')
  const verdict = describeReadiness(ready.status, ready.body)

  if (!verdict.ok) {
    throw new Error(`[stack e2e] ${STACK_URL}/api/health/ready: ${verdict.message}`)
  }
}
