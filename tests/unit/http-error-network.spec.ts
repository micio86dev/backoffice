import { describe, expect, it } from 'vitest'
import { isNetworkError } from '../../app/utils/http-error'

describe('isNetworkError', () => {
  it('is true for an ofetch FetchError with no response whose cause is the fetch failure', () => {
    const error = Object.assign(new Error('<no response>'), {
      name: 'FetchError',
      cause: new TypeError('Failed to fetch'),
    })

    expect(isNetworkError(error)).toBe(true)
  })

  it.each([
    ['a plain Error', new Error('boom')],
    // A programming fault (`undefined.x`) is a TypeError too: it must not read as "check your connection".
    ['a bare TypeError', new TypeError('Cannot read properties of undefined')],
    ['a bare fetch-shaped TypeError', new TypeError('Failed to fetch')],
    [
      'a FetchError that got a response, even with a TypeError cause',
      Object.assign(new Error('HTTP 502'), {
        name: 'FetchError',
        status: 502,
        response: { status: 502 },
        cause: new TypeError('x'),
      }),
    ],
    ['an HTTP failure', Object.assign(new Error('HTTP 500'), { name: 'FetchError', status: 500 })],
    [
      'a FetchError with a non-network cause',
      Object.assign(new Error('x'), { name: 'FetchError' }),
    ],
    ['a string', 'boom'],
    ['null', null],
    ['undefined', undefined],
  ])('is false for %s', (_label, error) => {
    expect(isNetworkError(error)).toBe(false)
  })
})
