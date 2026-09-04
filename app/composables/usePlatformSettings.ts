/**
 * usePlatformSettings — typed reads/writes over `/api/admin/settings`.
 *
 * Platform-wide, NOT tenant-scoped: these rows belong to BEAI itself and only
 * the superadmin may change them. Every endpoint behind this answers 403 to
 * every tenant role, so hiding the section is a courtesy and the lock is on
 * the server — the same relationship every other panel here has with its API.
 *
 * Types derive from the generated client, never hand-written: `/admin/settings`
 * is a contract owned by the api repository, and a second copy of its shape in
 * a second repository is exactly the drift `bun run codegen` exists to remove.
 */
import type { paths } from '../../types/api'
import { useApi } from './useApi'

export type PlatformSettingsResponse =
  paths['/admin/settings']['get']['responses']['200']['content']['application/json']

export type UpdatePlatformSettingsPayload = NonNullable<
  paths['/admin/settings']['patch']['requestBody']
>['content']['application/json']

/** The caps map itself, as the generated payload declares it. */
export type PlatformSettingsCaps = UpdatePlatformSettingsPayload['max_questions_per_competency']

export function usePlatformSettings() {
  const { apiFetch } = useApi()

  async function fetchPlatformSettings(): Promise<PlatformSettingsResponse> {
    return apiFetch<PlatformSettingsResponse>('/admin/settings')
  }

  /**
   * PARTIAL by design, matching the server: naming only `standard` leaves
   * `potential` where it was. The response carries the FULL map after the
   * merge, which is why callers re-seed from it rather than from what they
   * sent.
   */
  async function updatePlatformSettings(
    maxQuestionsPerCompetency: PlatformSettingsCaps
  ): Promise<PlatformSettingsResponse> {
    // No `as` cast. The parameter was `Record<string, number>` widened back to
    // the payload type by an assertion, which switches off the only check the
    // generated client exists to give: `updatePlatformSettings({ standrd: 3 })`
    // compiled clean, shipped, and came back 422 at runtime. Typed from the
    // generated payload instead, a typo is a build error.
    return apiFetch<PlatformSettingsResponse>('/admin/settings', {
      method: 'PATCH',
      body: { max_questions_per_competency: maxQuestionsPerCompetency },
    })
  }

  return { fetchPlatformSettings, updatePlatformSettings }
}
