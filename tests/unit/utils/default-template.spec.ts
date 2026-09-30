/**
 * pickDefaultTemplate + groupTemplateOptions (global-avatar-templates, B1).
 *
 * The picker preselects for a NEW project only, and a template owned by the
 * organization always wins over a platform one: an org that curated its own
 * templates must not have a project silently land on somebody else's voice.
 */
import { describe, it, expect } from 'vitest'
import { pickDefaultTemplate, groupTemplateOptions } from '../../../app/utils/default-template'
import type { TemplateOption } from '../../../app/types/avatar-template'

function option(id: number, overrides: Partial<TemplateOption> = {}): TemplateOption {
  return {
    id,
    name: `Template ${id}`,
    provider: 'heygen',
    is_active: true,
    scope: 'organization',
    ...overrides,
  }
}

describe('pickDefaultTemplate', () => {
  it('prefers an own active template over an active global, whatever the list order', () => {
    const list = [option(1, { scope: 'platform' }), option(2)]

    expect(pickDefaultTemplate(list)?.id).toBe(2)
  })

  it('takes the first active global when the organization has no active template', () => {
    const list = [
      option(1, { is_active: false }),
      option(2, { scope: 'platform' }),
      option(3, { scope: 'platform' }),
    ]

    expect(pickDefaultTemplate(list)?.id).toBe(2)
  })

  it('never preselects an inactive own template, and skips an inactive global', () => {
    const list = [
      option(1, { is_active: false }),
      option(2, { scope: 'platform', is_active: false }),
    ]

    expect(pickDefaultTemplate(list)).toBeNull()
  })

  it('returns null for an empty list', () => {
    expect(pickDefaultTemplate([])).toBeNull()
  })

  it('treats a missing scope as an own template', () => {
    const legacy = { id: 5, name: 'Legacy', provider: 'tavus', is_active: true } as TemplateOption

    expect(pickDefaultTemplate([option(1, { scope: 'platform' }), legacy])?.id).toBe(5)
  })
})

describe('groupTemplateOptions', () => {
  it('splits own from platform templates, keeping the API order inside each group', () => {
    const groups = groupTemplateOptions(
      [option(1, { scope: 'platform' }), option(2), option(3, { scope: 'platform' }), option(4)],
      null
    )

    expect(groups.own.map((o) => o.id)).toEqual([2, 4])
    expect(groups.platform.map((o) => o.id)).toEqual([1, 3])
  })

  it('drops a retired global unless it is the current pin', () => {
    const list = [
      option(1, { scope: 'platform', is_active: false }),
      option(2, { scope: 'platform', is_active: false }),
      option(3, { scope: 'platform' }),
    ]

    expect(groupTemplateOptions(list, null).platform.map((o) => o.id)).toEqual([3])
    expect(groupTemplateOptions(list, 2).platform.map((o) => o.id)).toEqual([2, 3])
  })

  it('keeps an inactive own template selectable', () => {
    const groups = groupTemplateOptions([option(1, { is_active: false })], null)

    expect(groups.own.map((o) => o.id)).toEqual([1])
  })
})
