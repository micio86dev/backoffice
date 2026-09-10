/**
 * AccessLevelBadge.vue (Unit 6, task 24.4 — RED)
 *
 * Deliberately NOT named RoleBadge (D8 naming discipline): the auth `role`
 * (admin/operator/viewer) and the BEAI organizational `role_code`
 * (ICO/FLL/MLL/BUL/SRX) are unrelated concepts, and a shared component name
 * would invite conflating them.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { realI18n } from '../../support/i18n'
import AccessLevelBadge from '../../../../app/components/atoms/AccessLevelBadge.vue'

// `te` answers from the REAL locale files. The global stub says true to every
// key, so the fallback branch below could never be reached and a role with no
// copy would have rendered its own i18n key at the operator under a green
// test.
vi.stubGlobal('useI18n', () => realI18n())

describe('AccessLevelBadge', () => {
  it.each(['admin', 'operator', 'viewer', 'superadmin'])(
    'renders the i18n-labelled %s access level',
    (role) => {
      const wrapper = mount(AccessLevelBadge, { props: { role } })

      expect(wrapper.text()).toContain(`users.role.${role}`)
    }
  )

  it('gives a superadmin a variant of its own, not the observer one', () => {
    // `role` is a plain string, so an unmapped value collapsed to `outline` —
    // the same variant `viewer` uses. Two different access levels, one visual.
    const superadmin = mount(AccessLevelBadge, { props: { role: 'superadmin' } })
    const viewer = mount(AccessLevelBadge, { props: { role: 'viewer' } })

    expect(superadmin.attributes('data-variant')).not.toBe(viewer.attributes('data-variant'))
  })

  it('falls back to a real label for a role it has no copy for', () => {
    // The variant map had a `?? 'outline'` fallback and the LABEL had none, so
    // an unmapped role printed `users.role.<whatever>` — a raw i18n key as
    // user-facing copy. `role` is a plain string: unmapped is one API change
    // away, not hypothetical.
    const wrapper = mount(AccessLevelBadge, { props: { role: 'not_a_real_role' } })

    expect(wrapper.text()).toContain('users.role.unknown')
    expect(wrapper.text()).not.toContain('users.role.not_a_real_role')
  })
})
