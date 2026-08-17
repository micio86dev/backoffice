/**
 * project-accessibility.ts (operator-interview-link, design D5)
 *
 * Pure client-side mirror of the API's `projectIsAccessible()` gate
 * (api/app/Support/Sso/EntryLinkMinter.php — the same predicate the mint
 * endpoint enforces): `status === 'active'` AND (`goes_live_at` is null or
 * `<= now`) AND (`deadline_at` is null or `> now`).
 *
 * Used ONLY to disable the mint action with a STATED reason instead of
 * offering an action guaranteed to fail server-side — never as authorization
 * of its own. `POST /api/entry-links` still enforces every gate
 * independently and returns 403 regardless of what this predicate says; a
 * disabled button is not authorization.
 *
 * `status` gate is checked FIRST — mirrors the server's own check order in
 * `EntryLinkMinter::projectIsAccessible()`, so a project failing multiple
 * gates always reports the SAME reason as the server would encounter first.
 */

export type ProjectAccessibilityReason = 'notActive' | 'notYetLive' | 'expired'

export interface ProjectAccessibility {
  eligible: boolean
  reason: ProjectAccessibilityReason | null
}

export interface ProjectAccessibilityInput {
  status: string
  goes_live_at: string | null
  deadline_at: string | null
}

export function projectAccessibility(project: ProjectAccessibilityInput): ProjectAccessibility {
  if (project.status !== 'active') {
    return { eligible: false, reason: 'notActive' }
  }

  if (project.goes_live_at !== null && new Date(project.goes_live_at).getTime() > Date.now()) {
    return { eligible: false, reason: 'notYetLive' }
  }

  if (project.deadline_at !== null && new Date(project.deadline_at).getTime() <= Date.now()) {
    return { eligible: false, reason: 'expired' }
  }

  return { eligible: true, reason: null }
}
