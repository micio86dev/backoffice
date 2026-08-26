/**
 * LlmCredentialsPanel.vue (pluggable-conversation-llm PR P7, tasks P7.3/P7.5/
 * P7.7 — RED).
 *
 * admin-backoffice spec, "The credentials panel masks the key structurally
 * and refuses to delete a bound credential without explanation":
 *   - `WriteOnlySecretField` is reused UNCHANGED — no `value`/`modelValue`
 *     prop anywhere, so the panel structurally cannot render a stored secret.
 *   - a 409 `credential_in_use` remove response renders the refusal AND
 *     names the bound templates, never a generic failure.
 *   - rotating a credential confirms success and never displays either the
 *     old or the new key value.
 *
 * Plus the non-negotiable state contract: a key stored but unverified
 * (`validation_error` = `rate_limited`/`unreachable`, `validated_at` null)
 * must read differently from a verified key AND from a rejected one (which
 * is never stored at all — the API refuses it with a 422 the create form
 * surfaces inline, never the raw machine code).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { waitFor, waitForTestId } from '../../support/wait-for'
import WriteOnlySecretField from '../../../../app/components/molecules/WriteOnlySecretField.vue'

const tMock = (key: string) => key
const listCredentialsMock = vi.fn()
const createCredentialMock = vi.fn()
const rotateCredentialMock = vi.fn()
const deleteCredentialMock = vi.fn()

vi.mock('../../../../app/composables/useLlmCredentials', () => ({
  useLlmCredentials: () => ({
    listCredentials: listCredentialsMock,
    createCredential: createCredentialMock,
    rotateCredential: rotateCredentialMock,
    deleteCredential: deleteCredentialMock,
  }),
}))

const LlmCredentialsPanel = (
  await import('../../../../app/components/organisms/LlmCredentialsPanel.vue')
).default

const verifiedCredential = {
  id: 1,
  name: 'Prod Gemini key',
  vendor: 'google',
  key_last_four: '9012',
  validated_at: '2026-08-20T10:00:00Z',
  validation_error: null,
  created_at: '2026-08-01T10:00:00Z',
}

const rateLimitedCredential = {
  id: 2,
  name: 'Staging Gemini key',
  vendor: 'google',
  key_last_four: '3456',
  validated_at: null,
  validation_error: 'rate_limited',
  created_at: '2026-08-10T10:00:00Z',
}

afterEach(() => {
  document.body.innerHTML = ''
})

beforeEach(() => {
  listCredentialsMock.mockReset().mockResolvedValue({ data: [verifiedCredential] })
  createCredentialMock.mockReset()
  rotateCredentialMock.mockReset()
  deleteCredentialMock.mockReset()
})

async function openCreateDialog(wrapper: ReturnType<typeof mount>): Promise<void> {
  await wrapper.get('[data-testid="llm-credentials-new"]').trigger('click')
  await waitForTestId('llm-credential-form')
}

describe('LlmCredentialsPanel — WriteOnlySecretField reuse (no value prop)', () => {
  it('reuses WriteOnlySecretField unchanged for entering the key, with no value/modelValue prop', async () => {
    const wrapper = mount(LlmCredentialsPanel, {
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })
    await flushPromises()
    await openCreateDialog(wrapper)

    const secretField = wrapper.findComponent(WriteOnlySecretField)
    expect(secretField.exists()).toBe(true)
    expect(secretField.props()).not.toHaveProperty('value')
    expect(secretField.props()).not.toHaveProperty('modelValue')

    wrapper.unmount()
  })

  it('lists only key_last_four for a stored credential, never a full key', async () => {
    const wrapper = mount(LlmCredentialsPanel, { global: { mocks: { $t: tMock } } })
    await flushPromises()

    const keyCells = wrapper.findAll('td').filter((cell) => cell.text().includes('9012'))
    expect(keyCells).toHaveLength(1)
    // Exactly the masked form — never the last four digits alone, and
    // structurally incapable of being a longer, unmasked value since the
    // mock resource (matching the real `LlmCredentialResource`) never
    // carries a full key at all.
    expect(keyCells[0]?.text().trim()).toBe('•••• 9012')
  })
})

describe('LlmCredentialsPanel — remove refusal (409 credential_in_use)', () => {
  it('names the bound templates from the response rather than a generic failure', async () => {
    deleteCredentialMock.mockRejectedValueOnce(
      Object.assign(new Error('Conflict'), {
        status: 409,
        data: {
          error: 'credential_in_use',
          message: 'Unbind every template using this credential before deleting it.',
          templates: ['Sales bot', 'Support bot'],
        },
      })
    )

    const wrapper = mount(LlmCredentialsPanel, {
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })
    await flushPromises()

    await wrapper.get('[data-testid="llm-credential-remove-1"]').trigger('click')
    await waitForTestId('confirm-dialog-confirm')

    const confirmButton = document.body.querySelector<HTMLButtonElement>(
      '[data-testid="confirm-dialog-confirm"]'
    )
    confirmButton?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    confirmButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    const conflict = await waitForTestId('llm-credential-remove-conflict')

    expect(conflict.textContent).toContain('Sales bot')
    expect(conflict.textContent).toContain('Support bot')
    // Never a generic failure toast/testid standing in for the real reason.
    expect(document.body.querySelector('[data-testid="llm-credential-remove-error"]')).toBeNull()

    wrapper.unmount()
  })

  it('deletes an unbound credential with no conflict banner', async () => {
    deleteCredentialMock.mockResolvedValueOnce(undefined)

    const wrapper = mount(LlmCredentialsPanel, {
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })
    await flushPromises()

    await wrapper.get('[data-testid="llm-credential-remove-1"]').trigger('click')
    await waitForTestId('confirm-dialog-confirm')

    const confirmButton = document.body.querySelector<HTMLButtonElement>(
      '[data-testid="confirm-dialog-confirm"]'
    )
    confirmButton?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    confirmButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    await waitFor(() => deleteCredentialMock.mock.calls.length > 0, 'the delete call to fire')
    await flushPromises()

    expect(document.body.querySelector('[data-testid="llm-credential-remove-conflict"]')).toBeNull()

    wrapper.unmount()
  })
})

describe('LlmCredentialsPanel — rotate (never displays old or new key)', () => {
  it('confirms success and never renders the typed key value afterward', async () => {
    rotateCredentialMock.mockResolvedValueOnce({
      data: { ...verifiedCredential, validated_at: '2026-08-26T10:00:00Z' },
    })

    const wrapper = mount(LlmCredentialsPanel, {
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })
    await flushPromises()

    await wrapper.get('[data-testid="llm-credential-rotate-1"]').trigger('click')
    await waitForTestId('llm-credential-rotate-form')

    const input = document.body.querySelector<HTMLInputElement>(
      '[data-testid="llm-credential-rotate-api-key"]'
    )
    input!.value = 'brand-new-secret-value'
    input!.dispatchEvent(new Event('input'))
    await flushPromises()

    document.body
      .querySelector<HTMLFormElement>('[data-testid="llm-credential-rotate-form"]')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))

    await waitForTestId('llm-credential-rotate-success')

    expect(rotateCredentialMock).toHaveBeenCalledWith(1, { api_key: 'brand-new-secret-value' })
    expect(document.body.textContent).not.toContain('brand-new-secret-value')
    expect(document.body.querySelector('[data-testid="llm-credential-rotate-form"]')).toBeNull()

    wrapper.unmount()
  })

  it('surfaces a rejected rotation as a mapped message, never the raw "invalid_key" code', async () => {
    rotateCredentialMock.mockRejectedValueOnce(
      Object.assign(new Error('422'), {
        status: 422,
        data: { errors: { api_key: ['invalid_key'] } },
      })
    )

    const wrapper = mount(LlmCredentialsPanel, {
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })
    await flushPromises()

    await wrapper.get('[data-testid="llm-credential-rotate-1"]').trigger('click')
    await waitForTestId('llm-credential-rotate-form')

    const input = document.body.querySelector<HTMLInputElement>(
      '[data-testid="llm-credential-rotate-api-key"]'
    )
    input!.value = 'a-dead-key'
    input!.dispatchEvent(new Event('input'))
    await flushPromises()

    document.body
      .querySelector<HTMLFormElement>('[data-testid="llm-credential-rotate-form"]')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))

    const errorEl = await waitForTestId('llm-credential-rotate-error')

    expect(errorEl.textContent).not.toContain('invalid_key')
    expect(document.body.textContent).not.toContain('a-dead-key')

    wrapper.unmount()
  })
})

describe('LlmCredentialsPanel — verified vs. stored-but-unverified states are distinguishable', () => {
  it('reads differently for a verified key than for a rate_limited or unreachable one', async () => {
    listCredentialsMock.mockReset().mockResolvedValue({
      data: [verifiedCredential, rateLimitedCredential],
    })

    const wrapper = mount(LlmCredentialsPanel, { global: { mocks: { $t: tMock } } })
    await flushPromises()

    const verifiedStatus = wrapper.get('[data-testid="llm-credential-status-1"]').text()
    const rateLimitedStatus = wrapper.get('[data-testid="llm-credential-status-2"]').text()

    expect(verifiedStatus).not.toBe(rateLimitedStatus)
    expect(verifiedStatus).toContain('settings.llmCredentials.status.verified')
    expect(rateLimitedStatus).toContain('settings.llmCredentials.error.rateLimited')
  })

  it('reads unreachable distinctly from rate_limited, never collapsed into one generic label', async () => {
    listCredentialsMock.mockReset().mockResolvedValue({
      data: [
        rateLimitedCredential,
        {
          ...rateLimitedCredential,
          id: 3,
          name: 'Unreachable key',
          validation_error: 'unreachable',
        },
      ],
    })

    const wrapper = mount(LlmCredentialsPanel, { global: { mocks: { $t: tMock } } })
    await flushPromises()

    const rateLimitedStatus = wrapper.get('[data-testid="llm-credential-status-2"]').text()
    const unreachableStatus = wrapper.get('[data-testid="llm-credential-status-3"]').text()

    expect(rateLimitedStatus).not.toBe(unreachableStatus)
    expect(unreachableStatus).toContain('settings.llmCredentials.error.unreachable')
  })
})

describe('LlmCredentialsPanel — create form 422 (invalid_key mapped, never raw)', () => {
  it('maps a create-time invalid_key rejection to a readable message, not the bare code', async () => {
    createCredentialMock.mockRejectedValueOnce(
      Object.assign(new Error('422'), {
        status: 422,
        data: { errors: { api_key: ['invalid_key'] } },
      })
    )

    const wrapper = mount(LlmCredentialsPanel, {
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })
    await flushPromises()
    await openCreateDialog(wrapper)

    const nameInput = document.body.querySelector<HTMLInputElement>(
      '[data-testid="llm-credential-form-name"]'
    )
    nameInput!.value = 'New key'
    nameInput!.dispatchEvent(new Event('input'))
    await flushPromises()

    const keyInput = document.body.querySelector<HTMLInputElement>(
      '[data-testid="llm-credential-form-api-key"]'
    )
    keyInput!.value = 'a-dead-key'
    keyInput!.dispatchEvent(new Event('input'))
    await flushPromises()

    document.body
      .querySelector<HTMLFormElement>('[data-testid="llm-credential-form"]')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))

    const errorEl = await waitForTestId('llm-credential-form-api-key-error')

    expect(errorEl.textContent).not.toContain('invalid_key')
    expect(errorEl.textContent).toContain('settings.llmCredentials.error.invalidKey')

    wrapper.unmount()
  })
})
