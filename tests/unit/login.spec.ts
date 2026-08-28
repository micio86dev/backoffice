/**
 * login.spec.ts (corrected first — backoffice-session-refresh-hardening
 * slice 5, design D2/D8)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import LoginPage from '../../app/pages/login.vue'
import { useAuth } from '../../app/composables/useAuth'

const tMock = (key: string) => key

const NuxtLinkStub = { props: ['to'], template: '<a :href="to"><slot /></a>' }

describe('LoginPage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'useLocalePath',
      vi.fn(() => (path: string) => path)
    )
    // useAuth's session is a MODULE-scoped ref (D2) — this file statically
    // imports LoginPage (required for @vue/test-utils' mount()), so
    // vi.resetModules() cannot be used to isolate it between tests here
    // without desynchronising LoginPage's own dynamically-resolved useAuth
    // instance. Explicit clearSession() is the isolation mechanism instead.
    useAuth().clearSession()
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
    const wrapper = mount(LoginPage, {
      global: { mocks: { $t: tMock }, stubs: { NuxtLink: NuxtLinkStub } },
    })

    expect(wrapper.find('[data-testid="login-email"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="login-password"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="login-submit"]').exists()).toBe(true)
  })

  // self-service-password-reset: the API half shipped in v0.36.0 with no
  // entry point anywhere in the UI, so an admin who forgot their password had
  // no path forward at all. This link IS the entry point — its absence is the
  // whole defect, which makes it worth an assertion rather than a glance.
  it('offers a route into password recovery', () => {
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({ public: { apiBase: 'https://api.test/api' } }))
    )
    const wrapper = mount(LoginPage, {
      global: { mocks: { $t: tMock }, stubs: { NuxtLink: NuxtLinkStub } },
    })

    const link = wrapper.find('[data-testid="login-forgot-password"]')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('/forgot-password')
    expect(link.text()).toBe('login.forgotPassword')
  })

  it('on successful login, stores the session IN MEMORY (never sessionStorage/localStorage) and navigates to /', async () => {
    const navigateToMock = vi.fn()
    const fetchMock = vi.fn(async () => ({
      access_token: 'issued-token',
      token_type: 'bearer',
    }))
    vi.stubGlobal('$fetch', fetchMock)
    vi.stubGlobal('navigateTo', navigateToMock)
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({ public: { apiBase: 'https://api.test/api' } }))
    )

    const wrapper = mount(LoginPage, {
      global: { mocks: { $t: tMock }, stubs: { NuxtLink: NuxtLinkStub } },
    })
    await wrapper.find('[data-testid="login-email"]').setValue('admin@example.com')
    await wrapper.find('[data-testid="login-password"]').setValue('secret')
    await wrapper.find('[data-testid="login-form"]').trigger('submit')
    await new Promise((r) => setTimeout(r, 0))

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.test/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: { email: 'admin@example.com', password: 'secret' },
      })
    )

    const { useAuth } = await import('../../app/composables/useAuth')
    expect(useAuth().isAuthenticated.value).toBe(true)
    expect(useAuth().accessToken.value).toBe('issued-token')
    // No storage write anywhere — the login response no longer carries a
    // refresh_token field to persist, and the access token itself is
    // memory-only by design (D2/D4).
    expect(sessionStorage.length).toBe(0)
    expect(localStorage.length).toBe(0)
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

    const wrapper = mount(LoginPage, {
      global: { mocks: { $t: tMock }, stubs: { NuxtLink: NuxtLinkStub } },
    })
    await wrapper.find('[data-testid="login-email"]').setValue('admin@example.com')
    await wrapper.find('[data-testid="login-password"]').setValue('wrong')
    await wrapper.find('[data-testid="login-form"]').trigger('submit')
    await new Promise((r) => setTimeout(r, 0))

    expect(navigateToMock).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="login-error"]').exists()).toBe(true)

    const { useAuth } = await import('../../app/composables/useAuth')
    expect(useAuth().isAuthenticated.value).toBe(false)
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

    mount(LoginPage, { global: { mocks: { $t: tMock }, stubs: { NuxtLink: NuxtLinkStub } } })

    const head = useHeadMock.mock.calls[0]?.[0] as { title?: () => string }
    expect(typeof head?.title).toBe('function')
    expect(head?.title?.()).toBe('head.title.login')
  })

  // DESIGN.md §16: a field's error renders under that field, carries the id its
  // input points at via aria-describedby, and never travels to a sibling field.
  it('renders a validation message under each invalid field, not on the form', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('$fetch', fetchMock)
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({ public: { apiBase: 'https://api.test/api' } }))
    )

    const wrapper = mount(LoginPage, {
      global: { mocks: { $t: tMock }, stubs: { NuxtLink: NuxtLinkStub } },
    })
    await wrapper.find('[data-testid="login-form"]').trigger('submit')

    const emailError = wrapper.find('[data-testid="login-email-error"]')
    const passwordError = wrapper.find('[data-testid="login-password-error"]')

    expect(emailError.exists()).toBe(true)
    expect(passwordError.exists()).toBe(true)
    // Both, from a single submit. Short-circuiting the second check would flag
    // one field at a time and make the user submit twice to see two problems.
    expect(emailError.text()).toBe('login.emailRequired')
    expect(passwordError.text()).toBe('login.passwordRequired')

    expect(wrapper.find('[data-testid="login-email"]').attributes('aria-describedby')).toBe(
      'login-email-error'
    )
    expect(emailError.attributes('id')).toBe('login-email-error')

    // A blocked submit must not reach the network.
    expect(fetchMock).not.toHaveBeenCalled()
    // …and must not render the form-level banner: nothing was attempted, so
    // there is no outcome to report next to the CTA.
    expect(wrapper.find('[data-testid="login-error"]').exists()).toBe(false)
  })

  it('flags a malformed email on the field rather than at form level', async () => {
    vi.stubGlobal('$fetch', vi.fn())
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({ public: { apiBase: 'https://api.test/api' } }))
    )

    const wrapper = mount(LoginPage, {
      global: { mocks: { $t: tMock }, stubs: { NuxtLink: NuxtLinkStub } },
    })
    await wrapper.find('[data-testid="login-email"]').setValue('not-an-email')
    await wrapper.find('[data-testid="login-password"]').setValue('secret')
    await wrapper.find('[data-testid="login-form"]').trigger('submit')

    expect(wrapper.find('[data-testid="login-email-error"]').text()).toBe('login.emailInvalid')
    expect(wrapper.find('[data-testid="login-password-error"]').exists()).toBe(false)
  })

  // The 401 banner is a FORM-level outcome and belongs beside the submit
  // control: attributing it to the email or the password field would leak which
  // half of the credential pair was wrong.
  it('renders the rejected-credentials message next to the submit CTA', async () => {
    vi.stubGlobal(
      '$fetch',
      vi.fn(async () => {
        throw Object.assign(new Error('Invalid credentials.'), { status: 401 })
      })
    )
    vi.stubGlobal('navigateTo', vi.fn())
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({ public: { apiBase: 'https://api.test/api' } }))
    )

    const wrapper = mount(LoginPage, {
      global: { mocks: { $t: tMock }, stubs: { NuxtLink: NuxtLinkStub } },
    })
    await wrapper.find('[data-testid="login-email"]').setValue('admin@example.com')
    await wrapper.find('[data-testid="login-password"]').setValue('wrong')
    await wrapper.find('[data-testid="login-form"]').trigger('submit')
    await new Promise((r) => setTimeout(r, 0))

    const banner = wrapper.find('[data-testid="login-error"]')
    expect(banner.exists()).toBe(true)
    expect(banner.attributes('role')).toBe('alert')
    expect(banner.text()).toContain('login.error')

    // Not on either field.
    expect(wrapper.find('[data-testid="login-email-error"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="login-password-error"]').exists()).toBe(false)

    // Adjacent to the CTA, which is what "near the submit button" has to mean
    // in a test: the banner is the submit control's immediate previous sibling.
    const html = wrapper.html()
    expect(html.indexOf('login-error')).toBeLessThan(html.indexOf('login-submit'))
  })
})
