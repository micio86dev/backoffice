/**
 * OrganizationMultiSelect — pick any number of organizations (DESIGN.md §16.15).
 *
 * Pins the behaviour that is easy to get subtly wrong: "select all" acts on
 * what is VISIBLE (a filter narrows it), a filtered-out selection survives,
 * and the header box is mixed — not checked — over a partial selection.
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import OrganizationMultiSelect from '../../../../app/components/molecules/OrganizationMultiSelect.vue'

const tMock = (key: string, params?: Record<string, unknown>) =>
  params ? `${key} ${JSON.stringify(params)}` : key

const orgs = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `Org ${String.fromCharCode(65 + i)}` }))

function mountIt(organizations = orgs(3), modelValue: number[] = []) {
  return mount(OrganizationMultiSelect, {
    props: { organizations, modelValue, idPrefix: 'copy' },
    global: { mocks: { $t: tMock } },
    attachTo: document.body,
  })
}

const box = (w: ReturnType<typeof mountIt>, testId: string) => w.get(`[data-testid="${testId}"]`)
const lastEmit = (w: ReturnType<typeof mountIt>) =>
  w.emitted('update:modelValue')?.at(-1)?.[0] as number[]

describe('OrganizationMultiSelect', () => {
  it('renders one CheckboxField per organization', () => {
    const w = mountIt()

    expect(w.findAll('[data-slot="checkbox-field"]')).toHaveLength(3 + 1) // + select all
    expect(w.text()).toContain('Org A')
    expect(w.text()).toContain('Org C')
  })

  it('emits the toggled id, keeping list order', async () => {
    const w = mountIt(orgs(3), [3])

    await box(w, 'org-option-1').trigger('click')

    expect(lastEmit(w)).toEqual([1, 3])
  })

  it('select all is unchecked, mixed, then checked as the selection grows', async () => {
    const none = mountIt()
    expect(box(none, 'org-select-all').attributes('aria-checked')).toBe('false')

    const some = mountIt(orgs(3), [1])
    expect(box(some, 'org-select-all').attributes('aria-checked')).toBe('mixed')

    const all = mountIt(orgs(3), [1, 2, 3])
    expect(box(all, 'org-select-all').attributes('aria-checked')).toBe('true')
  })

  it('select all over a partial selection selects everything; over a full one clears it', async () => {
    const some = mountIt(orgs(3), [1])
    await box(some, 'org-select-all').trigger('click')
    expect(lastEmit(some)).toEqual([1, 2, 3])

    const all = mountIt(orgs(3), [1, 2, 3])
    await box(all, 'org-select-all').trigger('click')
    expect(lastEmit(all)).toEqual([])
  })

  it('shows the selected count', () => {
    const w = mountIt(orgs(3), [1, 2])

    expect(w.get('[data-testid="org-selected-count"]').text()).toContain('"count":2')
  })

  it('offers search only for a long list, and filtering narrows the options', async () => {
    expect(mountIt(orgs(3)).find('[data-testid="org-search"]').exists()).toBe(false)

    const w = mountIt(orgs(10))
    await w.get('[data-testid="org-search"]').setValue('org c')

    expect(w.find('[data-testid="org-option-3"]').exists()).toBe(true)
    expect(w.find('[data-testid="org-option-1"]').exists()).toBe(false)
  })

  it('select all acts on the visible options only and keeps hidden selections', async () => {
    const w = mountIt(orgs(10), [10])
    await w.get('[data-testid="org-search"]').setValue('org a')

    await box(w, 'org-select-all').trigger('click')

    expect(lastEmit(w)).toEqual([1, 10])
  })

  it('says so when the filter matches nothing', async () => {
    const w = mountIt(orgs(10))
    await w.get('[data-testid="org-search"]').setValue('zzz')

    expect(w.get('[data-testid="org-no-matches"]').text()).toContain(
      'avatar_templates.copy.noMatches'
    )
    expect(w.find('[data-testid="org-select-all"]').attributes('disabled')).toBeDefined()
  })

  it('says so when there are no organizations at all', () => {
    const w = mountIt([])

    expect(w.get('[data-testid="org-empty"]').text()).toContain(
      'avatar_templates.copy.noOrganizations'
    )
  })
})
