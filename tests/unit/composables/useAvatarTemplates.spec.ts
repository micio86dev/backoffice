/**
 * useAvatarTemplates — the wire between the operator screen and the API
 * (C14 PR6).
 *
 * Thin by design, so what is worth asserting is the SHAPE of each call: a wrong
 * verb or a wrong path fails at runtime in a way no type checks, and the only
 * symptom is a screen that quietly does nothing.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()

vi.mock('../../../app/composables/useApi', () => ({
  useApi: () => ({ apiFetch }),
}))

const { useAvatarTemplates } = await import('../../../app/composables/useAvatarTemplates')

describe('useAvatarTemplates', () => {
  beforeEach(() => {
    apiFetch.mockReset()
    apiFetch.mockResolvedValue({ data: [] })
  })

  it('lists from the collection endpoint', async () => {
    await useAvatarTemplates().listTemplates()

    expect(apiFetch).toHaveBeenCalledWith('/avatar-templates')
  })

  it('reads the field specs from the server, never a local copy', async () => {
    await useAvatarTemplates().fetchFieldSpecs()

    // The form, the API's validation and the provider payload all come from one
    // server-side definition. A second copy in this app would drift, and the
    // drift is invisible: a form offering a knob the payload never sends looks
    // exactly like a knob that does not work.
    expect(apiFetch).toHaveBeenCalledWith('/avatar-templates/field-specs')
  })

  it('creates with POST', async () => {
    await useAvatarTemplates().createTemplate({
      name: 'X',
      provider: 'heygen',
      config: { avatarId: 'a' },
    })

    expect(apiFetch).toHaveBeenCalledWith('/avatar-templates', {
      method: 'POST',
      body: { name: 'X', provider: 'heygen', config: { avatarId: 'a' } },
    })
  })

  it('updates with PATCH and never sends the provider', async () => {
    await useAvatarTemplates().updateTemplate(7, { name: 'Y' })

    // The API refuses a provider change outright — every knob belongs to one
    // provider and none overlap. Sending it would be an edit that always fails.
    const [path, options] = apiFetch.mock.calls[0] as [string, { method: string; body: object }]

    expect(path).toBe('/avatar-templates/7')
    expect(options.method).toBe('PATCH')
    expect(options.body).not.toHaveProperty('provider')
  })

  it('activates through its own endpoint, not a PATCH of is_active', async () => {
    await useAvatarTemplates().activateTemplate(3)

    // Activation is a SWAP the server performs in one transaction. Patching a
    // boolean would hit the partial unique index and fail, because the previous
    // template is still active.
    expect(apiFetch).toHaveBeenCalledWith('/avatar-templates/3/activate', { method: 'POST' })
  })

  it('deletes with DELETE', async () => {
    await useAvatarTemplates().deleteTemplate(4)

    expect(apiFetch).toHaveBeenCalledWith('/avatar-templates/4', { method: 'DELETE' })
  })

  it('lets an API failure propagate', async () => {
    apiFetch.mockRejectedValue(new Error('422'))

    // Swallowed here, the page could not tell a validation failure from an
    // empty result — and an operator would watch Save do nothing.
    await expect(useAvatarTemplates().listTemplates()).rejects.toThrow()
  })
})
