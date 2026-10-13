/**
 * SessionNav — the switcher between the sibling sessions of one interview.
 *
 * What is worth holding: it stays absent for a single session (chrome with no
 * function), follows the project's delivery order rather than the order the
 * API happened to list them in, and never links the current session to itself.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SessionNav from '../../../../app/components/organisms/SessionNav.vue'

const tMock = (key: string, params?: Record<string, unknown>) =>
  params ? `${key} ${JSON.stringify(params)}` : key

function session(id: number, code: string, questionIndex: number) {
  return { id, competency_code: code, question_index: questionIndex } as never
}

function mountNav(sessions: unknown[], currentSessionId: number) {
  return mount(SessionNav, {
    props: { sessions: sessions as never[], currentSessionId },
    global: { mocks: { $t: tMock } },
  })
}

describe('SessionNav', () => {
  it('renders nothing for a single session', () => {
    const wrapper = mountNav([session(1, 'COL', 0)], 1)

    expect(wrapper.find('[data-testid="session-nav"]').exists()).toBe(false)
  })

  it('orders the entries by question_index, not by the order received', () => {
    const wrapper = mountNav([session(3, 'RES', 2), session(1, 'COL', 0), session(2, 'INN', 1)], 1)

    const labels = wrapper.findAll('button, a').map((el) => el.text())
    expect(labels).toEqual(['COL', 'INN', 'RES'])
  })

  it('shows the current session as a disabled page marker, not a link to itself', () => {
    const wrapper = mountNav([session(1, 'COL', 0), session(2, 'INN', 1)], 2)

    const current = wrapper.get('[data-testid="session-nav-current-2"]')
    expect(current.attributes('disabled')).toBeDefined()
    expect(current.attributes('aria-current')).toBe('page')
    expect(current.attributes('aria-label')).toContain('review.sessions.current')
    expect(wrapper.find('[data-testid="session-nav-2"]').exists()).toBe(false)
  })

  it('links every other session to its own review', () => {
    const wrapper = mountNav([session(1, 'COL', 0), session(2, 'INN', 1)], 2)

    expect(wrapper.get('[data-testid="session-nav-1"]').attributes('href')).toBe(
      '/interview-sessions/1'
    )
    expect(wrapper.find('[data-testid="session-nav-current-1"]').exists()).toBe(false)
  })

  it('does not mutate the sessions array it was given', () => {
    const sessions = [session(2, 'INN', 1), session(1, 'COL', 0)]

    mountNav(sessions, 1)

    expect((sessions[0] as { id: number }).id).toBe(2)
  })
})
