import { describe, expect, it } from 'vitest'
import { describeReadiness } from '../e2e/support/stack-readiness'

const ok = JSON.stringify({ status: 'ok' })
const down = (reason: string) => JSON.stringify({ status: 'down', reason })

describe('describeReadiness', () => {
  it('accepts a 200 {"status":"ok"}', () => {
    expect(describeReadiness(200, ok).ok).toBe(true)
  })

  it('does not accept a 200 whose body is not the ok payload', () => {
    expect(describeReadiness(200, '<html>nginx welcome</html>').ok).toBe(false)
    expect(describeReadiness(200, down('pending_migrations')).ok).toBe(false)
  })

  it('names the exact fix for pending migrations', () => {
    const result = describeReadiness(503, down('pending_migrations'))

    expect(result.ok).toBe(false)
    expect(result.message).toContain('docker compose exec api php artisan migrate --force')
  })

  it('points at postgres when the database is unavailable', () => {
    const result = describeReadiness(503, down('database_unavailable'))

    expect(result.ok).toBe(false)
    expect(result.message).toContain('docker compose ps postgres')
  })

  it('says the api must be rebuilt on a 404', () => {
    const result = describeReadiness(404, '{"message":"Not Found"}')

    expect(result.ok).toBe(false)
    expect(result.message).toContain('/api/health/ready')
    expect(result.message).toMatch(/rebuil/i)
  })

  it.each([0, undefined])('says the stack is not running when unreachable (%s)', (status) => {
    const result = describeReadiness(status, '')

    expect(result.ok).toBe(false)
    expect(result.message).toContain('task up')
    expect(result.message).toContain('docker compose up -d')
  })

  it('echoes only a sanitized short reason for an unknown reason', () => {
    const result = describeReadiness(503, down('weird reason!<script>' + 'x'.repeat(100)))

    expect(result.ok).toBe(false)
    expect(result.message).not.toContain('<script>')
    expect(result.message).not.toContain('!')
    expect(result.message).not.toContain('x'.repeat(41))
  })

  it('never echoes a non-JSON body', () => {
    const result = describeReadiness(502, '<html>Bad Gateway SECRET-TOKEN-123</html>')

    expect(result.ok).toBe(false)
    expect(result.message).not.toContain('SECRET-TOKEN-123')
    expect(result.message).not.toContain('<html>')
  })
})
