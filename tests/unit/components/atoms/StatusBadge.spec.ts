/**
 * StatusBadge.vue (PR B3, task 19.3 — RED)
 *
 * Extracts the participant-lifecycle-status badge already used inline in
 * CandidateTable.vue and pages/participants/[id].vue (PR B2) into a single
 * reusable atom, per DESIGN.md §5 (a matching Vitest test per component).
 * Maps every status onto one of Badge's OWN pre-verified-contrast variants
 * (statusBadgeVariant, participant-lifecycle.ts) — never a custom class, per
 * the a11y bugfix already documented for PR B2.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StatusBadge from '../../../../app/components/atoms/StatusBadge.vue'

const tMock = (key: string) => `participants.status.${key.split('.').pop()}`

describe('StatusBadge', () => {
  it('renders the i18n-labelled status', () => {
    const wrapper = mount(StatusBadge, {
      props: { status: 'completato' },
      global: { mocks: { $t: tMock } },
    })
    expect(wrapper.text()).toContain('participants.status.completato')
  })

  it('renders a DIFFERENT label for a different status (proves real prop rendering)', () => {
    const wrapper = mount(StatusBadge, {
      props: { status: 'in_corso' },
      global: { mocks: { $t: tMock } },
    })
    expect(wrapper.text()).toContain('participants.status.in_corso')
    expect(wrapper.text()).not.toContain('completato')
  })
})
