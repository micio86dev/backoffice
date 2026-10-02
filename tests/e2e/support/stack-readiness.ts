/**
 * Turns the answer of `GET /api/health/ready` into a verdict and, when the stack
 * is not ready, the ACTION the developer must take.
 *
 * Pure on purpose (no I/O, no Playwright import): the real-stack global setup
 * does the fetching, this decides, and Vitest covers every branch.
 *
 * The response body is never echoed. A reason is shown only after it is reduced
 * to `[A-Za-z0-9_]` and cut to 40 characters, so a proxy error page or an
 * unexpected payload cannot leak into the message.
 */
export interface Readiness {
  ok: boolean
  message: string
}

const MAX_REASON_LENGTH = 40

function parseJson(bodyText: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(bodyText)

    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function sanitizeReason(value: unknown): string {
  if (typeof value !== 'string') return 'unknown'

  const cleaned = value.replace(/\W/g, '').slice(0, MAX_REASON_LENGTH)

  return cleaned === '' ? 'unknown' : cleaned
}

export function describeReadiness(httpStatus: number | undefined, bodyText: string): Readiness {
  if (httpStatus === undefined || httpStatus === 0) {
    return {
      ok: false,
      message:
        'The stack is not running or not reachable. Start it with `task up` ' +
        '(or `docker compose up -d`), then retry.',
    }
  }

  const body = parseJson(bodyText)

  if (httpStatus === 200 && body?.['status'] === 'ok') {
    return { ok: true, message: 'The stack is ready.' }
  }

  if (httpStatus === 404) {
    return {
      ok: false,
      message:
        'The api predates /api/health/ready (it answered 404). Rebuild and restart the api ' +
        'image so it matches the checked-out code.',
    }
  }

  if (httpStatus === 503 && body?.['status'] === 'down') {
    const reason = body['reason']

    if (reason === 'pending_migrations') {
      return {
        ok: false,
        message:
          'The database schema is behind the code (pending migrations). Run: ' +
          'docker compose exec api php artisan migrate --force',
      }
    }

    if (reason === 'database_unavailable') {
      return {
        ok: false,
        message:
          'The api cannot reach its database. Check postgres: `docker compose ps postgres` ' +
          'and `docker compose logs postgres`.',
      }
    }

    return {
      ok: false,
      message: `The stack reported itself not ready (reason: ${sanitizeReason(reason)}).`,
    }
  }

  return {
    ok: false,
    message:
      `Unexpected readiness answer (HTTP ${Math.trunc(httpStatus)}, reason: ` +
      `${sanitizeReason(body?.['reason'])}).`,
  }
}
