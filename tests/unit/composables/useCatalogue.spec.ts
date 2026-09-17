/**
 * useCatalogue — the wire between the catalogue authoring screens and the
 * API (framework-catalogue-authoring PR10/PR10b).
 *
 * Same doctrine as `useAvatarTemplates.spec.ts`: this composable is thin by
 * design, so what is worth asserting is the SHAPE of each call — the exact
 * path, verb and body — because a wrong one fails only at runtime, with no
 * symptom beyond a screen that quietly does nothing.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()

vi.mock('../../../app/composables/useApi', () => ({
  useApi: () => ({ apiFetch }),
}))

const { useCatalogue } = await import('../../../app/composables/useCatalogue')

describe('useCatalogue', () => {
  beforeEach(() => {
    apiFetch.mockReset()
    apiFetch.mockResolvedValue({ data: [] })
  })

  it('reads the current revision from its own endpoint', async () => {
    await useCatalogue().fetchCurrentRevision()

    expect(apiFetch).toHaveBeenCalledWith('/catalogue/revisions/current')
  })

  it('opens a draft with POST and no body', async () => {
    await useCatalogue().openDraftRevision()

    expect(apiFetch).toHaveBeenCalledWith('/catalogue/revisions/draft', { method: 'POST' })
  })

  it('publishes with POST and no body', async () => {
    await useCatalogue().publishRevision()

    expect(apiFetch).toHaveBeenCalledWith('/catalogue/revisions/publish', { method: 'POST' })
  })

  it('discards the open draft with DELETE and no body', async () => {
    await useCatalogue().discardDraftRevision()

    expect(apiFetch).toHaveBeenCalledWith('/catalogue/revisions/draft', { method: 'DELETE' })
  })

  it('lists competencies from the collection endpoint', async () => {
    await useCatalogue().listCompetencies()

    expect(apiFetch).toHaveBeenCalledWith('/catalogue/competencies')
  })

  it('creates a competency with POST', async () => {
    const payload = {
      code: 'COL',
      type: 'standard' as const,
      name: { en: 'Collaboration' },
      definition: { en: 'X' },
    }
    await useCatalogue().createCompetency(payload)

    expect(apiFetch).toHaveBeenCalledWith('/catalogue/competencies', {
      method: 'POST',
      body: payload,
    })
  })

  it('updates a competency with PATCH against its own id', async () => {
    const payload = { name: { en: 'Renamed' } }
    await useCatalogue().updateCompetency(7, payload)

    expect(apiFetch).toHaveBeenCalledWith('/catalogue/competencies/7', {
      method: 'PATCH',
      body: payload,
    })
  })

  it('deletes a competency with DELETE and resolves to undefined', async () => {
    apiFetch.mockResolvedValue(undefined)

    await expect(useCatalogue().deleteCompetency(7)).resolves.toBeUndefined()
    expect(apiFetch).toHaveBeenCalledWith('/catalogue/competencies/7', { method: 'DELETE' })
  })

  it('lists roles from the collection endpoint', async () => {
    await useCatalogue().listRoles()

    expect(apiFetch).toHaveBeenCalledWith('/catalogue/roles')
  })

  it('creates a role with POST', async () => {
    const payload = { code: 'ICO', name: { en: 'Individual Contributor' } }
    await useCatalogue().createRole(payload)

    expect(apiFetch).toHaveBeenCalledWith('/catalogue/roles', { method: 'POST', body: payload })
  })

  it('updates a role with PATCH against its own id', async () => {
    const payload = { name: { en: 'Renamed role' } }
    await useCatalogue().updateRole(3, payload)

    expect(apiFetch).toHaveBeenCalledWith('/catalogue/roles/3', { method: 'PATCH', body: payload })
  })

  it('deletes a role with DELETE', async () => {
    await useCatalogue().deleteRole(3)

    expect(apiFetch).toHaveBeenCalledWith('/catalogue/roles/3', { method: 'DELETE' })
  })

  it("replaces a role's whole competency set with one PUT", async () => {
    const payload = { competency_ids: [5, 2, 9] }
    await useCatalogue().updateRoleCompetencies(3, payload)

    expect(apiFetch).toHaveBeenCalledWith('/catalogue/roles/3/competencies', {
      method: 'PUT',
      body: payload,
    })
  })

  it('lists BARS indicators from the collection endpoint', async () => {
    await useCatalogue().listBarsIndicators()

    expect(apiFetch).toHaveBeenCalledWith('/catalogue/bars-indicators')
  })

  it('creates a BARS indicator with POST', async () => {
    const payload = {
      text: { en: 'Text' },
      anchor_5: { en: 'A5' },
      anchor_3: { en: 'A3' },
      anchor_1: { en: 'A1' },
      competency_id: 11,
      position: 0,
      role_id: 2,
    }
    await useCatalogue().createBarsIndicator(payload)

    expect(apiFetch).toHaveBeenCalledWith('/catalogue/bars-indicators', {
      method: 'POST',
      body: payload,
    })
  })

  it('updates a BARS indicator with PATCH against its own id', async () => {
    const payload = { position: 1 }
    await useCatalogue().updateBarsIndicator(21, payload)

    expect(apiFetch).toHaveBeenCalledWith('/catalogue/bars-indicators/21', {
      method: 'PATCH',
      body: payload,
    })
  })

  it('deletes a BARS indicator with DELETE', async () => {
    await useCatalogue().deleteBarsIndicator(21)

    expect(apiFetch).toHaveBeenCalledWith('/catalogue/bars-indicators/21', { method: 'DELETE' })
  })

  it('lets an API failure propagate rather than swallowing it', async () => {
    apiFetch.mockRejectedValue(new Error('422'))

    await expect(useCatalogue().listCompetencies()).rejects.toThrow()
  })
})
