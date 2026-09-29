/**
 * AvatarTemplateProviderCombobox — persona ownership on the `pal` picker.
 *
 * `editable` is Tavus's own classification: true = one of the account's
 * personas, false = a Tavus stock persona, null = unknown. Selection is never
 * blocked; the picker only says what is about to be true.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import AvatarTemplateProviderCombobox from '../../app/components/organisms/AvatarTemplateProviderCombobox.vue'
import type { CatalogueEntry } from '../../app/types/avatar-template'

const fetchCatalogue = vi.fn()

vi.mock('@/composables/useAvatarTemplates', () => ({
  useAvatarTemplates: () => ({ fetchCatalogue }),
}))

function persona(id: string, editable: boolean | null): CatalogueEntry {
  return {
    id,
    provider: 'tavus',
    label: `Persona ${id}`,
    name: id,
    language: null,
    locale: null,
    accent: null,
    italian: null,
    preview_image_url: null,
    preview_audio_url: null,
    preview_video_url: null,
    editable,
  }
}

const ITEMS = [persona('own', true), persona('stock', false), persona('unk', null)]

function mountPicker(resource: 'pal' | 'replica' = 'pal', modelValue = '') {
  return mount(AvatarTemplateProviderCombobox, {
    props: {
      field: {
        key: 'palId',
        type: 'text' as const,
        label_key: 'avatar_templates.field.palId',
        catalogue_resource: resource,
      },
      provider: 'tavus',
      modelValue,
    },
    attrs: { id: 'template-config-palId', 'data-testid': 'template-config-palId' },
    global: { mocks: { $t: (k: string) => k } },
    attachTo: document.body,
  })
}

const sel = (id: string) => `[data-testid="${id}"]`
const P = 'template-config-palId'

async function open(wrapper: ReturnType<typeof mountPicker>) {
  await wrapper.get(sel(P)).trigger('click')
  await flushPromises()
}

beforeEach(() => {
  document.body.innerHTML = ''
  fetchCatalogue.mockReset()
  fetchCatalogue.mockResolvedValue({ status: 'ok', items: ITEMS })
})

describe('persona ownership badges', () => {
  it('badges an own persona "Yours"', async () => {
    const wrapper = mountPicker()
    await flushPromises()
    await open(wrapper)

    const badge = wrapper.get(sel(`${P}-editable-badge-own`))
    expect(badge.text()).toContain('avatar_templates.form.catalogue.editable.yes')
    expect(badge.attributes('data-editable')).toBe('true')
  })

  it('badges a Tavus stock persona as read-only', async () => {
    const wrapper = mountPicker()
    await flushPromises()
    await open(wrapper)

    const badge = wrapper.get(sel(`${P}-editable-badge-stock`))
    expect(badge.text()).toContain('avatar_templates.form.catalogue.editable.no')
    expect(badge.attributes('data-editable')).toBe('false')
  })

  it('shows no badge when ownership is unknown', async () => {
    const wrapper = mountPicker()
    await flushPromises()
    await open(wrapper)

    expect(wrapper.find(sel(`${P}-editable-badge-unk`)).exists()).toBe(false)
  })

  it('keeps the API order (no regrouping by ownership)', async () => {
    const wrapper = mountPicker()
    await flushPromises()
    await open(wrapper)

    const ids = wrapper
      .findAll('[role="option"]')
      .map((o) => o.attributes('data-testid')?.replace(`${P}-item-`, ''))
    expect(ids).toEqual(['own', 'stock', 'unk'])
  })

  it('does not block selecting a non-editable persona', async () => {
    const wrapper = mountPicker()
    await flushPromises()
    await open(wrapper)
    await wrapper.get(sel(`${P}-item-stock`)).trigger('click')

    expect(wrapper.emitted('change')?.[0]).toEqual(['stock'])
  })

  it('shows no badge on lists other than personas', async () => {
    const wrapper = mountPicker('replica')
    await flushPromises()
    await open(wrapper)

    expect(wrapper.find(sel(`${P}-editable-badge-stock`)).exists()).toBe(false)
  })
})

describe('hint under the selected persona', () => {
  it('warns for a Tavus stock persona', async () => {
    const wrapper = mountPicker('pal', 'stock')
    await flushPromises()

    const hint = wrapper.get(sel(`${P}-editable-hint`))
    expect(hint.text()).toContain('avatar_templates.form.catalogue.editable.hintNo')
  })

  it('says ownership is unverified for an unknown persona', async () => {
    const wrapper = mountPicker('pal', 'unk')
    await flushPromises()

    expect(wrapper.get(sel(`${P}-editable-hint`)).text()).toContain(
      'avatar_templates.form.catalogue.editable.hintUnknown'
    )
  })

  it('stays silent for an own persona', async () => {
    const wrapper = mountPicker('pal', 'own')
    await flushPromises()

    expect(wrapper.find(sel(`${P}-editable-hint`)).exists()).toBe(false)
  })
})
