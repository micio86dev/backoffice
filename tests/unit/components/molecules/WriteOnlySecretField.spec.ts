/**
 * WriteOnlySecretField.vue (Unit 2b, task 20.2 — RED)
 *
 * "set a new secret" state, never a stored value; emits only when a new
 * value is typed. There is deliberately no `value`/`modelValue` prop that
 * could carry a stored secret — the leak this component prevents is
 * structural, not a rendering choice.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import WriteOnlySecretField from '../../../../app/components/molecules/WriteOnlySecretField.vue'

const tMock = (key: string) => key

describe('WriteOnlySecretField', () => {
  it('never renders a stored secret value — the input always starts empty', () => {
    const wrapper = mount(WriteOnlySecretField, {
      props: { id: 'webhook-secret', label: 'Webhook secret', configured: true },
      global: { mocks: { $t: tMock } },
    })

    const input = wrapper.get('[data-testid="webhook-secret"]')
    expect((input.element as HTMLInputElement).value).toBe('')
  })

  it('shows a distinct "configured" state without ever exposing the value', () => {
    const configured = mount(WriteOnlySecretField, {
      props: { id: 'webhook-secret', label: 'Webhook secret', configured: true },
      global: { mocks: { $t: tMock } },
    })
    const notConfigured = mount(WriteOnlySecretField, {
      props: { id: 'webhook-secret', label: 'Webhook secret', configured: false },
      global: { mocks: { $t: tMock } },
    })

    expect(configured.text()).toContain('projects.secret.configured')
    expect(notConfigured.text()).toContain('projects.secret.notSet')
  })

  it('does not emit until a new value is actually typed', () => {
    const wrapper = mount(WriteOnlySecretField, {
      props: { id: 'webhook-secret', label: 'Webhook secret', configured: true },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.emitted('update:value')).toBeUndefined()
  })

  it('emits the new value once typed', async () => {
    const wrapper = mount(WriteOnlySecretField, {
      props: { id: 'webhook-secret', label: 'Webhook secret', configured: false },
      global: { mocks: { $t: tMock } },
    })

    await wrapper.get('[data-testid="webhook-secret"]').setValue('new-secret-value')

    expect(wrapper.emitted('update:value')?.at(-1)).toEqual(['new-secret-value'])
  })

  it('emits undefined again if the operator clears what they typed, so the field is omitted from the payload', async () => {
    const wrapper = mount(WriteOnlySecretField, {
      props: { id: 'webhook-secret', label: 'Webhook secret', configured: false },
      global: { mocks: { $t: tMock } },
    })

    await wrapper.get('[data-testid="webhook-secret"]').setValue('typed')
    await wrapper.get('[data-testid="webhook-secret"]').setValue('')

    expect(wrapper.emitted('update:value')?.at(-1)).toEqual([undefined])
  })
})
