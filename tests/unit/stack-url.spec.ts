import { describe, expect, it } from 'vitest'
import { resolveStackUrl } from '../e2e/support/stack-url'

const withUrl = (value?: string, extra: Record<string, string> = {}) => ({
  ...(value === undefined ? {} : { BEAI_E2E_STACK_URL: value }),
  ...extra,
})

describe('resolveStackUrl', () => {
  it('defaults to http://localhost:3001', () => {
    expect(resolveStackUrl({})).toBe('http://localhost:3001')
  })

  it.each(['', '   '])('treats %j as unset', (value) => {
    expect(resolveStackUrl(withUrl(value))).toBe('http://localhost:3001')
  })

  it.each([
    ['http://localhost', 'http://localhost'],
    ['http://localhost:3001', 'http://localhost:3001'],
    ['http://127.0.0.1', 'http://127.0.0.1'],
    ['http://127.0.0.1:3001', 'http://127.0.0.1:3001'],
    ['http://[::1]', 'http://[::1]'],
    ['http://[::1]:3001', 'http://[::1]:3001'],
    ['https://localhost:3001', 'https://localhost:3001'],
    ['http://localhost:3001/', 'http://localhost:3001'],
    ['http://localhost:3001///', 'http://localhost:3001'],
  ])('accepts %s', (input, expected) => {
    expect(resolveStackUrl(withUrl(input))).toBe(expected)
  })

  it.each([
    'https://admin.example.com',
    'http://localhost.evil.com',
    'http://127.0.0.1.evil.com',
    'http://127.0.0.1@evil.com',
    'http://evil.com#localhost',
    'http://evil.com/?h=localhost',
    'http://user:pass@localhost:3001',
    'http://user@127.0.0.1',
    'ftp://localhost',
    'not a url',
    'localhost:3001',
  ])('rejects %s', (input) => {
    expect(() => resolveStackUrl(withUrl(input))).toThrow(/BEAI_E2E_ALLOW_NON_LOCAL/)
  })

  it('never echoes credentials from a rejected URL', () => {
    try {
      resolveStackUrl(withUrl('https://admin:s3cret@evil.com'))
      expect.unreachable()
    } catch (error) {
      expect((error as Error).message).not.toContain('s3cret')
    }
  })

  it('allows a remote host only when the override is exactly "1"', () => {
    const remote = 'https://staging.example.com/'
    expect(resolveStackUrl(withUrl(remote, { BEAI_E2E_ALLOW_NON_LOCAL: '1' }))).toBe(
      'https://staging.example.com'
    )
    for (const value of ['true', 'yes', '0', '']) {
      expect(() => resolveStackUrl(withUrl(remote, { BEAI_E2E_ALLOW_NON_LOCAL: value }))).toThrow()
    }
  })

  it('still rejects a non-http(s) scheme or garbage under the override', () => {
    const env = { BEAI_E2E_ALLOW_NON_LOCAL: '1' }
    expect(() => resolveStackUrl(withUrl('ftp://example.com', env))).toThrow()
    expect(() => resolveStackUrl(withUrl('not a url', env))).toThrow()
  })
})
