/**
 * RecentActivity.vue — the dashboard's recent-activity feed.
 *
 * Presentational by contract: rows arrive already ordered and already capped by
 * the API. This spec pins that it does NOT re-sort or slice, because the moment
 * it does, the panel and the server disagree about what "recent" means and only
 * one of them is authoritative.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RecentActivity from '../../../../app/components/organisms/RecentActivity.vue'

const tMock = (key: string) => key

function row(over: Partial<Record<string, string | number>> = {}) {
  return {
    id: 1,
    candidate_ref: 'ref-1',
    display_name: 'Mario Rossi',
    status: 'in_corso',
    project_name: 'Demo Project',
    updated_at: '2026-03-01T10:00:00+00:00',
    ...over,
  }
}

const NuxtLinkStub = {
  props: ['to'],
  template: '<a :href="to"><slot /></a>',
}

function mountFeed(rows: ReturnType<typeof row>[]) {
  return mount(RecentActivity, {
    props: { rows, locale: 'it' },
    global: { mocks: { $t: tMock }, stubs: { NuxtLink: NuxtLinkStub } },
  })
}

describe('RecentActivity', () => {
  it('renders one list item per row, in the order given', () => {
    const wrapper = mountFeed([
      row({ candidate_ref: 'a', display_name: 'Anna' }),
      row({ candidate_ref: 'b', display_name: 'Bruno' }),
      row({ candidate_ref: 'c', display_name: 'Carla' }),
    ])

    const names = wrapper.findAll('ol > li').map((li) => li.text())
    expect(names).toHaveLength(3)
    expect(names[0]).toContain('Anna')
    expect(names[2]).toContain('Carla')
  })

  it('does not re-sort: a deliberately unsorted list is rendered as given', () => {
    const wrapper = mountFeed([
      row({
        candidate_ref: 'old',
        display_name: 'Vecchio',
        updated_at: '2026-01-01T10:00:00+00:00',
      }),
      row({ candidate_ref: 'new', display_name: 'Nuovo', updated_at: '2026-05-01T10:00:00+00:00' }),
    ])

    expect(wrapper.findAll('ol > li')[0]?.text()).toContain('Vecchio')
  })

  it('shows an explanatory empty state rather than a blank panel', () => {
    const wrapper = mountFeed([])

    expect(wrapper.find('[data-testid="activity-empty"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="activity-list"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('dashboard.activity.empty')
  })

  // The machine-readable instant and the human-readable text are different
  // values; conflating them makes the date unreadable to one of the two.
  it('keeps the raw ISO instant in datetime while showing localized text', () => {
    const wrapper = mountFeed([row()])
    const time = wrapper.get('time')

    expect(time.attributes('datetime')).toBe('2026-03-01T10:00:00+00:00')
    expect(time.text()).not.toBe('2026-03-01T10:00:00+00:00')
  })

  it('names the project, and says so when it is missing', () => {
    expect(mountFeed([row()]).text()).toContain('Demo Project')
    expect(mountFeed([row({ project_name: null as unknown as string })]).text()).toContain(
      'dashboard.activity.noProject'
    )
  })

  it('labels its own section with its own heading', () => {
    const wrapper = mountFeed([row()])
    const labelledBy = wrapper.get('section').attributes('aria-labelledby')

    expect(wrapper.get(`#${labelledBy}`).element.tagName).toBe('H2')
  })
})

describe('RecentActivity — the rows go somewhere', () => {
  it('links each candidate to their own detail page', () => {
    // The feed answers "is anything moving?". A row that names a candidate and
    // gives no way to go and look sends the reader to the search box on
    // another page — which is the trip this panel was added to remove.
    const wrapper = mountFeed([
      row({ id: 42, display_name: 'Anna' }),
      row({ id: 43, display_name: 'Bruno' }),
    ])

    const links = wrapper.findAll('[data-testid="activity-candidate-link"]')

    expect(links).toHaveLength(2)
    expect(links[0]?.attributes('href')).toBe('/participants/42')
    expect(links[1]?.attributes('href')).toBe('/participants/43')
  })

  it("links on the row id, never on the calling system's reference", () => {
    // `candidate_ref` is opaque and owned by the calling system; it addresses
    // nothing in this product, and a link built from it would 404.
    const wrapper = mountFeed([row({ id: 7, candidate_ref: 'ext-abc-999' })])

    const href = wrapper.get('[data-testid="activity-candidate-link"]').attributes('href')

    expect(href).toBe('/participants/7')
    expect(href).not.toContain('ext-abc-999')
  })
})
