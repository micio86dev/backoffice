import { describe, it, expect } from 'vitest'
import { toSameOriginImageUrl } from '../../../app/utils/image-url'

const ORIGIN = 'http://localhost:3001'

describe('toSameOriginImageUrl', () => {
  it.each([
    [
      'cross-origin http -> same-origin path, ?v= kept',
      'http://localhost:8000/api/organizations/6/logo?v=abc.png',
      '/api/organizations/6/logo?v=abc.png',
    ],
    ['cross-origin http without query', 'http://localhost:8000/api/x/logo', '/api/x/logo'],
    [
      'http /storage signed URL unchanged (not proxied by nginx)',
      'http://localhost:8000/storage/profile-photos/7/a.jpg?expires=1&signature=abc',
      'http://localhost:8000/storage/profile-photos/7/a.jpg?expires=1&signature=abc',
    ],
    [
      'http non-/api path unchanged',
      'http://localhost:8000/other/x.png',
      'http://localhost:8000/other/x.png',
    ],
    [
      'http /apix lookalike unchanged',
      'http://localhost:8000/apix/logo',
      'http://localhost:8000/apix/logo',
    ],
    [
      'https unchanged',
      'https://api.example.com/logo.png?v=1',
      'https://api.example.com/logo.png?v=1',
    ],
    ['blob unchanged', 'blob:http://localhost:3001/uuid', 'blob:http://localhost:3001/uuid'],
    ['data unchanged', 'data:image/png;base64,AAAA', 'data:image/png;base64,AAAA'],
    ['relative unchanged', '/api/organizations/6/logo?v=1', '/api/organizations/6/logo?v=1'],
    [
      'same-origin http unchanged',
      'http://localhost:3001/api/logo?v=1',
      'http://localhost:3001/api/logo?v=1',
    ],
    ['garbage unchanged', 'not a url at all', 'not a url at all'],
    ['empty unchanged', '', ''],
  ])('%s', (_name, input, expected) => {
    expect(toSameOriginImageUrl(input, ORIGIN)).toBe(expected)
  })

  it('returns null for null and undefined', () => {
    expect(toSameOriginImageUrl(null, ORIGIN)).toBeNull()
    expect(toSameOriginImageUrl(undefined, ORIGIN)).toBeNull()
  })

  it('falls back to the window origin when none is given', () => {
    const url = `${window.location.origin}/api/logo?v=1`
    expect(toSameOriginImageUrl(url)).toBe(url)
  })

  it('treats every http origin as foreign when the current origin is empty', () => {
    const url = 'http://localhost:8000/api/logo?v=1'
    expect(toSameOriginImageUrl(url, '')).toBe('/api/logo?v=1')
  })
})
