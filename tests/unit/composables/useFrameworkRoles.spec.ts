/**
 * useFrameworkRoles (Unit 2b) — a minimal, additional composable ProjectForm
 * needs beyond D8's listed set: `CompetencyPicker`'s `standard` options come
 * from the existing C3 `GET /framework/roles/{roleCode}/competencies`
 * endpoint (D9), which this thinly wraps, mirroring `useParticipants.ts:16-30`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()

vi.mock('../../../app/composables/useApi', () => ({
  useApi: () => ({ apiFetch }),
}))

const { useFrameworkRoles } = await import('../../../app/composables/useFrameworkRoles')

describe('useFrameworkRoles', () => {
  beforeEach(() => {
    apiFetch.mockReset()
    apiFetch.mockResolvedValue({ data: [] })
  })

  it('fetches competencies for a role from its own endpoint', async () => {
    await useFrameworkRoles().fetchRoleCompetencies('FLL')

    expect(apiFetch).toHaveBeenCalledWith('/framework/roles/FLL/competencies')
  })

  /**
   * project-competency-revision-scope fix: the ids this endpoint returns are
   * validated by StoreProjectRequest/UpdateProjectRequest against the
   * SUBMITTED framework_version_id's own pinned catalogue revision, which
   * can differ from "latest published" — omitting this once let the picker
   * offer ids the server would refuse as competency_unknown.
   */
  it('appends framework_version_id when provided', async () => {
    await useFrameworkRoles().fetchRoleCompetencies('FLL', 42)

    expect(apiFetch).toHaveBeenCalledWith(
      '/framework/roles/FLL/competencies?framework_version_id=42'
    )
  })

  it('omits framework_version_id when null or undefined', async () => {
    await useFrameworkRoles().fetchRoleCompetencies('FLL', null)
    await useFrameworkRoles().fetchRoleCompetencies('FLL', undefined)

    expect(apiFetch).toHaveBeenNthCalledWith(1, '/framework/roles/FLL/competencies')
    expect(apiFetch).toHaveBeenNthCalledWith(2, '/framework/roles/FLL/competencies')
  })

  it('fetches potential competencies, scoped by framework_version_id when provided', async () => {
    await useFrameworkRoles().fetchPotentialCompetencies()
    await useFrameworkRoles().fetchPotentialCompetencies(7)

    expect(apiFetch).toHaveBeenNthCalledWith(1, '/framework/potential-competencies')
    expect(apiFetch).toHaveBeenNthCalledWith(
      2,
      '/framework/potential-competencies?framework_version_id=7'
    )
  })
})
