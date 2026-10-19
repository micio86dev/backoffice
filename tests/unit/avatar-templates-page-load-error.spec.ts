/**
 * The page's load-error copy follows the failure class (resourceErrorKey), not
 * one sentence for everything: "check that you hold the administrator role" is
 * right for a 403 and wrong for a 404 or a network fault.
 */
import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { withTooltipProvider } from './support/tooltip-host'
import { currenciesDouble, organizationDouble, resetMoney } from './support/money'

beforeEach(() => {
  resetMoney()
  vi.resetModules()
  vi.stubGlobal('definePageMeta', vi.fn())
  vi.stubGlobal('useHead', vi.fn())
  vi.stubGlobal('useI18n', () => ({ t: (key: string) => key, te: () => true, locale: ref('it') }))
})
afterEach(() => {
  document.body.innerHTML = ''
})

async function failWith(error: unknown) {
  vi.doMock('../../app/composables/useOrganization', organizationDouble)
  vi.doMock('../../app/composables/useCurrencies', currenciesDouble)
  vi.doMock('../../app/composables/useCurrentUser', () => ({
    useCurrentUser: () => ({
      can: () => true,
      ensureLoaded: vi.fn().mockResolvedValue(undefined),
    }),
  }))
  vi.doMock('../../app/composables/useAvatarTemplates', () => ({
    useAvatarTemplates: () => ({
      listTemplates: vi.fn().mockRejectedValue(error),
      fetchFieldSpecs: vi.fn().mockResolvedValue({ data: { heygen: [], tavus: [] } }),
    }),
  }))
  const Page = (await import('../../app/pages/avatar-templates/index.vue')).default
  const wrapper = mount(withTooltipProvider(Page), {
    global: { mocks: { $t: (key: string) => key } },
    attachTo: document.body,
  })
  await flushPromises()

  return wrapper.get('[data-testid="templates-error"]').text()
}

const http = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status })

describe('load error copy by failure class', () => {
  it('keeps the administrator-role hint for a 403', async () => {
    expect(await failWith(http(403))).toContain('avatar_templates.error.load_body')
  })

  it('says "not found" for a 404', async () => {
    const text = await failWith(http(404))

    expect(text).toContain('errors.states.notFound.message')
    expect(text).not.toContain('avatar_templates.error.load_body')
  })

  it('says "try again" for a network fault or a server error', async () => {
    for (const error of [new Error('boom'), http(500)]) {
      const text = await failWith(error)

      expect(text).toContain('errors.states.error.message')
      expect(text).not.toContain('avatar_templates.error.load_body')
    }
  })
})
