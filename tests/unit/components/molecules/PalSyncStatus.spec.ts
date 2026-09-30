/**
 * PalSyncStatus — the Tavus persona sync state (DESIGN.md 16.16).
 *
 * A persona Tavus refuses to modify used to keep the OLD voice with nothing
 * on screen. Each stable code must read as an explanation, never as the raw
 * code, and the indicator must exist only for Tavus templates.
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PalSyncStatus from '../../../../app/components/molecules/PalSyncStatus.vue'
import { PAL_SYNC_CODES, type PalSync } from '../../../../app/types/avatar-template'

const tMock = (key: string) => key

function render(sync: PalSync | undefined, provider = 'tavus', layout: 'row' | 'banner' = 'row') {
  return mount(PalSyncStatus, {
    props: { sync, provider: provider as 'tavus' | 'heygen', layout },
    global: { mocks: { $t: tMock } },
  })
}

const sync = (over: Partial<PalSync> = {}): PalSync => ({
  status: null,
  code: null,
  synced_at: null,
  ...over,
})

describe('PalSyncStatus', () => {
  it('renders nothing for a non-Tavus template', () => {
    expect(
      render(sync({ status: 'synced' }), 'heygen')
        .find('[data-testid="pal-sync"]')
        .exists()
    ).toBe(false)
  })

  it('says "never synced" when nothing was ever attempted', () => {
    const wrapper = render(sync())
    const root = wrapper.get('[data-testid="pal-sync"]')

    expect(root.attributes('data-status')).toBe('never')
    expect(root.attributes('role')).toBe('status')
    expect(root.text()).toContain('avatar_templates.palSync.status.never')
  })

  it('treats a missing pal_sync like never synced', () => {
    expect(render(undefined).get('[data-testid="pal-sync"]').attributes('data-status')).toBe(
      'never'
    )
  })

  it('shows the last successful sync time when synced', () => {
    const root = render(sync({ status: 'synced', synced_at: '2026-09-29T10:00:00Z' })).get(
      '[data-testid="pal-sync"]'
    )

    expect(root.attributes('data-status')).toBe('synced')
    expect(root.text()).toContain('avatar_templates.palSync.status.synced')
    expect(root.find('[data-testid="pal-sync-time"]').exists()).toBe(true)
  })

  it('shows skipped as a neutral state', () => {
    expect(
      render(sync({ status: 'skipped' }))
        .get('[data-testid="pal-sync"]')
        .attributes('data-status')
    ).toBe('skipped')
  })

  it.each(PAL_SYNC_CODES)('explains warning code %s with its own translated message', (code) => {
    const root = render(sync({ status: 'warning', code })).get('[data-testid="pal-sync"]')

    expect(root.attributes('data-status')).toBe('warning')
    expect(root.text()).toContain(`avatar_templates.warning.${code}`)
    expect(root.text()).not.toContain(`pal_sync.${code}`)
  })

  it('still says when it last worked after a later failure', () => {
    const root = render(
      sync({ status: 'warning', code: 'pal_not_editable', synced_at: '2026-09-28T10:00:00Z' })
    ).get('[data-testid="pal-sync"]')

    expect(root.find('[data-testid="pal-sync-time"]').exists()).toBe(true)
  })

  it('falls back to the generic failure copy for a code it does not know', () => {
    const root = render(sync({ status: 'warning', code: 'brand_new_code' as never })).get(
      '[data-testid="pal-sync"]'
    )

    expect(root.text()).toContain('avatar_templates.warning.pal_sync_failed')
  })

  it('renders the banner layout as an alert with a title', () => {
    const wrapper = render(sync({ status: 'warning', code: 'pal_not_editable' }), 'tavus', 'banner')
    const root = wrapper.get('[data-testid="pal-sync"]')

    expect(root.attributes('data-layout')).toBe('banner')
    expect(root.text()).toContain('avatar_templates.palSync.bannerTitle')
    expect(root.text()).toContain('avatar_templates.warning.pal_not_editable')
  })
})
