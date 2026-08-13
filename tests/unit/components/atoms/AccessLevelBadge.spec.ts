/**
 * AccessLevelBadge.vue (Unit 6, task 24.4 — RED)
 *
 * Deliberately NOT named RoleBadge (D8 naming discipline): the auth `role`
 * (admin/operator/viewer) and the BEAI organizational `role_code`
 * (ICO/FLL/MLL/BUL/SRX) are unrelated concepts, and a shared component name
 * would invite conflating them.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AccessLevelBadge from '../../../../app/components/atoms/AccessLevelBadge.vue'

const tMock = (key: string) => `users.role.${key.split('.').pop()}`

describe('AccessLevelBadge', () => {
  it.each(['admin', 'operator', 'viewer'])('renders the i18n-labelled %s access level', (role) => {
    const wrapper = mount(AccessLevelBadge, {
      props: { role },
      global: { mocks: { $t: tMock } },
    })
    expect(wrapper.text()).toContain(`users.role.${role}`)
  })
})
