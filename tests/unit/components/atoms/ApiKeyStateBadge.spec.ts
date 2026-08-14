/**
 * ApiKeyStateBadge.vue (dates-and-destructive-actions, design D3)
 *
 * Three-state badge — active / expired / revoked — driven by `client.state`
 * (server-derived, the SAME predicate `ApiClient::scopeActive` uses), never
 * from `is_active` alone. Mirrors UserStateBadge.vue.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ApiKeyStateBadge from '../../../../app/components/atoms/ApiKeyStateBadge.vue'

const tMock = (key: string) => key

describe('ApiKeyStateBadge', () => {
  it('renders "active" for state active', () => {
    const wrapper = mount(ApiKeyStateBadge, {
      props: { state: 'active' },
      global: { mocks: { $t: tMock } },
    })
    expect(wrapper.text()).toContain('settings.apiKeys.state.active')
  })

  it('renders "expired" for state expired', () => {
    const wrapper = mount(ApiKeyStateBadge, {
      props: { state: 'expired' },
      global: { mocks: { $t: tMock } },
    })
    expect(wrapper.text()).toContain('settings.apiKeys.state.expired')
  })

  it('renders "revoked" for state revoked', () => {
    const wrapper = mount(ApiKeyStateBadge, {
      props: { state: 'revoked' },
      global: { mocks: { $t: tMock } },
    })
    expect(wrapper.text()).toContain('settings.apiKeys.state.revoked')
  })
})
