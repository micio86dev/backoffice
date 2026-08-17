/**
 * useBarsCoverage — per-role-code BARS coverage cache for the projects list
 * (bars-coverage-visibility D1).
 *
 * Consumes the SAME `bars_available` flag the picker uses
 * (`/framework/roles/{roleCode}/competencies`, via `useFrameworkRoles`), so
 * the list surface and the picker can never disagree about what "covered"
 * means — no second, client-side redefinition of the fact.
 *
 * `pages/projects/index.vue` calls `loadRoles()` with the distinct
 * non-null `role_code`s among the loaded projects; at most 5 role codes
 * exist today (ICO/FLL/MLL/BUL/SRX), so this is at most 5 requests per page
 * load, deduplicated per composable instance.
 *
 * IMPORTANT — this composable answers a ROLE question, not a PROJECT one.
 * It caches "which competency ids has this ROLE got no anchors for", never
 * "how many does THIS project hold". Verified fix for a real bug: the first
 * version of this composable computed a per-role COUNT directly and
 * `ProjectTable` rendered it unmodified, so every project sharing a role
 * showed the identical number regardless of which competencies it actually
 * selected — a project holding only fully-covered competencies still
 * rendered a debt notice because ITS ROLE had uncovered ones elsewhere. The
 * caller (`ProjectTable.uncoveredCount`) MUST intersect a project's own
 * `competencies` against the set this composable exposes; this composable
 * only ever answers "for this role, which ids are uncovered".
 *
 * A fetch failure records NOTHING for that role code — `uncoveredIdsByRole`
 * simply stays without a key for it, which the caller renders identically
 * to "not yet loaded". An advisory count that is silently WRONG (e.g. a
 * failure read as zero) is worse than one that is absent.
 */
import { ref } from 'vue'
import { useFrameworkRoles } from './useFrameworkRoles'

export function useBarsCoverage() {
  const { fetchRoleCompetencies } = useFrameworkRoles()

  // roleCode -> ids of that role's assigned competencies with
  // bars_available === false. A role code present here with an EMPTY array
  // means "fetched, fully covered" — rendering that as "nothing" is the
  // caller's job (ProjectTable), not this composable's.
  const uncoveredIdsByRole = ref<Record<string, number[]>>({})

  // Tracks in-flight/completed requests so a second call with overlapping
  // role codes (e.g. the list refetching after a save) does not re-request
  // a role code already resolved, successfully or not.
  const requested = new Set<string>()

  async function loadRoles(roleCodes: Array<string | null | undefined>): Promise<void> {
    const distinct = Array.from(
      new Set(roleCodes.filter((code): code is string => Boolean(code)))
    ).filter((code) => !requested.has(code))

    await Promise.all(
      distinct.map(async (code) => {
        requested.add(code)
        try {
          const response = await fetchRoleCompetencies(code)
          const missingIds = response.data
            .filter((c) => c.bars_available === false)
            .map((c) => c.id)
          uncoveredIdsByRole.value = { ...uncoveredIdsByRole.value, [code]: missingIds }
        } catch {
          // Deliberately swallowed — see the module docblock. Nothing is
          // written to uncoveredIdsByRole, so the caller renders nothing.
        }
      })
    )
  }

  return { uncoveredIdsByRole, loadRoles }
}
