/**
 * D30 — backoffice noindex policy:
 * The admin panel ALWAYS injects noindex, nofollow — no environment conditional.
 *
 * WCAG 3.1.1 (Language of Page, Level A):
 * `<html lang>` must follow the ACTIVE locale. The tests below deliberately
 * assert that the value DIFFERS between an it-locale render and an en-locale
 * render. A test that only asserts "a lang attribute exists" reproduces the
 * exact blind spot that let the bug ship: axe's `html-has-lang` and
 * `html-lang-valid` both PASS on a hardcoded `lang="it"` served at `/en/*`,
 * because the attribute IS present and IS a valid language tag.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import AppRoot from '../../app/app.vue'

/** Mounts app.vue with @nuxtjs/i18n's useLocaleHead() reporting `lang`. */
function mountWithLocale(lang: string | undefined) {
  const useHeadMock = vi.fn()
  vi.stubGlobal('useHead', useHeadMock)
  vi.stubGlobal(
    'useLocaleHead',
    vi.fn(() => ref(lang === undefined ? {} : { htmlAttrs: { lang } }))
  )

  mount(AppRoot)

  const headInput = useHeadMock.mock.calls[0]?.[0] as {
    htmlAttrs?: { lang?: { value?: string } }
  }
  return { useHeadMock, resolvedLang: headInput?.htmlAttrs?.lang?.value }
}

describe('app.vue — noindex policy (D30)', () => {
  it('always calls useHead with noindex regardless of env', () => {
    const useHeadMock = vi.fn()
    vi.stubGlobal('useHead', useHeadMock)

    mount(AppRoot)

    expect(useHeadMock).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: expect.arrayContaining([
          expect.objectContaining({
            name: 'robots',
            content: 'noindex, nofollow',
          }),
        ]),
      })
    )
  })

  it('useHead is called exactly once (no conditional branch)', () => {
    const useHeadMock = vi.fn()
    vi.stubGlobal('useHead', useHeadMock)

    mount(AppRoot)

    // Must be called exactly once — no env-conditional logic
    expect(useHeadMock).toHaveBeenCalledTimes(1)
  })
})

describe('app.vue — <html lang> follows the active locale (WCAG 3.1.1)', () => {
  it('resolves lang="it" on a default-locale route', () => {
    expect(mountWithLocale('it').resolvedLang).toBe('it')
  })

  it('resolves lang="en" on an /en/* route', () => {
    expect(mountWithLocale('en').resolvedLang).toBe('en')
  })

  it('resolves a DIFFERENT lang for it and en (a hardcoded constant satisfies either case alone)', () => {
    const italian = mountWithLocale('it').resolvedLang
    const english = mountWithLocale('en').resolvedLang

    expect(italian).not.toBe(english)
    expect([italian, english]).toEqual(['it', 'en'])
  })

  it('falls back to the default locale when the i18n head reports no lang at all', () => {
    // Never emit `<html>` with no language: a MISSING lang is worse for a
    // screen reader than a wrong one, and it is the only variant axe catches.
    expect(mountWithLocale(undefined).resolvedLang).toBe('it')
  })
})
