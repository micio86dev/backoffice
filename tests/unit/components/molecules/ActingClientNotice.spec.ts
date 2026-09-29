import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ActingClientNotice from '../../../../app/components/molecules/ActingClientNotice.vue'
import { ACTING_CLIENT_NOTICE_ID } from '../../../../app/composables/useActingClientRequired'

describe('ActingClientNotice', () => {
  it('is a polite status region carrying the shared id', () => {
    const wrapper = mount(ActingClientNotice, { global: { mocks: { $t: (k: string) => k } } })
    const root = wrapper.get('[data-testid="acting-client-notice"]')

    expect(root.attributes('role')).toBe('status')
    expect(root.attributes('id')).toBe(ACTING_CLIENT_NOTICE_ID)
    expect(root.text()).toContain('superadmin.actingClientRequired.body')
  })
})
