/**
 * forgot-password.spec.ts (self-service-password-reset — backoffice half)
 *
 * The property this page exists to preserve is NEGATIVE: `POST
 * /api/auth/forgot-password` answers 202 with one byte-identical body for a
 * real address, an unknown address and a deactivated account
 * (`ForgotPasswordController.php` is branch-free by design), so the UI must
 * not reintroduce the account-enumeration oracle the API refuses to be.
 *
 * That makes most of this file assertions about what the page must NOT do:
 * not vary its success copy, not claim an inbox was reached, not check
 * whether an address exists before submitting.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ForgotPasswordPage from '../../../app/pages/forgot-password.vue'

const tMock = (key: string) => key

const NuxtLinkStub = { props: ['to'], template: '<a :href="to"><slot /></a>' }

function mountPage() {
  return mount(ForgotPasswordPage, {
    global: { mocks: { $t: tMock }, stubs: { NuxtLink: NuxtLinkStub } },
  })
}

function httpError(status: number, data?: unknown) {
  return Object.assign(new Error(`HTTP ${status}`), { status, data })
}

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({ public: { apiBase: 'https://api.test/api' } }))
    )
    vi.stubGlobal(
      'useLocalePath',
      vi.fn(() => (path: string) => path)
    )
  })

  it('renders an email field and a submit control', () => {
    vi.stubGlobal('$fetch', vi.fn())
    const wrapper = mountPage()

    expect(wrapper.find('[data-testid="forgot-password-email"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="forgot-password-submit"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="forgot-password-form"]').attributes('novalidate')).toBe('')
  })

  it('links back to the sign-in page, so a user who remembered mid-form is not stranded', () => {
    vi.stubGlobal('$fetch', vi.fn())
    const wrapper = mountPage()

    const back = wrapper.find('[data-testid="forgot-password-back"]')
    expect(back.exists()).toBe(true)
    expect(back.attributes('href')).toBe('/login')
  })

  it('POSTs the address to /auth/forgot-password', async () => {
    const fetchMock = vi.fn(async () => ({ message: 'ignored' }))
    vi.stubGlobal('$fetch', fetchMock)

    const wrapper = mountPage()
    await wrapper.find('[data-testid="forgot-password-email"]').setValue('admin@example.com')
    await wrapper.find('[data-testid="forgot-password-form"]').trigger('submit')
    await new Promise((r) => setTimeout(r, 0))

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.test/api/auth/forgot-password',
      expect.objectContaining({ method: 'POST', body: { email: 'admin@example.com' } })
    )
  })

  // THE non-enumeration assertion. Two addresses whose real-world outcomes
  // differ (one has an account, one does not) are indistinguishable to the
  // caller — the API returns 202 for both, so the rendered outcome must be
  // character-for-character the same string.
  it('renders one identical acknowledgement whatever address was submitted', async () => {
    vi.stubGlobal(
      '$fetch',
      vi.fn(async () => ({ message: 'ignored' }))
    )

    const outcomes: string[] = []
    for (const address of ['real@example.com', 'nobody@example.com', 'deactivated@example.com']) {
      const wrapper = mountPage()
      await wrapper.find('[data-testid="forgot-password-email"]').setValue(address)
      await wrapper.find('[data-testid="forgot-password-form"]').trigger('submit')
      await new Promise((r) => setTimeout(r, 0))

      const banner = wrapper.find('[data-testid="forgot-password-banner"]')
      expect(banner.exists()).toBe(true)
      outcomes.push(banner.text())
    }

    expect(new Set(outcomes).size).toBe(1)
    expect(outcomes[0]).toBe('forgotPassword.sent')
  })

  // The copy itself, not only its invariance: a message that names the
  // submitted address, or that says an inbox was reached, tells the caller
  // something the API deliberately refused to.
  it('never echoes the submitted address back into the acknowledgement', async () => {
    vi.stubGlobal(
      '$fetch',
      vi.fn(async () => ({ message: 'ignored' }))
    )

    const wrapper = mountPage()
    await wrapper.find('[data-testid="forgot-password-email"]').setValue('real@example.com')
    await wrapper.find('[data-testid="forgot-password-form"]').trigger('submit')
    await new Promise((r) => setTimeout(r, 0))

    expect(wrapper.text()).not.toContain('real@example.com')
  })

  // The API never sends its 202 body to be displayed — it is English-only by
  // design ("deliberately not localized per recipient — there is no recipient
  // to localize for"). Rendering it would put untranslated server copy in an
  // Italian UI.
  it('renders its own i18n copy rather than the server message', async () => {
    vi.stubGlobal(
      '$fetch',
      vi.fn(async () => ({
        message: 'If an account exists for that address, a password reset link has been sent.',
      }))
    )

    const wrapper = mountPage()
    await wrapper.find('[data-testid="forgot-password-email"]').setValue('real@example.com')
    await wrapper.find('[data-testid="forgot-password-form"]').trigger('submit')
    await new Promise((r) => setTimeout(r, 0))

    expect(wrapper.find('[data-testid="forgot-password-banner"]').text()).toBe(
      'forgotPassword.sent'
    )
  })

  // throttle:6,1 on the route. A user who mistypes twice and retries WILL
  // reach it, and a generic "something went wrong" there reads as a broken
  // product rather than as "wait a minute".
  it('renders a rate-limit message of its own on 429, not the generic failure', async () => {
    vi.stubGlobal(
      '$fetch',
      vi.fn(async () => {
        throw httpError(429)
      })
    )

    const wrapper = mountPage()
    await wrapper.find('[data-testid="forgot-password-email"]').setValue('real@example.com')
    await wrapper.find('[data-testid="forgot-password-form"]').trigger('submit')
    await new Promise((r) => setTimeout(r, 0))

    const banner = wrapper.find('[data-testid="forgot-password-banner"]')
    expect(banner.text()).toBe('forgotPassword.rateLimited')
    expect(banner.text()).not.toBe('forgotPassword.error')
  })

  // The regression this repo has already had once: a form that called
  // applyServerFieldErrors for its side effect and discarded the return
  // value, so a 422 naming a field the form renders no control for vanished.
  it('surfaces a 422 on the field it names', async () => {
    vi.stubGlobal(
      '$fetch',
      vi.fn(async () => {
        throw httpError(422, { errors: { email: ['The email field must be a valid address.'] } })
      })
    )

    const wrapper = mountPage()
    await wrapper.find('[data-testid="forgot-password-email"]').setValue('real@example.com')
    await wrapper.find('[data-testid="forgot-password-form"]').trigger('submit')
    await new Promise((r) => setTimeout(r, 0))

    expect(wrapper.find('[data-testid="forgot-password-email-error"]').text()).toBe(
      'The email field must be a valid address.'
    )
  })

  it('surfaces a 422 naming an UNMAPPED field at form level rather than discarding it', async () => {
    vi.stubGlobal(
      '$fetch',
      vi.fn(async () => {
        throw httpError(422, { errors: { captcha: ['Verification failed.'] } })
      })
    )

    const wrapper = mountPage()
    await wrapper.find('[data-testid="forgot-password-email"]').setValue('real@example.com')
    await wrapper.find('[data-testid="forgot-password-form"]').trigger('submit')
    await new Promise((r) => setTimeout(r, 0))

    // The message reaches the operator, verbatim, instead of being swallowed
    // by a `catch` that only kept the mapper's side effect.
    expect(wrapper.find('[data-testid="forgot-password-banner"]').text()).toBe(
      'Verification failed.'
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
    await wrapper.find('[data-testid="forgot-password-email"]').setValue('real@example.com')
    await wrapper.find('[data-testid="forgot-password-form"]').trigger('submit')
    await new Promise((r) => setTimeout(r, 0))

    expect(wrapper.find('[data-testid="forgot-password-banner"]').text()).toBe(
      'forgotPassword.error'
    )
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
    await wrapper.find('[data-testid="forgot-password-email"]').setValue('real@example.com')
    await wrapper.find('[data-testid="forgot-password-form"]').trigger('submit')
    await new Promise((r) => setTimeout(r, 0))

    expect(wrapper.find('[data-testid="forgot-password-submit"]').attributes('disabled')).toBe('')

    await wrapper.find('[data-testid="forgot-password-form"]').trigger('submit')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    settle?.()
  })

  it('validates the address client-side without ever asking whether it exists', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('$fetch', fetchMock)

    const wrapper = mountPage()
    await wrapper.find('[data-testid="forgot-password-form"]').trigger('submit')

    expect(wrapper.find('[data-testid="forgot-password-email-error"]').text()).toBe(
      'forgotPassword.emailRequired'
    )
    // A blocked submit reaches no network at all — and in particular there is
    // no separate "does this address exist" probe anywhere in this page.
    expect(fetchMock).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="forgot-password-banner"]').exists()).toBe(false)
  })

  it('associates the field error with its input for assistive tech', async () => {
    vi.stubGlobal('$fetch', vi.fn())

    const wrapper = mountPage()
    await wrapper.find('[data-testid="forgot-password-form"]').trigger('submit')

    const input = wrapper.find('[data-testid="forgot-password-email"]')
    expect(input.attributes('aria-invalid')).toBe('true')
    expect(input.attributes('aria-describedby')).toBe('forgot-password-email-error')
    expect(wrapper.find('[data-testid="forgot-password-email-error"]').attributes('id')).toBe(
      'forgot-password-email-error'
    )
  })

  it('announces the outcome banner and makes it a focus target', async () => {
    vi.stubGlobal(
      '$fetch',
      vi.fn(async () => ({ message: 'ok' }))
    )

    const wrapper = mount(ForgotPasswordPage, {
      attachTo: document.body,
      global: { mocks: { $t: tMock }, stubs: { NuxtLink: NuxtLinkStub } },
    })
    await wrapper.find('[data-testid="forgot-password-email"]').setValue('real@example.com')
    await wrapper.find('[data-testid="forgot-password-form"]').trigger('submit')
    await new Promise((r) => setTimeout(r, 0))
    await wrapper.vm.$nextTick()

    const banner = wrapper.find('[data-testid="forgot-password-banner"]')
    expect(banner.attributes('role')).toBe('alert')
    expect(banner.attributes('aria-live')).toBe('polite')
    // Colour alone is not an error signal (WCAG 1.4.1) and an outcome the eye
    // has to hunt for is not an outcome — focus moves to it.
    expect(banner.attributes('tabindex')).toBe('-1')
    expect(document.activeElement).toBe(banner.element)

    wrapper.unmount()
  })

  it('routes the <title> through i18n instead of a hardcoded literal', () => {
    const useHeadMock = vi.fn()
    vi.stubGlobal('useHead', useHeadMock)
    vi.stubGlobal('$fetch', vi.fn())

    mountPage()

    const head = useHeadMock.mock.calls[0]?.[0] as { title?: () => string }
    expect(head?.title?.()).toBe('head.title.forgotPassword')
  })
})
