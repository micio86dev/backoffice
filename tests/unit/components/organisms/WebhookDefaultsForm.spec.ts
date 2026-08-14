/**
 * WebhookDefaultsForm.vue (Unit 6, task 24.2 — RED)
 *
 * `default_webhook_secret` uses `WriteOnlySecretField`, never prefilled or
 * rendered.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const tMock = (key: string) => key
const updateOrganizationMock = vi.fn()

vi.mock('../../../../app/composables/useOrganization', () => ({
  useOrganization: () => ({ updateOrganization: updateOrganizationMock }),
}))

const WebhookDefaultsForm = (
  await import('../../../../app/components/organisms/WebhookDefaultsForm.vue')
).default

function organization(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'Acme',
    slug: 'acme',
    default_webhook_url: 'https://example.com/hook',
    default_webhook_events: '["progress"]',
    has_default_webhook_secret: true,
    created_at: null,
    updated_at: null,
    ...overrides,
  }
}

describe('WebhookDefaultsForm', () => {
  beforeEach(() => {
    updateOrganizationMock.mockReset().mockResolvedValue({ data: organization() })
  })

  it('never prefills the secret field even when one is already configured', () => {
    const wrapper = mount(WebhookDefaultsForm, {
      props: { organization: organization() },
      global: { mocks: { $t: tMock } },
    })

    const secretInput = wrapper.get('[data-testid="webhook-defaults-secret"]')
    expect((secretInput.element as HTMLInputElement).value).toBe('')
    expect(wrapper.text()).toContain('projects.secret.configured')
  })

  it('prefills the URL with the current default', () => {
    const wrapper = mount(WebhookDefaultsForm, {
      props: { organization: organization() },
      global: { mocks: { $t: tMock } },
    })

    expect(
      (wrapper.get('[data-testid="webhook-defaults-url"]').element as HTMLInputElement).value
    ).toBe('https://example.com/hook')
  })

  it('omits the secret from the payload when the operator did not type a new one', async () => {
    const wrapper = mount(WebhookDefaultsForm, {
      props: { organization: organization() },
      global: { mocks: { $t: tMock } },
    })

    await wrapper.get('[data-testid="webhook-defaults-form"]').trigger('submit')
    await flushPromises()

    const [payload] = updateOrganizationMock.mock.calls[0] as [Record<string, unknown>]
    expect(payload).not.toHaveProperty('default_webhook_secret')
  })

  it('includes the secret in the payload once the operator types a new one', async () => {
    const wrapper = mount(WebhookDefaultsForm, {
      props: { organization: organization() },
      global: { mocks: { $t: tMock } },
    })

    await wrapper.get('[data-testid="webhook-defaults-secret"]').setValue('brand-new-secret')
    await wrapper.get('[data-testid="webhook-defaults-form"]').trigger('submit')
    await flushPromises()

    const [payload] = updateOrganizationMock.mock.calls[0] as [Record<string, unknown>]
    expect(payload).toMatchObject({ default_webhook_secret: 'brand-new-secret' })
  })

  // form-clarity-and-console-warnings, D2: this form previously `catch {}`ed
  // every rejection, silently dropping a 422 on `default_webhook_url`.
  it('surfaces a 422 on default_webhook_url next to its own control', async () => {
    updateOrganizationMock.mockRejectedValueOnce(
      Object.assign(new Error('422'), {
        status: 422,
        data: { errors: { default_webhook_url: ['That address is not reachable.'] } },
      })
    )

    const wrapper = mount(WebhookDefaultsForm, {
      props: { organization: organization() },
      global: { mocks: { $t: tMock } },
    })

    await wrapper.get('[data-testid="webhook-defaults-form"]').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-testid="webhook-defaults-url-error"]').text()).toContain(
      'That address is not reachable.'
    )
  })

  // form-clarity-and-console-warnings — regression proof for CRITICAL 1's
  // fix pattern. `default_webhook_secret` has no entry in
  // SERVER_FIELD_TO_ERROR_KEY (the molecule owns no error slot, D7), so a
  // server 422 naming it must reach the form-level banner VERBATIM — not be
  // silently discarded in favour of the generic saveError string.
  it('surfaces a 422 on a field outside the map (default_webhook_secret) in the banner, not the generic message', async () => {
    updateOrganizationMock.mockRejectedValueOnce(
      Object.assign(new Error('422'), {
        status: 422,
        data: { errors: { default_webhook_secret: ['That secret is too short.'] } },
      })
    )

    const wrapper = mount(WebhookDefaultsForm, {
      props: { organization: organization() },
      global: { mocks: { $t: tMock } },
    })

    await wrapper.get('[data-testid="webhook-defaults-form"]').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-testid="webhook-defaults-banner"]').text()).toContain(
      'That secret is too short.'
    )
  })
})

// form-clarity-and-console-warnings, D6: the orphan `settings.webhooks.note`
// FieldDescription at the old `:24` sat loose inside FieldGroup, outside any
// Field — describing url+secret as a PAIR. Fixed by a FieldSet wrapping both
// controls (the ApiKeysPanel.vue:76-83 pattern), plus a new per-field help
// text on the URL control.
describe('WebhookDefaultsForm — field help (D6)', () => {
  it("renders the URL help text and points the control's aria-describedby at it", () => {
    const wrapper = mount(WebhookDefaultsForm, {
      props: { organization: organization() },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.text()).toContain('settings.webhooks.help.url')

    const control = wrapper.get('[data-testid="webhook-defaults-url"]')
    const describedIds = (control.attributes('aria-describedby') ?? '').split(/\s+/).filter(Boolean)
    const matched = describedIds.some((id) => {
      const el = wrapper.find(`#${id}`)
      return el.exists() && el.text() === 'settings.webhooks.help.url'
    })
    expect(matched).toBe(true)
  })

  it('reattaches the note as a FieldSet description covering both url and secret, not a loose sibling', () => {
    const wrapper = mount(WebhookDefaultsForm, {
      props: { organization: organization() },
      global: { mocks: { $t: tMock } },
    })

    const fieldset = wrapper.find('fieldset')
    expect(fieldset.exists()).toBe(true)
    expect(fieldset.text()).toContain('settings.webhooks.note')
    // Both controls are inside the SAME fieldset the note now describes.
    expect(fieldset.find('[data-testid="webhook-defaults-url"]').exists()).toBe(true)
    expect(fieldset.find('[data-testid="webhook-defaults-secret"]').exists()).toBe(true)
  })
})
