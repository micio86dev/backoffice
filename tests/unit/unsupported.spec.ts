import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import UnsupportedPage from '../../app/pages/unsupported.vue'

describe('UnsupportedPage (SA-11 gate)', () => {
  it('renders the unsupported-gate element', () => {
    const wrapper = mount(UnsupportedPage, {
      global: {
        mocks: {
          $t: (key: string) => key,
        },
      },
    })
    expect(wrapper.find('[data-testid="unsupported-gate"]').exists()).toBe(true)
  })

  it('does NOT render health-status element', () => {
    const wrapper = mount(UnsupportedPage, {
      global: {
        mocks: {
          $t: (key: string) => key,
        },
      },
    })
    expect(wrapper.find('[data-testid="health-status"]').exists()).toBe(false)
  })

  it('renders i18n title key', () => {
    const tMock = vi.fn((key: string) => {
      const map: Record<string, string> = {
        'unsupported.title': 'Browser non supportato',
        'unsupported.message': 'Messaggio non supportato',
      }
      return map[key] ?? key
    })
    const wrapper = mount(UnsupportedPage, {
      global: {
        mocks: { $t: tMock },
      },
    })
    expect(wrapper.find('h1').text()).toBe('Browser non supportato')
  })

  it('routes the <title> through i18n, like the <h1> right below it', () => {
    // The sharpest case of the hardcoded-title bug: the <h1> went through
    // $t('unsupported.title') while the <title> above it was English only —
    // and a <title> is what a screen reader announces FIRST on navigation.
    const useHeadMock = vi.fn()
    vi.stubGlobal('useHead', useHeadMock)
    vi.stubGlobal(
      'useI18n',
      vi.fn(() => ({ t: (key: string) => key }))
    )

    mount(UnsupportedPage, { global: { mocks: { $t: (key: string) => key } } })

    const head = useHeadMock.mock.calls[0]?.[0] as { title?: () => string }
    expect(typeof head?.title).toBe('function')
    expect(head?.title?.()).toBe('head.title.unsupported')
  })
})
