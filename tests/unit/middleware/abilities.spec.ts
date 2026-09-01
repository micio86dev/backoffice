/**
 * 03.abilities.global.ts — pages a user may not use are not reachable by URL.
 *
 * The sidebar already stops offering /settings to an operator, but hiding a
 * link is not a guard: the page is one typed URL away. This middleware closes
 * that, and these tests assert BOTH halves of why it is safe — it consults the
 * server-resolved ability map rather than a role name, and it fails closed.
 *
 * It is still not the access control. Every endpoint behind these pages
 * authorizes independently, and that is asserted on the API side
 * (`tests/Feature/Authorization/SettingsSurfaceTest.php`). This is the product
 * decision: do not show someone a door that is locked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const ensureLoadedMock = vi.fn()
const canMock = vi.fn<(ability: string) => boolean>()

vi.mock('../../../app/composables/useCurrentUser', () => ({
  useCurrentUser: () => ({ ensureLoaded: ensureLoadedMock, can: canMock }),
}))

async function run(path: string) {
  const middleware = (await import('../../../app/middleware/03.abilities.global')).default

  return middleware({ path } as never, {} as never)
}

describe('03.abilities.global.ts', () => {
  beforeEach(() => {
    vi.stubGlobal('defineNuxtRouteMiddleware', (handler: unknown) => handler)
    ensureLoadedMock.mockReset().mockResolvedValue({})
    canMock.mockReset().mockReturnValue(true)
  })

  it('sends someone without the ability back to the dashboard', async () => {
    canMock.mockReturnValue(false)
    const navigateToMock = vi.fn(() => 'navigated')
    vi.stubGlobal('navigateTo', navigateToMock)

    expect(await run('/settings')).toBe('navigated')
    expect(navigateToMock).toHaveBeenCalledWith('/')
  })

  it('lets someone with the ability through', async () => {
    const navigateToMock = vi.fn()
    vi.stubGlobal('navigateTo', navigateToMock)

    await run('/settings')

    expect(navigateToMock).not.toHaveBeenCalled()
    expect(canMock).toHaveBeenCalledWith('users.viewAny')
  })

  it('guards child routes, not just the exact path', async () => {
    // Keyed by first path segment on purpose. A guard that has to be
    // remembered for each new child page is a guard that will be forgotten
    // for one.
    canMock.mockReturnValue(false)
    const navigateToMock = vi.fn()
    vi.stubGlobal('navigateTo', navigateToMock)

    await run('/settings/users')

    expect(navigateToMock).toHaveBeenCalledWith('/')
  })

  it('sees through the i18n locale prefix', async () => {
    canMock.mockReturnValue(false)
    const navigateToMock = vi.fn()
    vi.stubGlobal('navigateTo', navigateToMock)

    await run('/en/settings')

    expect(navigateToMock).toHaveBeenCalledWith('/')
  })

  it('FAILS CLOSED when the identity cannot be loaded', async () => {
    // The one case where a permissive default would be silently wrong: a
    // transient /auth/me failure must not open a page whose every request is
    // about to be refused.
    ensureLoadedMock.mockRejectedValue(new Error('offline'))
    const navigateToMock = vi.fn()
    vi.stubGlobal('navigateTo', navigateToMock)

    await run('/settings')

    expect(navigateToMock).toHaveBeenCalledWith('/')
  })

  it('leaves ungated routes alone without even loading the identity', async () => {
    // /projects is reachable by every role, so this must not add a request —
    // nor a redirect if the identity happens to be unavailable.
    ensureLoadedMock.mockRejectedValue(new Error('offline'))
    const navigateToMock = vi.fn()
    vi.stubGlobal('navigateTo', navigateToMock)

    await run('/projects')

    expect(navigateToMock).not.toHaveBeenCalled()
    expect(ensureLoadedMock).not.toHaveBeenCalled()
  })

  it('guards the avatar templates page by its own ability, not by the settings one', async () => {
    canMock.mockReturnValue(true)
    const navigateToMock = vi.fn()
    vi.stubGlobal('navigateTo', navigateToMock)

    await run('/avatar-templates')

    expect(canMock).toHaveBeenCalledWith('avatarTemplates.viewAny')
    expect(canMock).not.toHaveBeenCalledWith('users.viewAny')
  })
})
