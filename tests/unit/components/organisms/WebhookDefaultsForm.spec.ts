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
})
