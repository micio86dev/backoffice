/**
 * GlobalTemplateImpactDialog — the usage warning shown before a consequential
 * change to a platform template (DESIGN.md §16.17, slice B2).
 *
 * A platform template is read LIVE by every project that pins it, in every
 * organization, so an edit is not a private change. The dialog is the only
 * place the superadmin is told how far it reaches; nothing is sent until they
 * confirm, and the sentence must carry the real counts.
 */
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { englishI18n } from '../../support/i18n'
import { confirmDialog } from '../../support/confirm'

vi.stubGlobal(
  'useI18n',
  vi.fn(() => englishI18n())
)
const t = englishI18n().t

const GlobalTemplateImpactDialog = (
  await import('../../../../app/components/molecules/GlobalTemplateImpactDialog.vue')
).default

type Action = 'edit' | 'retire' | 'delete'

async function open(action: Action, organizationCount: number, projectCount: number) {
  const wrapper = mount(GlobalTemplateImpactDialog, {
    props: {
      open: true,
      action,
      name: 'Studio voice',
      usage: { organization_count: organizationCount, project_count: projectCount },
    },
    global: { mocks: { $t: t } },
    attachTo: document.body,
  })
  await flushPromises()

  return wrapper
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('GlobalTemplateImpactDialog', () => {
  it('states the actual counts: "N organizations / M projects use this template"', async () => {
    await open('edit', 2, 5)

    expect(document.body.textContent).toContain('2 organizations / 5 projects use this template')
  })

  it('says an edit reaches every pinned project, interviews that resume included', async () => {
    await open('edit', 2, 5)

    expect(document.body.textContent).toContain('every project that uses it')
    expect(document.body.textContent).toContain('resume')
  })

  it('says retiring keeps existing pins working, instead of repeating the edit warning', async () => {
    await open('retire', 3, 4)

    expect(document.body.textContent).toContain('3 organizations / 4 projects use this template')
    expect(document.body.textContent).toContain('keep working')
    expect(document.body.textContent).not.toContain('resume')
  })

  it('always states that a delete cannot be undone, even with zero usage', async () => {
    await open('delete', 0, 0)

    expect(document.body.textContent).toContain('cannot be undone')
    expect(document.body.textContent).not.toContain('use this template')
  })

  it('emits confirm on confirm and nothing else', async () => {
    const wrapper = await open('edit', 1, 2)

    await confirmDialog('confirm')

    expect(wrapper.emitted('confirm')).toHaveLength(1)
    expect(wrapper.emitted('cancel')).toBeUndefined()
  })

  it('emits only cancel on cancel, never confirm', async () => {
    const wrapper = await open('edit', 1, 2)

    await confirmDialog('cancel')

    expect(wrapper.emitted('cancel')).toBeTruthy()
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })
})
