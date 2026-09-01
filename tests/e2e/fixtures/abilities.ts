/**
 * The ability map `/auth/me` returns, derived from a role list.
 *
 * The server resolves this from its POLICIES; a fixture cannot call those, so
 * it reproduces their outcome. Derived from the role rather than hardcoded per
 * spec for the same reason the production code does not hardcode it in Vue: a
 * second copy of an authorization rule drifts, and a fixture that drifts makes
 * every test using it quietly stop testing what it says it tests.
 *
 * Keep this in step with `api/app/Support/Authorization/UserAbilities.php`. The
 * API-side tests are what prove the real map is right
 * (`tests/Feature/Authorization/SettingsSurfaceTest.php`); this only has to
 * agree with them.
 */
export function abilitiesFor(roles: readonly string[]) {
  const admin = roles.includes('admin')
  const operator = admin || roles.includes('operator')

  return {
    organization: { view: true, update: admin },
    apiClients: { viewAny: admin, create: admin },
    users: { viewAny: admin, create: admin },
    llmCredentials: { viewAny: admin, create: admin },
    avatarTemplates: { viewAny: admin, create: admin },
    projects: { viewAny: true, create: operator },
  }
}
