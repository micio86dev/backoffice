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

// feature/form-drawer — both of this panel's FORMS (create, and the per-row
// key rotation) move onto the shared FormDrawer. The remove confirmation
// deliberately does not: it is a destructive confirm, not a form.
describe('LlmCredentialsPanel — the create and rotate drawers', () => {
  const inDrawer = (testId: string) =>
    document.body.querySelector(`[data-testid="form-drawer"] [data-testid="${testId}"]`)

  function submitFromFooter(): void {
    document.body
      .querySelector<HTMLButtonElement>('[data-testid="form-drawer-save"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }

  function setValue(testId: string, value: string): void {
    const input = document.body.querySelector<HTMLInputElement>(`[data-testid="${testId}"]`)
    input!.value = value
    input!.dispatchEvent(new Event('input'))
  }

  async function mountPanel() {
    const wrapper = mount(LlmCredentialsPanel, {
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })
    await flushPromises()

    return wrapper
  }

  it('renders the create form inside the drawer, not a centred dialog', async () => {
    const wrapper = await mountPanel()

    await wrapper.get('[data-testid="llm-credentials-new"]').trigger('click')
    await waitFor(() => inDrawer('llm-credential-form'), 'the create form to mount in the drawer')

    expect(document.body.querySelector('[data-slot="dialog-content"]')).toBeNull()

    wrapper.unmount()
  })

  it('keeps the create submit control out of the scrolling region', async () => {
    const wrapper = await mountPanel()

    await wrapper.get('[data-testid="llm-credentials-new"]').trigger('click')
    await waitFor(() => inDrawer('llm-credential-form'), 'the create form to mount in the drawer')

    const scrollRegion = document.body.querySelector('.overflow-y-auto')
    const submit = document.body.querySelector('[data-testid="form-drawer-save"]')

    expect(submit).not.toBeNull()
    expect(scrollRegion!.contains(submit)).toBe(false)

    wrapper.unmount()
  })

  it('closes the create drawer on a successful create', async () => {
    createCredentialMock.mockResolvedValue({ data: verifiedCredential })
    const wrapper = await mountPanel()

    await wrapper.get('[data-testid="llm-credentials-new"]').trigger('click')
    await waitFor(() => inDrawer('llm-credential-form'), 'the create form to mount in the drawer')

    setValue('llm-credential-form-name', 'New key')
    setValue('llm-credential-form-api-key', 'a-live-key')
    await flushPromises()
    submitFromFooter()
    await waitFor(
      () => inDrawer('llm-credential-form') === null,
      'the create drawer to close after a successful create'
    )

    expect(createCredentialMock).toHaveBeenCalled()

    wrapper.unmount()
  })

  it('leaves the create drawer OPEN with the field error visible when the create is rejected', async () => {
    createCredentialMock.mockRejectedValue(
      Object.assign(new Error('422'), {
        status: 422,
        data: { errors: { api_key: ['invalid_key'] } },
      })
    )
    const wrapper = await mountPanel()

    await wrapper.get('[data-testid="llm-credentials-new"]').trigger('click')
    await waitFor(() => inDrawer('llm-credential-form'), 'the create form to mount in the drawer')

    setValue('llm-credential-form-name', 'New key')
    setValue('llm-credential-form-api-key', 'a-dead-key')
    await flushPromises()
    submitFromFooter()
    const error = await waitForTestId('llm-credential-form-api-key-error')

    expect(inDrawer('llm-credential-form')).not.toBeNull()
    expect(error.textContent).toContain('settings.llmCredentials.error.invalidKey')

    wrapper.unmount()
  })

  it('closes the create drawer on cancel without creating anything', async () => {
    const wrapper = await mountPanel()

    await wrapper.get('[data-testid="llm-credentials-new"]').trigger('click')
    await waitFor(() => inDrawer('llm-credential-form'), 'the create form to mount in the drawer')

    const cancel = document.body.querySelector<HTMLButtonElement>(
      '[data-testid="form-drawer-cancel"]'
    )
    cancel!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    cancel!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await waitFor(() => inDrawer('llm-credential-form') === null, 'the create drawer to close')

    expect(createCredentialMock).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('renders the rotate form inside the drawer and closes it on success', async () => {
    rotateCredentialMock.mockResolvedValue({ data: verifiedCredential })
    const wrapper = await mountPanel()

    await wrapper.get('[data-testid="llm-credential-rotate-1"]').trigger('click')
    await waitFor(
      () => inDrawer('llm-credential-rotate-form'),
      'the rotate form to mount in the drawer'
    )

    setValue('llm-credential-rotate-api-key', 'a-fresh-key')
    await flushPromises()
    submitFromFooter()
    await waitFor(
      () => inDrawer('llm-credential-rotate-form') === null,
      'the rotate drawer to close after a successful rotation'
    )

    expect(rotateCredentialMock).toHaveBeenCalledWith(1, { api_key: 'a-fresh-key' })

    wrapper.unmount()
  })

  it('leaves the rotate drawer OPEN with the error visible when the rotation is rejected', async () => {
    rotateCredentialMock.mockRejectedValue(
      Object.assign(new Error('422'), {
        status: 422,
        data: { errors: { api_key: ['invalid_key'] } },
      })
    )
    const wrapper = await mountPanel()

    await wrapper.get('[data-testid="llm-credential-rotate-1"]').trigger('click')
    await waitFor(
      () => inDrawer('llm-credential-rotate-form'),
      'the rotate form to mount in the drawer'
    )

    setValue('llm-credential-rotate-api-key', 'a-dead-key')
    await flushPromises()
    submitFromFooter()
    const error = await waitForTestId('llm-credential-rotate-error')

    expect(inDrawer('llm-credential-rotate-form')).not.toBeNull()
    expect(error.textContent).toContain('settings.llmCredentials.error.invalidKey')

    wrapper.unmount()
  })
})

describe('LlmCredentialsPanel — failure modes and edge states', () => {
  const unprocessable = (errors: Record<string, string[]>) =>
    Object.assign(new Error('422'), { status: 422, data: { errors } })

  function setValue(testId: string, value: string): void {
    const input = document.body.querySelector<HTMLInputElement>(`[data-testid="${testId}"]`)
    input!.value = value
    input!.dispatchEvent(new Event('input'))
  }

  async function mountPanel(errorHandler?: (error: unknown) => void) {
    const wrapper = mount(LlmCredentialsPanel, {
      global: { mocks: { $t: tMock }, config: errorHandler ? { errorHandler } : {} },
      attachTo: document.body,
    })
    await flushPromises()
    return wrapper
  }

  async function submitCreate(name: string, apiKey: string): Promise<void> {
    setValue('llm-credential-form-name', name)
    setValue('llm-credential-form-api-key', apiKey)
    await flushPromises()
    document.body
      .querySelector<HTMLFormElement>('[data-testid="llm-credential-form"]')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
  }

  async function confirmRemove(wrapper: Awaited<ReturnType<typeof mountPanel>>): Promise<void> {
    await wrapper.get('[data-testid="llm-credential-remove-1"]').trigger('click')
    const button = await waitForTestId('confirm-dialog-confirm')
    button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
  }

  it('never reads a credential with neither validated_at nor a known error as verified', async () => {
    listCredentialsMock.mockResolvedValue({
      data: [{ ...rateLimitedCredential, id: 5, validation_error: null }],
    })
    const wrapper = await mountPanel()

    const status = wrapper.get('[data-testid="llm-credential-status-5"]').text()
    expect(status).toContain('settings.llmCredentials.status.unknown')
    expect(status).not.toContain('settings.llmCredentials.status.verified')

    wrapper.unmount()
  })

  it('refuses an empty create form without calling the API and flags both fields', async () => {
    const wrapper = await mountPanel()
    await openCreateDialog(wrapper)
    await submitCreate('   ', '')

    expect(createCredentialMock).not.toHaveBeenCalled()
    expect(
      document.body.querySelector('[data-testid="llm-credential-form-name-error"]')?.textContent
    ).toContain('settings.llmCredentials.nameRequired')
    expect(
      document.body.querySelector('[data-testid="llm-credential-form-api-key-error"]')?.textContent
    ).toContain('settings.llmCredentials.apiKeyRequired')

    wrapper.unmount()
  })

  it('shows an unrecognised api_key code verbatim rather than inventing copy', async () => {
    createCredentialMock.mockRejectedValueOnce(unprocessable({ api_key: ['brand_new_code'] }))
    const wrapper = await mountPanel()
    await openCreateDialog(wrapper)
    await submitCreate('New key', 'some-key')

    expect(
      document.body.querySelector('[data-testid="llm-credential-form-api-key-error"]')?.textContent
    ).toContain('brand_new_code')

    wrapper.unmount()
  })

  it('maps a server name error to the name field and keeps the form open', async () => {
    createCredentialMock.mockRejectedValueOnce(unprocessable({ name: ['Name already taken.'] }))
    const wrapper = await mountPanel()
    await openCreateDialog(wrapper)
    await submitCreate('Dup', 'some-key')

    expect(
      document.body.querySelector('[data-testid="llm-credential-form-name-error"]')?.textContent
    ).toContain('Name already taken.')
    expect(document.body.querySelector('[data-testid="llm-credential-form"]')).not.toBeNull()

    wrapper.unmount()
  })

  it('routes a field with no control into the banner, and a bodyless failure to the generic error', async () => {
    createCredentialMock
      .mockRejectedValueOnce(unprocessable({ vendor: ['Vendor not supported.'] }))
      .mockRejectedValueOnce(Object.assign(new Error('500'), { status: 500 }))
    const wrapper = await mountPanel()
    await openCreateDialog(wrapper)

    await submitCreate('New key', 'some-key')
    const banner = () =>
      document.body.querySelector('[data-testid="llm-credential-form-banner"]')?.textContent
    expect(banner()).toContain('Vendor not supported.')

    await submitCreate('New key', 'some-key')
    expect(banner()).toContain('settings.llmCredentials.createError')
    expect(banner()).not.toContain('Vendor not supported.')

    wrapper.unmount()
  })

  it('shows the generic rotate error when the failure carries no api_key code', async () => {
    rotateCredentialMock.mockRejectedValueOnce(Object.assign(new Error('500'), { status: 500 }))
    const wrapper = await mountPanel()

    await wrapper.get('[data-testid="llm-credential-rotate-1"]').trigger('click')
    await waitForTestId('llm-credential-rotate-form')
    setValue('llm-credential-rotate-api-key', 'a-fresh-key')
    await flushPromises()
    document.body
      .querySelector<HTMLFormElement>('[data-testid="llm-credential-rotate-form"]')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    const error = await waitForTestId('llm-credential-rotate-error')

    expect(error.textContent).toContain('settings.llmCredentials.rotateError')

    wrapper.unmount()
  })

  it('does not call the API when a rotation is submitted with no key typed', async () => {
    const wrapper = await mountPanel()

    await wrapper.get('[data-testid="llm-credential-rotate-1"]').trigger('click')
    await waitForTestId('llm-credential-rotate-form')
    document.body
      .querySelector<HTMLFormElement>('[data-testid="llm-credential-rotate-form"]')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()

    expect(rotateCredentialMock).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('lists the bound templates for a credential_in_use refusal even without a server message', async () => {
    deleteCredentialMock.mockRejectedValueOnce(
      Object.assign(new Error('Conflict'), {
        status: 409,
        data: { error: 'credential_in_use', templates: ['Sales bot'] },
      })
    )
    const wrapper = await mountPanel()
    await confirmRemove(wrapper)

    expect(
      document.body.querySelector('[data-testid="llm-credential-remove-conflict-templates"]')
        ?.textContent
    ).toBe('Sales bot')

    wrapper.unmount()
  })

  it('does not swallow an unrecognised delete failure as a conflict', async () => {
    const boom = Object.assign(new Error('boom'), { status: 500 })
    deleteCredentialMock.mockRejectedValueOnce(boom)
    const errorHandler = vi.fn()
    const wrapper = await mountPanel(errorHandler)
    await confirmRemove(wrapper)

    expect(errorHandler).toHaveBeenCalledOnce()
    expect(errorHandler.mock.calls[0]?.[0]).toBe(boom)
    expect(document.body.querySelector('[data-testid="llm-credential-remove-conflict"]')).toBeNull()

    wrapper.unmount()
  })
})
