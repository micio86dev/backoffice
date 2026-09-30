/**
 * usePlatformAvatarTemplates — the wire to `/admin/avatar-templates*`
 * (global-avatar-templates, slice B2).
 *
 * The shape of each call is what is worth asserting: a wrong verb or path fails
 * at runtime in a way no type checks. The two delete refusals are the other
 * half — the API answers the SAME status (409) for two different situations
 * with different remedies, so each must reach the page as its own typed error.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()

vi.mock('../../../app/composables/useApi', () => ({ useApi: () => ({ apiFetch }) }))

const { usePlatformAvatarTemplates, PlatformTemplateActiveError, PlatformTemplateInUseError } =
  await import('../../../app/composables/usePlatformAvatarTemplates')

function conflict(data: Record<string, unknown>) {
  return Object.assign(new Error('conflict'), { status: 409, data })
}

describe('usePlatformAvatarTemplates', () => {
  beforeEach(() => {
    apiFetch.mockReset()
    apiFetch.mockResolvedValue({ data: [] })
  })

  it('lists and reads from the platform collection, never the organization one', async () => {
    await usePlatformAvatarTemplates().list()
    await usePlatformAvatarTemplates().get(4)

    expect(apiFetch.mock.calls.map((call) => call[0])).toEqual([
      '/admin/avatar-templates',
      '/admin/avatar-templates/4',
    ])
  })

  it('creates with POST and updates with PATCH, forwarding the body as given', async () => {
    await usePlatformAvatarTemplates().create({
      name: 'Global A',
      provider: 'heygen',
      config: { avatarId: 'a' },
    })
    await usePlatformAvatarTemplates().update(4, { name: 'Global B' })

    expect(apiFetch).toHaveBeenNthCalledWith(1, '/admin/avatar-templates', {
      method: 'POST',
      body: { name: 'Global A', provider: 'heygen', config: { avatarId: 'a' } },
    })
    expect(apiFetch).toHaveBeenNthCalledWith(2, '/admin/avatar-templates/4', {
      method: 'PATCH',
      body: { name: 'Global B' },
    })
  })

  it('offers with activate and retires with deactivate', async () => {
    await usePlatformAvatarTemplates().activate(4)
    await usePlatformAvatarTemplates().deactivate(4)

    expect(apiFetch).toHaveBeenNthCalledWith(1, '/admin/avatar-templates/4/activate', {
      method: 'POST',
    })
    expect(apiFetch).toHaveBeenNthCalledWith(2, '/admin/avatar-templates/4/deactivate', {
      method: 'POST',
    })
  })

  it('deletes with DELETE on the platform route', async () => {
    await usePlatformAvatarTemplates().remove(4)

    expect(apiFetch).toHaveBeenCalledWith('/admin/avatar-templates/4', { method: 'DELETE' })
  })

  it('maps 409 template_in_use to a typed error carrying both counts', async () => {
    apiFetch.mockRejectedValue(
      conflict({
        error: 'template_in_use',
        message: 'template_in_use',
        organization_count: 2,
        project_count: 3,
      })
    )

    const error = await usePlatformAvatarTemplates()
      .remove(4)
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(PlatformTemplateInUseError)
    expect(error).toMatchObject({ organizationCount: 2, projectCount: 3 })
  })

  it('maps 409 template_active to a DISTINCT typed error (retire first)', async () => {
    apiFetch.mockRejectedValue(conflict({ error: 'template_active', message: 'template_active' }))

    const error = await usePlatformAvatarTemplates()
      .remove(4)
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(PlatformTemplateActiveError)
    expect(error).not.toBeInstanceOf(PlatformTemplateInUseError)
  })

  it('lets every other rejection through untouched', async () => {
    const forbidden = Object.assign(new Error('forbidden'), { status: 403 })
    apiFetch.mockRejectedValue(forbidden)

    await expect(usePlatformAvatarTemplates().remove(4)).rejects.toBe(forbidden)
  })
})
