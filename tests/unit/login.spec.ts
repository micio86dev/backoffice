/**
 * login.spec.ts (D11, task 14.4)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import LoginPage from '../../app/pages/login.vue'

const tMock = (key: string) => key

describe('LoginPage', () => {
  beforeEach(() => {
    sessionStorage.clear()
    // NOTE: intentionally no `afterEach(() => vi.unstubAllGlobals())` here.
    // tests/unit/setup.ts stubs definePageMeta/useHead/useRuntimeConfig/useNuxtApp
    // ONCE per test FILE (not per test), via Vitest's setupFiles. Calling
    // vi.unstubAllGlobals() in this file's afterEach would wipe those baseline
    // stubs after the first test, breaking every subsequent test in the file.
    // Each test below re-stubs exactly what it needs via vi.stubGlobal, which
    // is enough for isolation.
  })

  it('renders the login form with email, password and submit', () => {
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({ public: { apiBase: 'https://api.test/api' } }))
    )
    const wrapper = mount(LoginPage, { global: { mocks: { $t: tMock } } })

    expect(wrapper.find('[data-testid="login-email"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="login-password"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="login-submit"]').exists()).toBe(true)
  })

  it('on successful login, stores the session and navigates to /', async () => {
    const navigateToMock = vi.fn()
    const fetchMock = vi.fn(async () => ({
      access_token: 'issued-token',
      refresh_token: 'issued-token',
      token_type: 'bearer',
    }))
    vi.stubGlobal('$fetch', fetchMock)
    vi.stubGlobal('navigateTo', navigateToMock)
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({ public: { apiBase: 'https://api.test/api' } }))
    )

    const wrapper = mount(LoginPage, { global: { mocks: { $t: tMock } } })
    await wrapper.find('[data-testid="login-email"]').setValue('admin@example.com')
    await wrapper.find('[data-testid="login-password"]').setValue('secret')
    await wrapper.find('[data-testid="login-form"]').trigger('submit')
    await new Promise((r) => setTimeout(r, 0))

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.test/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: { email: 'admin@example.com', password: 'secret' },
      })
    )
    expect(sessionStorage.getItem('beai_access_token')).toBe('issued-token')
    expect(navigateToMock).toHaveBeenCalledWith('/')
  })

  it('on invalid credentials, shows an error and does not navigate', async () => {
    const navigateToMock = vi.fn()
    const fetchMock = vi.fn(async () => {
      throw Object.assign(new Error('Invalid credentials.'), { status: 401 })
    })
    vi.stubGlobal('$fetch', fetchMock)
    vi.stubGlobal('navigateTo', navigateToMock)
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({ public: { apiBase: 'https://api.test/api' } }))
    )

    const wrapper = mount(LoginPage, { global: { mocks: { $t: tMock } } })
    await wrapper.find('[data-testid="login-email"]').setValue('admin@example.com')
    await wrapper.find('[data-testid="login-password"]').setValue('wrong')
    await wrapper.find('[data-testid="login-form"]').trigger('submit')
    await new Promise((r) => setTimeout(r, 0))

    expect(navigateToMock).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="login-error"]').exists()).toBe(true)
    expect(sessionStorage.getItem('beai_access_token')).toBeNull()
  })

  it('routes the <title> through i18n instead of a hardcoded English literal', () => {
    const useHeadMock = vi.fn()
    vi.stubGlobal('useHead', useHeadMock)
    vi.stubGlobal(
      'useI18n',
      vi.fn(() => ({ t: (key: string) => key }))
    )
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({ public: { apiBase: 'https://api.test/api' } }))
    )

    mount(LoginPage, { global: { mocks: { $t: tMock } } })

    const head = useHeadMock.mock.calls[0]?.[0] as { title?: () => string }
    expect(typeof head?.title).toBe('function')
    expect(head?.title?.()).toBe('head.title.login')
  })
})
