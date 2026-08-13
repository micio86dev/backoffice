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
})
