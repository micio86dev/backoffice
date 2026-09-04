/**
 * cta-authorization.spec.ts — the client never decides who may do what.
 *
 * `UserAbilities` on the API resolves every ability through the SAME policies
 * that guard the endpoints, and `/auth/me` publishes the answer. The whole
 * point is that the backoffice asks rather than re-derives: a
 * `roles.includes('admin')` in a component is a second copy of an
 * authorization rule, written in a second language, in a second repository —
 * and the copy drifts silently, always in the permissive direction, because a
 * UI that shows too much looks fine until someone clicks.
 *
 * That is not hypothetical here. Three surfaces had drifted before this guard
 * existed:
 *
 *   - `pages/projects/index.vue` fetched `/api/profile` and compared
 *     `data.role` to `'viewer'` to decide whether to offer "Invite candidate"
 *     — a `ParticipantPolicy` question answered with a project role.
 *   - `pages/participants/[id].vue` did the same for two cards governed by two
 *     different policies.
 *   - `pages/avatar-templates/index.vue` gated nothing at all, so an admin was
 *     offered Edit and Activate on templates that became platform-only on
 *     2026-09-02, and found out by reading a 403.
 *
 * Mechanical and repo-wide, in the shape `form-contract.spec.ts` and
 * `destructive-action.spec.ts` established: a scan is what catches the NEXT
 * component, and remembering is not a mechanism.
 *
 * WHAT THIS DOES NOT PROVE, stated plainly: that a control which IS gated is
 * gated on the RIGHT ability. Only a behavioural test can say that, and each
 * gated surface has one. This makes the wrong SHAPE impossible to add
 * quietly — nothing more, and nothing less.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const APP_ROOT = join(__dirname, '../../../app')

interface AllowlistEntry {
  path: string
  reason: string
}

// Empty by design, same as the sibling guards: a new violation is fixed, not
// allowlisted. An entry needs a written reason.
const ALLOWLIST: AllowlistEntry[] = []

/**
 * A value being compared against a role NAME, or a role list being searched.
 *
 * Deliberately narrow. It does not ban the STRINGS — `AccessLevelBadge` maps
 * them to labels and must keep doing so, and locale files are full of them.
 * It bans deciding something from one.
 */
const RULES = [
  {
    id: 'role-equality',
    pattern: /(===|!==)\s*['"](admin|operator|viewer|superadmin)['"]/,
    message: 'compares a value to a role name',
  },
  {
    id: 'role-membership',
    pattern: /\broles\s*\.\s*includes\s*\(/,
    message: 'searches the role list',
  },
] as const

/**
 * DELIBERATELY NOT A RULE: reading `profile.role`.
 *
 * `pages/profile.vue` renders the signed-in operator's access level as a
 * badge, which is a fact about them and not a decision about what they may do.
 * Banning the read would ban showing people their own role, and every real
 * violation turns that read into a BOOLEAN — which `role-equality` above
 * already catches, at the point where the decision is actually made.
 */

/**
 * Source with comments removed.
 *
 * Every rule above is DESCRIBED in prose somewhere in this codebase — the
 * composables and middleware that implement the correct pattern all explain
 * what they refuse to do, quoting the very expressions this guard forbids. A
 * scan over raw text would fail on its own documentation, and the fix for that
 * would be to stop writing the explanation down.
 */
function stripComments(source: string): string {
  return (
    source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      // `[^:]` keeps `https://` from being eaten as a line comment; the group is
      // non-capturing because nothing reads it back — the replacement rebuilds
      // the prefix from a lookbehind-free match on purpose, since Safari's
      // regex engine is one of the targets this repo supports.
      .replace(/(?:^|[^:])\/\/.*$/gm, (match) => (match.startsWith('/') ? '' : (match[0] ?? '')))
  )
}

function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)

    if (statSync(full).isDirectory()) return collectSourceFiles(full)

    return /\.(?:vue|ts)$/.test(entry) ? [full] : []
  })
}

describe('no client-side authorization', () => {
  const files = collectSourceFiles(APP_ROOT)

  it('scans a non-trivial number of files', () => {
    // A collector that silently returns nothing turns every assertion below
    // into a vacuous pass — the one failure mode a repo-wide scan cannot
    // detect on its own.
    expect(files.length).toBeGreaterThan(50)
  })

  it.each(RULES)('no file $id — $message', ({ pattern, message }) => {
    const offenders = files
      .filter((file) => !ALLOWLIST.some((entry) => entry.path === relative(APP_ROOT, file)))
      .filter((file) => pattern.test(stripComments(readFileSync(file, 'utf8'))))
      .map((file) => relative(APP_ROOT, file))

    expect(
      offenders,
      `These files decide authorization themselves (${message}). Ask the server instead: ` +
        "`useCurrentUser().can('group.action')`, resolved from the same policies that guard the endpoint."
    ).toEqual([])
  })
})
