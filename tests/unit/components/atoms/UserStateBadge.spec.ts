/**
 * UserStateBadge.vue (Unit 6, task 24.4 — RED)
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import UserStateBadge from '../../../../app/components/atoms/UserStateBadge.vue'

const tMock = (key: string) => `users.state.${key.split('.').pop()}`

describe('UserStateBadge', () => {
  it('renders "active" when the user is not deactivated', () => {
    const wrapper = mount(UserStateBadge, {
      props: { deactivated: false },
      global: { mocks: { $t: tMock } },
    })
    expect(wrapper.text()).toContain('users.state.active')
  })

  it('renders "deactivated" when the user is deactivated', () => {
    const wrapper = mount(UserStateBadge, {
      props: { deactivated: true },
      global: { mocks: { $t: tMock } },
    })
    expect(wrapper.text()).toContain('users.state.deactivated')
  })
})
