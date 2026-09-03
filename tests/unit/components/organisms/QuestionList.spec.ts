/**
 * QuestionList — the predefined questions of one competency, reorderable.
 *
 * Presentational on purpose: props in, events out. The page owns the API
 * calls, so this can be tested without a network layer and reused wherever a
 * project's questions need editing.
 *
 * DRAG AND DROP IS NOT ENOUGH, and that is the point of the move buttons.
 * A pointer-only reordering control is unusable by keyboard and by anyone
 * relying on assistive tech, and this repo lints templates with
 * eslint-plugin-vuejs-accessibility and runs axe in E2E precisely so that does
 * not ship. The buttons are the accessible path; the drag is the fast one.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import QuestionList from '../../../../app/components/organisms/QuestionList.vue'

const tMock = (key: string) => key

function question(id: number, en: string, position: number) {
  return {
    id,
    project_id: 1,
    competency_id: 9,
    competency_code: 'PRS',
    text: { en, it: `${en} (it)` },
    position,
    created_at: '2026-09-02T10:00:00Z',
    updated_at: '2026-09-02T10:00:00Z',
  }
}

function mountList(questions = [question(1, 'first', 0), question(2, 'second', 1)]) {
  return mount(QuestionList, {
    props: { questions, locale: 'it' },
    global: { mocks: { $t: tMock }, stubs: { Button: { template: '<button><slot /></button>' } } },
  })
}

describe('QuestionList', () => {
  it('renders one row per question, in the given order', () => {
    const rows = mountList().findAll('[data-testid^="question-row-"]')

    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain('first')
    expect(rows[1].text()).toContain('second')
  })

  it('shows the question in the operator locale, falling back to English', () => {
    // The API stores a locale map and the UI edits both, but the READ-ONLY row
    // shows one — the project's language — so an operator scanning a list is
    // not reading two copies of everything.
    const wrapper = mount(QuestionList, {
      props: { questions: [question(1, 'only english', 0)], locale: 'en' },
      global: {
        mocks: { $t: tMock },
        stubs: { Button: { template: '<button><slot /></button>' } },
      },
    })

    expect(wrapper.get('[data-testid="question-row-1"]').text()).toContain('only english')
  })

  it('emits reorder with the WHOLE new order when a row moves down', () => {
    // The whole list, never a single move: the server rewrites every position
    // in one transaction, and a partial move would collide with the position
    // it is moving into.
    const wrapper = mountList()

    wrapper.get('[data-testid="question-down-1"]').trigger('click')

    expect(wrapper.emitted('reorder')?.[0]?.[0]).toEqual([2, 1])
  })

  it('emits reorder when a row moves up', () => {
    const wrapper = mountList()

    wrapper.get('[data-testid="question-up-2"]').trigger('click')

    expect(wrapper.emitted('reorder')?.[0]?.[0]).toEqual([2, 1])
  })

  it('cannot move the first row up or the last row down', () => {
    // Disabled rather than absent: a control that disappears makes the row
    // heights jump as the list is reordered, and the operator loses their place.
    const wrapper = mountList()

    expect(wrapper.get('[data-testid="question-up-1"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="question-down-2"]').attributes('disabled')).toBeDefined()
  })

  it('emits edit and remove with the question id', () => {
    const wrapper = mountList()

    wrapper.get('[data-testid="question-edit-1"]').trigger('click')
    wrapper.get('[data-testid="question-remove-2"]').trigger('click')

    expect(wrapper.emitted('edit')?.[0]?.[0]).toBe(1)
    expect(wrapper.emitted('remove')?.[0]?.[0]).toBe(2)
  })

  it('reorders on drop, emitting the same whole-list shape as the buttons', () => {
    const wrapper = mountList()

    wrapper.get('[data-testid="question-grip-1"]').trigger('dragstart')
    wrapper.get('[data-testid="question-grip-2"]').trigger('drop')

    expect(wrapper.emitted('reorder')?.[0]?.[0]).toEqual([2, 1])
  })

  it('says so when there are no questions yet', () => {
    // An empty list is the NORMAL state for a standard project — the AI opens
    // the competency itself — so this must read as a choice, not a fault.
    const wrapper = mountList([])

    expect(wrapper.find('[data-testid="question-empty"]').exists()).toBe(true)
  })
})
