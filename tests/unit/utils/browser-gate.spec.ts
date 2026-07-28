import { describe, it, expect } from 'vitest'
import { isSupportedBrowser } from '../../../app/utils/browser-gate'

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const FIREFOX_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0'
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobi'

describe('isSupportedBrowser (SA-11)', () => {
  it('supports Chrome at desktop width', () => {
    expect(isSupportedBrowser(CHROME_UA, 1440)).toBe(true)
  })

  it('rejects Firefox at desktop width', () => {
    expect(isSupportedBrowser(FIREFOX_UA, 1440)).toBe(false)
  })

  it('rejects a mobile UA even at a wide reported width', () => {
    expect(isSupportedBrowser(IPHONE_UA, 1440)).toBe(false)
    expect(isSupportedBrowser(ANDROID_UA, 1440)).toBe(false)
  })

  it('rejects a viewport narrower than 1024px, even on Chrome', () => {
    expect(isSupportedBrowser(CHROME_UA, 375)).toBe(false)
    expect(isSupportedBrowser(CHROME_UA, 1023)).toBe(false)
  })

  it('supports exactly the 1024px floor', () => {
    expect(isSupportedBrowser(CHROME_UA, 1024)).toBe(true)
  })
})
