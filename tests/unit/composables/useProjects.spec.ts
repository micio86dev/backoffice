/**
 * useProjects — typed reads/writes over the C4 project-configuration
 * endpoints (D8). Thin wiring over `useApi().apiFetch`, mirroring
 * `useParticipants.ts:16-30`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()

vi.mock('../../../app/composables/useApi', () => ({
  useApi: () => ({ apiFetch }),
}))

const { useProjects } = await import('../../../app/composables/useProjects')

describe('useProjects', () => {
  beforeEach(() => {
    apiFetch.mockReset()
    apiFetch.mockResolvedValue({ data: [] })
  })

  it('lists from the collection endpoint', async () => {
    await useProjects().listProjects()

    expect(apiFetch).toHaveBeenCalledWith('/projects')
  })

  it('creates with POST', async () => {
    await useProjects().createProject({
      framework_version_id: 1,
      slug: 'demo',
      name: 'Demo',
      assessment_type: 'standard',
      language: 'en',
    })

    expect(apiFetch).toHaveBeenCalledWith('/projects', {
      method: 'POST',
      body: {
        framework_version_id: 1,
        slug: 'demo',
        name: 'Demo',
        assessment_type: 'standard',
        language: 'en',
      },
    })
  })

  it('updates with PATCH and never sends framework_version_id', async () => {
    await useProjects().updateProject(7, { name: 'Renamed' })

    const [path, options] = apiFetch.mock.calls[0] as [string, { method: string; body: object }]

    expect(path).toBe('/projects/7')
    expect(options.method).toBe('PATCH')
    expect(options.body).not.toHaveProperty('framework_version_id')
  })

  it('lets an API failure propagate', async () => {
    apiFetch.mockRejectedValue(new Error('422'))

    await expect(useProjects().listProjects()).rejects.toThrow()
  })
})
