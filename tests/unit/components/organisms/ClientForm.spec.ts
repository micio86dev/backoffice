/**
 * ClientForm.vue (template-provider-fixes T7) — superadmin organization
 * create/edit.
 *
 * One form for both: create takes name + optional slug + colour; edit loads the
 * organization and shows the slug read-only, because the API refuses to change
 * it (a tenancy identifier). Server 422 codes land on the field they name.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ClientForm from '../../../../app/components/organisms/ClientForm.vue'

const createClientMock = vi.fn()
const fetchClientMock = vi.fn()
const updateClientMock = vi.fn()

vi.mock('@/composables/useSuperadmin', () => ({
  useSuperadmin: () => ({
    createClient: createClientMock,
    fetchClient: fetchClientMock,
    updateClient: updateClientMock,
  }),
}))

const sel = (id: string) => `[data-testid="${id}"]`

function mountForm(clientId?: number) {
  return mount(ClientForm, {
    props: clientId === undefined ? {} : { clientId },
    global: { mocks: { $t: (key: string) => key } },
  })
}

function validationError(errors: Record<string, string[]>) {
  return Object.assign(new Error('422'), { status: 422, data: { errors } })
}

const EXISTING = {
  data: { id: 4, name: 'Quint', slug: 'quint', primary_color: '#112233', logo_url: null },
}

beforeEach(() => {
  createClientMock.mockReset().mockResolvedValue({ data: { id: 9 } })
  fetchClientMock.mockReset().mockResolvedValue(EXISTING)
  updateClientMock.mockReset().mockResolvedValue(EXISTING)
})

describe('create', () => {
  it('offers name, slug and colour, and does not fetch anything', () => {
    const wrapper = mountForm()

    expect(wrapper.find(sel('client-name')).exists()).toBe(true)
    expect(wrapper.get(sel('client-slug')).attributes('readonly')).toBeUndefined()
    expect(wrapper.find(sel('client-color-text')).exists()).toBe(true)
    expect(fetchClientMock).not.toHaveBeenCalled()
  })

  it('creates with name and slug, then reports it saved', async () => {
    const wrapper = mountForm()

    await wrapper.get(sel('client-name')).setValue('Acme Spa')
    await wrapper.get(sel('client-slug')).setValue('acme')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(createClientMock).toHaveBeenCalledWith({ name: 'Acme Spa', slug: 'acme' })
    expect(wrapper.emitted('saved')).toHaveLength(1)
  })

  it('leaves the slug out when blank, so the API derives it', async () => {
    const wrapper = mountForm()

    await wrapper.get(sel('client-name')).setValue('Acme Spa')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(createClientMock).toHaveBeenCalledWith({ name: 'Acme Spa' })
  })

  it('sets the colour after creating, because the create endpoint takes none', async () => {
    const wrapper = mountForm()

    await wrapper.get(sel('client-name')).setValue('Acme Spa')
    await wrapper.get(sel('client-color-text')).setValue('#AABBCC')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(createClientMock).toHaveBeenCalledWith({ name: 'Acme Spa' })
    expect(updateClientMock).toHaveBeenCalledWith(9, { primary_color: '#AABBCC' })
    expect(wrapper.emitted('saved')).toHaveLength(1)
  })

  it('refuses a blank name without calling the API', async () => {
    const wrapper = mountForm()

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(createClientMock).not.toHaveBeenCalled()
    expect(wrapper.get(sel('client-name-error')).text()).toContain(
      'clients.form.errors.name_required'
    )
  })

  it('refuses a malformed slug and a malformed colour client-side', async () => {
    const wrapper = mountForm()

    await wrapper.get(sel('client-name')).setValue('Acme')
    await wrapper.get(sel('client-slug')).setValue('Not A Slug!')
    await wrapper.get(sel('client-color-text')).setValue('red')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(createClientMock).not.toHaveBeenCalled()
    expect(wrapper.get(sel('client-slug-error')).text()).toContain(
      'clients.form.errors.slug_invalid'
    )
    expect(wrapper.get(sel('client-color-error')).text()).toContain(
      'clients.form.errors.primary_color_invalid'
    )
  })

  it.each([
    ['slug', 'slug_taken', 'client-slug-error'],
    ['slug', 'slug_invalid', 'client-slug-error'],
    ['name', 'name_required', 'client-name-error'],
  ])(
    'shows a server %s / %s refusal under its own field, translated',
    async (field, code, testId) => {
      createClientMock.mockRejectedValue(validationError({ [field]: [code] }))
      const wrapper = mountForm()

      await wrapper.get(sel('client-name')).setValue('Acme')
      await wrapper.get('form').trigger('submit')
      await flushPromises()

      expect(wrapper.get(sel(testId)).text()).toContain(`clients.form.serverError.${code}`)
      expect(wrapper.emitted('saved')).toBeUndefined()
    }
  )

  it('shows a generic banner when the failure carries no field', async () => {
    createClientMock.mockRejectedValue(new Error('network'))
    const wrapper = mountForm()

    await wrapper.get(sel('client-name')).setValue('Acme')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find(sel('client-form-banner')).exists()).toBe(true)
  })

  it('reports its in-flight state so the drawer can disable its submit', async () => {
    let finish: (value: unknown) => void = () => undefined
    createClientMock.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const wrapper = mountForm()

    await wrapper.get(sel('client-name')).setValue('Acme')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('update:pending')?.at(-1)).toEqual([true])

    finish({ data: { id: 9 } })
    await flushPromises()

    expect(wrapper.emitted('update:pending')?.at(-1)).toEqual([false])
  })
})

describe('edit', () => {
  it('loads the organization and fills name and colour', async () => {
    const wrapper = mountForm(4)
    await flushPromises()

    expect(fetchClientMock).toHaveBeenCalledWith(4)
    expect((wrapper.get(sel('client-name')).element as HTMLInputElement).value).toBe('Quint')
    expect((wrapper.get(sel('client-color-text')).element as HTMLInputElement).value).toBe(
      '#112233'
    )
  })

  it('shows the slug read-only: it can never change', async () => {
    const wrapper = mountForm(4)
    await flushPromises()

    const slug = wrapper.get(sel('client-slug'))

    expect((slug.element as HTMLInputElement).value).toBe('quint')
    expect(slug.attributes('readonly')).toBeDefined()
  })

  it('PATCHes name and colour only, never the slug', async () => {
    const wrapper = mountForm(4)
    await flushPromises()

    await wrapper.get(sel('client-name')).setValue('Quint Group')
    await wrapper.get(sel('client-color-text')).setValue('#445566')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(updateClientMock).toHaveBeenCalledWith(4, {
      name: 'Quint Group',
      primary_color: '#445566',
    })
    expect(createClientMock).not.toHaveBeenCalled()
    expect(wrapper.emitted('saved')).toHaveLength(1)
  })

  it('clearing the colour sends null, returning the organization to the product palette', async () => {
    const wrapper = mountForm(4)
    await flushPromises()

    await wrapper.get(sel('client-color-clear')).trigger('click')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(updateClientMock).toHaveBeenCalledWith(4, { name: 'Quint', primary_color: null })
  })

  it('shows a server colour refusal under the colour field', async () => {
    updateClientMock.mockRejectedValue(
      validationError({ primary_color: ['primary_color_invalid'] })
    )
    const wrapper = mountForm(4)
    await flushPromises()

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get(sel('client-color-error')).text()).toContain(
      'clients.form.serverError.primary_color_invalid'
    )
  })

  it('says so when the organization cannot be loaded, without offering a form to save blind', async () => {
    fetchClientMock.mockRejectedValue(new Error('403'))
    const wrapper = mountForm(4)
    await flushPromises()

    expect(wrapper.find(sel('client-load-error')).exists()).toBe(true)
    expect(wrapper.find(sel('client-name')).exists()).toBe(false)
  })
})
