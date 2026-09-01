/**
 * reset-password.spec.ts (self-service-password-reset — backoffice half)
 *
 * The emailed link's shape is NOT a guess. `SendPasswordResetLinkJob.php:135`
 * mints it as:
 *
 *   {BACKOFFICE_ORIGIN}/reset-password/{token}?email={urlencoded email}
 *
 * — token in a PATH SEGMENT, email as the only query parameter. A page that
 * read `?token=` instead would render perfectly and fail every single time,
 * which is the failure mode worth a dedicated test.
 *
 * `ResetPasswordController::fail()` answers unknown-user, deactivated-user,
 * invalid token and expired token with ONE generic 422 keyed on `token` — a
 * field this page renders no control for. That message therefore has to reach
 * the form-level banner through `applyServerFieldErrors`' RETURN VALUE, which
 * is exactly the value the known past defect discarded.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ResetPasswordPage from '../../../app/pages/reset-password/[[token]].vue'

const tMock = (key: string) => key

const NuxtLinkStub = { props: ['to'], template: '<a :href="to"><slot /></a>' }

function stubRoute(params: Record<string, unknown>, query: Record<string, unknown> = {}): void {
  vi.stubGlobal(
    'useRoute',
    vi.fn(() => ({ path: '/reset-password', fullPath: '/reset-password', params, query }))
  )
}

function mountPage(options: { attach?: boolean } = {}) {
  return mount(ResetPasswordPage, {
    ...(options.attach === true ? { attachTo: document.body } : {}),
    global: { mocks: { $t: tMock }, stubs: { NuxtLink: NuxtLinkStub } },
  })
}

function httpError(status: number, data?: unknown) {
  return Object.assign(new Error(`HTTP ${status}`), { status, data })
}

async function fillAndSubmit(
  wrapper: ReturnType<typeof mountPage>,
  password = 'a-new-password',
  confirmation = 'a-new-password'
): Promise<void> {
  await wrapper.find('[data-testid="reset-password-password"]').setValue(password)
  await wrapper.find('[data-testid="reset-password-confirmation"]').setValue(confirmation)
  await wrapper.find('[data-testid="reset-password-form"]').trigger('submit')
  await new Promise((r) => setTimeout(r, 0))
}

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({ public: { apiBase: 'https://api.test/api' } }))
    )
    vi.stubGlobal(
      'useLocalePath',
      vi.fn(() => (path: string) => path)
    )
    vi.stubGlobal('navigateTo', vi.fn())
    stubRoute({ token: 'a-valid-looking-token' }, { email: 'admin@example.com' })
  })

  it('reads the token from the PATH SEGMENT and the email from ?email=', async () => {
    const fetchMock = vi.fn(async () => ({ message: 'ok' }))
    vi.stubGlobal('$fetch', fetchMock)
    stubRoute({ token: 'tok-from-path' }, { email: 'ada@example.com' })

    const wrapper = mountPage()
    // The address is shown so the operator can see WHICH account they are
    // resetting — a link forwarded to the wrong person is otherwise silent.
    expect(
      (wrapper.find('[data-testid="reset-password-email"]').element as HTMLInputElement).value
    ).toBe('ada@example.com')

    await fillAndSubmit(wrapper)

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.test/api/auth/reset-password',
      expect.objectContaining({
        method: 'POST',
        body: {
          token: 'tok-from-path',
          email: 'ada@example.com',
          password: 'a-new-password',
          password_confirmation: 'a-new-password',
        },
      })
    )
  })

  // A user who opens /reset-password by hand, or whose mail client truncated
  // the link, must land on something that explains itself and offers a way
  // forward — never a crash and never a form that cannot succeed.
  it('renders an invalid-link state, and no form, when the token segment is absent', () => {
    vi.stubGlobal('$fetch', vi.fn())
    stubRoute({}, {})

    const wrapper = mountPage()

    expect(wrapper.find('[data-testid="reset-password-invalid-link"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="reset-password-form"]').exists()).toBe(false)
    // The only useful action from here.
    expect(wrapper.find('[data-testid="reset-password-request-new"]').attributes('href')).toBe(
      '/forgot-password'
    )
  })

  it('treats a blank or whitespace-only token as absent rather than submitting it', () => {
    vi.stubGlobal('$fetch', vi.fn())
    stubRoute({ token: '   ' }, { email: 'ada@example.com' })

    const wrapper = mountPage()

    expect(wrapper.find('[data-testid="reset-password-invalid-link"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="reset-password-form"]').exists()).toBe(false)
  })

  // Nuxt hands a repeated/catch-all param as an array. Reading `.trim()` off
  // it would throw during setup and blank the page.
  it('does not crash when the router hands the token param as an array', () => {
    vi.stubGlobal('$fetch', vi.fn())
    stubRoute({ token: ['a', 'b'] }, {})

    expect(() => mountPage()).not.toThrow()
  })

  it('still renders the form when the link carried no ?email=, so the user can supply it', () => {
    vi.stubGlobal('$fetch', vi.fn())
    stubRoute({ token: 'tok' }, {})

    const wrapper = mountPage()

    expect(wrapper.find('[data-testid="reset-password-form"]').exists()).toBe(true)
    expect(
      (wrapper.find('[data-testid="reset-password-email"]').element as HTMLInputElement).value
    ).toBe('')
  })

  it('marks the form novalidate and renders errors through FieldError', () => {
    vi.stubGlobal('$fetch', vi.fn())
    const wrapper = mountPage()

    expect(wrapper.find('[data-testid="reset-password-form"]').attributes('novalidate')).toBe('')
  })

  it('validates every field on one submit rather than one at a time', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('$fetch', fetchMock)
    stubRoute({ token: 'tok' }, {})

    const wrapper = mountPage()
    await wrapper.find('[data-testid="reset-password-form"]').trigger('submit')

    expect(wrapper.find('[data-testid="reset-password-email-error"]').text()).toBe(
      'resetPassword.emailRequired'
    )
    expect(wrapper.find('[data-testid="reset-password-password-error"]').text()).toBe(
      'resetPassword.passwordRequired'
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('flags a password shorter than the API floor before spending the single-use token', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('$fetch', fetchMock)

    const wrapper = mountPage()
    await fillAndSubmit(wrapper, 'short', 'short')

    expect(wrapper.find('[data-testid="reset-password-password-error"]').text()).toBe(
      'resetPassword.passwordTooShort'
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('flags a mismatched confirmation locally, for the same reason', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('$fetch', fetchMock)

    const wrapper = mountPage()
    await fillAndSubmit(wrapper, 'a-new-password', 'a-different-password')

    expect(wrapper.find('[data-testid="reset-password-confirmation-error"]').text()).toBe(
      'resetPassword.confirmMismatch'
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows a success state and offers the sign-in link on 200', async () => {
    vi.stubGlobal(
      '$fetch',
      vi.fn(async () => ({ message: 'ok' }))
    )

    const wrapper = mountPage()
    await fillAndSubmit(wrapper)

    expect(wrapper.find('[data-testid="reset-password-success"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="reset-password-form"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="reset-password-signin"]').attributes('href')).toBe('/login')
  })

  // The token is single-use and already spent, but it stays in the address
  // bar — in history, in a screen share, in whatever the browser syncs.
  it('clears the token out of the address bar once the reset succeeded', async () => {
    vi.stubGlobal(
      '$fetch',
      vi.fn(async () => ({ message: 'ok' }))
    )
    const replaceState = vi.spyOn(window.history, 'replaceState')

    const wrapper = mountPage()
    await fillAndSubmit(wrapper)

    expect(replaceState).toHaveBeenCalled()
    const url = replaceState.mock.calls.at(-1)?.[2]
    expect(String(url)).not.toContain('a-valid-looking-token')

    replaceState.mockRestore()
  })

  it('renders a rate-limit message of its own on 429', async () => {
    vi.stubGlobal(
      '$fetch',
      vi.fn(async () => {
        throw httpError(429)
      })
    )

    const wrapper = mountPage()
    await fillAndSubmit(wrapper)

    const banner = wrapper.find('[data-testid="reset-password-banner"]')
    expect(banner.text()).toBe('resetPassword.rateLimited')
    // …and the form stays, so the user can retry once the window rolls over.
    expect(wrapper.find('[data-testid="reset-password-form"]').exists()).toBe(true)
  })

  // The generic failure the controller uses for unknown-user, deactivated
  // user, bad token and expired token. It is keyed on `token`, and this page
  // has no token control — so it can only reach the operator through the
  // mapper's return value.
  it('surfaces the generic token 422 at form level, TRANSLATED, instead of discarding it', async () => {
    // The server now sends a CODE. It used to send the English sentence "This
    // password reset link is invalid or has expired. Request a new one." and
    // this page rendered it verbatim, so an Italian operator on an Italian page
    // read English. A response body is machine-facing; only this layer knows
    // the reader's locale.
    vi.stubGlobal(
      '$fetch',
      vi.fn(async () => {
        throw httpError(422, { errors: { token: ['reset_link_invalid'] } })
      })
    )

    const wrapper = mountPage()
    await fillAndSubmit(wrapper)

    expect(wrapper.find('[data-testid="reset-password-banner"]').text()).toBe(
      'resetPassword.serverError.reset_link_invalid'
    )
    // An expired link is unrecoverable from here; the way out is a new one.
    expect(wrapper.find('[data-testid="reset-password-request-new"]').exists()).toBe(true)
  })

  it('falls back to the raw code rather than hiding an untranslated one', async () => {
    // A code with no copy yet must stay READABLE and specific. Swallowing it
    // into a generic "something went wrong" would hide which of several
    // failures happened, and would make the missing translation invisible —
    // the locale-parity tests are what catch that, and they only work if the
    // gap is visible when they are not run.
    vi.stubGlobal(
      '$fetch',
      vi.fn(async () => {
        throw httpError(422, { errors: { token: ['some_future_code'] } })
      })
    )

    // `tests/unit/setup.ts` stubs `te` as always-true so an identity `t` stays
    // the observed value everywhere else. Its own docblock says a spec testing
    // the MISSING-key branch must re-stub it, which is exactly this one.
    vi.stubGlobal(
      'useI18n',
      vi.fn(() => ({
        t: (key: string) => key,
        te: (key: string) => !key.endsWith('.some_future_code'),
        locale: ref('it'),
      }))
    )

    const wrapper = mountPage()
    await fillAndSubmit(wrapper)

    expect(wrapper.find('[data-testid="reset-password-banner"]').text()).toBe('some_future_code')
  })

  it('maps a 422 on a rendered field onto that field', async () => {
    vi.stubGlobal(
      '$fetch',
      vi.fn(async () => {
        throw httpError(422, { errors: { password: ['The password is too weak.'] } })
      })
    )

    const wrapper = mountPage()
    await fillAndSubmit(wrapper)

    expect(wrapper.find('[data-testid="reset-password-password-error"]').text()).toBe(
      'The password is too weak.'
    )
  })

  it('falls back to its own failure copy when the rejection carries no field payload', async () => {
    vi.stubGlobal(
      '$fetch',
      vi.fn(async () => {
        throw httpError(500)
      })
    )

    const wrapper = mountPage()
    await fillAndSubmit(wrapper)

    expect(wrapper.find('[data-testid="reset-password-banner"]').text()).toBe('resetPassword.error')
  })

  it('blocks a second submit while the first is still in flight', async () => {
    let settle: (() => void) | undefined
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          settle = () => resolve({ message: 'ok' })
        })
    )
    vi.stubGlobal('$fetch', fetchMock)

    const wrapper = mountPage()
    await wrapper.find('[data-testid="reset-password-password"]').setValue('a-new-password')
    await wrapper.find('[data-testid="reset-password-confirmation"]').setValue('a-new-password')
    await wrapper.find('[data-testid="reset-password-form"]').trigger('submit')
    await new Promise((r) => setTimeout(r, 0))

    expect(wrapper.find('[data-testid="reset-password-submit"]').attributes('disabled')).toBe('')

    await wrapper.find('[data-testid="reset-password-form"]').trigger('submit')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    settle?.()
  })

  it('announces the outcome banner and makes it a focus target', async () => {
    vi.stubGlobal(
      '$fetch',
      vi.fn(async () => {
        throw httpError(429)
      })
    )

    const wrapper = mountPage({ attach: true })
    await fillAndSubmit(wrapper)
    await wrapper.vm.$nextTick()

    const banner = wrapper.find('[data-testid="reset-password-banner"]')
    expect(banner.attributes('role')).toBe('alert')
    expect(banner.attributes('aria-live')).toBe('polite')
    expect(banner.attributes('tabindex')).toBe('-1')
    expect(document.activeElement).toBe(banner.element)

    wrapper.unmount()
  })

  it('never renders the token anywhere in the page', async () => {
    vi.stubGlobal(
      '$fetch',
      vi.fn(async () => {
        throw httpError(429)
      })
    )
    stubRoute({ token: 'SUPER-SECRET-TOKEN' }, { email: 'ada@example.com' })

    const wrapper = mountPage()
    await fillAndSubmit(wrapper)

    expect(wrapper.html()).not.toContain('SUPER-SECRET-TOKEN')
  })

  it('routes the <title> through i18n instead of a hardcoded literal', () => {
    const useHeadMock = vi.fn()
    vi.stubGlobal('useHead', useHeadMock)
    vi.stubGlobal('$fetch', vi.fn())

    mountPage()

    const head = useHeadMock.mock.calls[0]?.[0] as { title?: () => string }
    expect(head?.title?.()).toBe('head.title.resetPassword')
  })
})
