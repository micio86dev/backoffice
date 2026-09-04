/**
 * SessionList — a participant's interview sessions, as a way in to each review.
 *
 * Deliberately thin: it exists so an operator can pick a session, not to review
 * one. What is worth holding is therefore the reading, not the rendering — the
 * three columns an operator scans before choosing, and the empty state that has
 * to say something rather than show a bare table skeleton.
 *
 * The absent-value case matters more than it looks. `started_at` is null for a
 * session that never opened, and `duration_seconds` is null for one still
 * running; a blank cell reads as a bug, so both must render a stated fallback.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import SessionList from '../../../../app/components/organisms/SessionList.vue'

const tMock = (key: string, params?: Record<string, unknown>) =>
  params ? `${key} ${JSON.stringify(params)}` : key

const navigateToMock = vi.fn()

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    competency_code: 'COL',
    started_at: '2026-03-01T10:00:00Z',
    duration_seconds: 420,
    integrity_event_count: 2,
    ...overrides,
  }
}

function mountList(sessions: ReturnType<typeof session>[]) {
  return mount(SessionList, {
    props: { sessions, locale: 'en' },
    // `navigateTo` through `global.mocks`, not `stubGlobal`: the template
    // resolves it off the component context (`_ctx.navigateTo`) because Nuxt
    // auto-imports it, so a global stub is never consulted.
    global: { mocks: { $t: tMock, navigateTo: navigateToMock } },
  })
}

describe('SessionList', () => {
  beforeEach(() => {
    navigateToMock.mockClear()
    vi.stubGlobal(
      'useI18n',
      vi.fn(() => ({ t: tMock }))
    )
  })

  it('says there are none rather than rendering an empty table', () => {
    // A table head with no rows under it reads as "still loading" or "broken".
    // A participant who never started has no sessions, and that is a normal
    // state the screen has to state.
    const wrapper = mountList([])

    expect(wrapper.find('[data-testid="sessions-empty"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="sessions-table"]').exists()).toBe(false)
  })

  it('renders a row per session with what an operator scans on', () => {
    const wrapper = mountList([session({ id: 7, competency_code: 'COL' })])

    const text = wrapper.get('[data-testid="sessions-table"]').text()

    expect(wrapper.find('[data-testid="sessions-empty"]').exists()).toBe(false)
    expect(text).toContain('COL')
    // The integrity count is the column that decides whether a session is worth
    // opening at all.
    expect(text).toContain('2')
  })

  it('states a dash for a session that never started', () => {
    // `started_at` is null until the provider session opens. A blank cell reads
    // as a rendering fault rather than as an absent fact.
    const wrapper = mountList([session({ started_at: null })])

    expect(wrapper.get('[data-testid="sessions-table"]').text()).toContain('–')
  })

  it('opens the review for the row that was clicked', () => {
    // Two sessions, so the assertion cannot pass by opening whichever one
    // happens to be first.
    const wrapper = mountList([session({ id: 7 }), session({ id: 9 })])

    wrapper.get('[data-testid="session-open-9"]').trigger('click')

    expect(navigateToMock).toHaveBeenCalledWith('/interview-sessions/9')
  })
})
