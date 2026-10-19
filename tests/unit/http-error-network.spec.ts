import { describe, expect, it } from 'vitest'
import { isNetworkError } from '../../app/utils/http-error'

describe('isNetworkError', () => {
  it.each([
    ['a fetch TypeError', new TypeError('Failed to fetch')],
    [
      'an ofetch FetchError wrapping one',
      Object.assign(new Error('<no response>'), { name: 'FetchError', cause: new TypeError('x') }),
    ],
  ])('is true for %s', (_label, error) => {
    expect(isNetworkError(error)).toBe(true)
  })

  it.each([
    ['a plain Error', new Error('boom')],
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
