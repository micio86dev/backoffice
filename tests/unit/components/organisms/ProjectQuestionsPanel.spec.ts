/**
 * ProjectQuestionsPanel — where an operator writes the questions the avatar
 * will actually ask.
 *
 * THE DEFECT THIS FILE WAS WRITTEN FOR. The editor rendered once, AFTER every
 * competency group, so pressing "Add" on the first of eight competencies
 * opened a form below all eight. From the operator's seat that is two separate
 * problems: nothing happens where they clicked (the form is off-screen until
 * they scroll), and once they find it, nothing on it says which competency they
 * are writing for. With eight groups on screen and one nameless form at the
 * bottom, the only way to be sure was to cancel and start again watching the
 * list.
 *
 * The panel had no tests at all, which is the other half of why it shipped
 * that way.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const tMock = (key: string, params?: Record<string, unknown>) =>
  params ? `${key} ${JSON.stringify(params)}` : key

const COMPETENCIES = [
  { id: 11, code: 'COL' },
  { id: 22, code: 'INN' },
]

function question(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    project_id: 5,
    competency_id: 11,
    text: { en: 'An existing question.', it: 'Una domanda esistente.' },
    position: 0,
    ...overrides,
  }
}

const fetchQuestions = vi.fn()
const createQuestion = vi.fn()
const updateQuestion = vi.fn()
const deleteQuestion = vi.fn()
const reorderQuestions = vi.fn()

vi.mock('../../../../app/composables/useProjectQuestions', () => ({
  useProjectQuestions: () => ({
    fetchQuestions,
    createQuestion,
    updateQuestion,
    deleteQuestion,
    reorderQuestions,
  }),
}))

async function mountPanel(questions: ReturnType<typeof question>[] = []) {
  fetchQuestions.mockResolvedValue({ data: questions })

  const { default: ProjectQuestionsPanel } =
    await import('../../../../app/components/organisms/ProjectQuestionsPanel.vue')

  const wrapper = mount(ProjectQuestionsPanel, {
    props: { projectId: 5, competencies: COMPETENCIES, locale: 'en' },
    global: { mocks: { $t: tMock }, stubs: { ConfirmDialog: true } },
    attachTo: document.body,
  })

  await flushPromises()

  return wrapper
}

describe('ProjectQuestionsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal(
      'useI18n',
      vi.fn(() => ({ t: tMock }))
    )
    document.body.innerHTML = ''
  })

  it('renders one group per project competency, questions or not', async () => {
    const wrapper = await mountPanel()

    expect(wrapper.find('[data-testid="question-add-11"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="question-add-22"]').exists()).toBe(true)
  })

  it('shows no editor until one is asked for', async () => {
    const wrapper = await mountPanel()

    expect(wrapper.find('[data-testid="question-editor"]').exists()).toBe(false)
  })

  describe('the editor belongs to a competency, visibly', () => {
    it('opens INSIDE the group whose Add was pressed, not at the foot of the panel', async () => {
      // The positional half of the fix, and the one that stops the operator
      // hunting: the form appears where they clicked. Asserted structurally —
      // the editor must be a DESCENDANT of that competency's group — because
      // "it renders somewhere on the page" was true of the broken version too.
      const wrapper = await mountPanel()

      await wrapper.find('[data-testid="question-add-22"]').trigger('click')

      const group = wrapper.find('[data-testid="question-group-22"]')

      expect(group.exists()).toBe(true)
      expect(group.find('[data-testid="question-editor"]').exists()).toBe(true)

      // And nowhere else. One draft, one editor.
      expect(wrapper.findAll('[data-testid="question-editor"]')).toHaveLength(1)
      expect(
        wrapper
          .find('[data-testid="question-group-11"]')
          .find('[data-testid="question-editor"]')
          .exists()
      ).toBe(false)
    })

    it('names the competency in the editor heading', async () => {
      // Position alone is not enough. A form that sits in the right place but
      // says nothing still asks the operator to infer what they are editing
      // from layout, and layout is exactly what they could not see before.
      const wrapper = await mountPanel()

      await wrapper.find('[data-testid="question-add-22"]').trigger('click')

      expect(wrapper.find('[data-testid="question-editor-title"]').text()).toContain('INN')
    })

    it('opens under the right competency when EDITING an existing question', async () => {
      // Editing enters through a different door — a row action rather than an
      // Add button — and it used to land in the same nameless form at the
      // bottom.
      const wrapper = await mountPanel([question({ id: 7, competency_id: 22 })])

      await wrapper.find('[data-testid="question-edit-7"]').trigger('click')

      expect(
        wrapper
          .find('[data-testid="question-group-22"]')
          .find('[data-testid="question-editor"]')
          .exists()
      ).toBe(true)
      expect(wrapper.find('[data-testid="question-editor-title"]').text()).toContain('INN')
    })

    it('withdraws that group’s Add button while its editor is open', async () => {
      // Pressing Add again would silently re-seed the draft and discard
      // whatever had been typed into it — a destructive no-op wearing the
      // label of the action that opened the form.
      const wrapper = await mountPanel()

      await wrapper.find('[data-testid="question-add-11"]').trigger('click')

      expect(wrapper.find('[data-testid="question-add-11"]').exists()).toBe(false)
      // The OTHER group keeps its Add: switching competencies mid-draft is a
      // legitimate thing to want, and it is the same single-draft swap that
      // has always happened.
      expect(wrapper.find('[data-testid="question-add-22"]').exists()).toBe(true)
    })

    it('brings the editor into view and puts the cursor in it', async () => {
      // The scroll was DEAD CODE: `ref` inside `v-for` compiles with `ref_for`,
      // so the value is an array, and the optional call on the method swallowed
      // the miss — the documented behaviour never ran once. Nothing caught it
      // because nothing tested it, and the comment excusing that blamed jsdom
      // for a missing API; the environment is happy-dom and has it.
      const scrollIntoView = vi.fn()
      Element.prototype.scrollIntoView = scrollIntoView

      const wrapper = await mountPanel()

      await wrapper.find('[data-testid="question-add-22"]').trigger('click')
      await flushPromises()

      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
      expect(document.activeElement).toBe(wrapper.get('[data-testid="question-text-en"]').element)
    })

    it('does not carry one competency’s error into another’s editor', async () => {
      // `errors` was cleared only on submit, so opening, closing or switching
      // drafts inherited them: a brand-new untouched editor for INN rendered
      // COL's message — and with a server refusal, "at most one question per
      // competency" stayed pinned under a competency that had none.
      const wrapper = await mountPanel()

      await wrapper.find('[data-testid="question-add-11"]').trigger('click')
      await wrapper.find('[data-testid="question-editor"]').trigger('submit')
      await flushPromises()
      expect(wrapper.find('[data-testid="question-text-error"]').exists()).toBe(true)

      await wrapper.find('[data-testid="question-cancel"]').trigger('click')
      await wrapper.find('[data-testid="question-add-22"]').trigger('click')
      await flushPromises()

      expect(wrapper.find('[data-testid="question-text-error"]').exists()).toBe(false)
    })

    it('closes on cancel, leaving the group intact', async () => {
      const wrapper = await mountPanel()

      await wrapper.find('[data-testid="question-add-11"]').trigger('click')
      await wrapper.find('[data-testid="question-cancel"]').trigger('click')

      expect(wrapper.find('[data-testid="question-editor"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="question-add-11"]').exists()).toBe(true)
    })
  })

  it('reordering one competency leaves the others on screen', async () => {
    // `QuestionList` renders per competency and emits ITS OWN ids. Rebuilding
    // the whole list from that subset erased every other group — permanently,
    // since the success path never reloads. Nothing caught it because
    // `reorderQuestions` was stubbed and never asserted, and there was no
    // reorder test at all.
    reorderQuestions.mockResolvedValue(undefined)

    const wrapper = await mountPanel([
      question({ id: 1, competency_id: 11, position: 0 }),
      question({ id: 2, competency_id: 11, position: 1 }),
      question({ id: 3, competency_id: 22, position: 0 }),
    ])

    expect(wrapper.find('[data-testid="question-row-3"]').exists()).toBe(true)

    // Competency 11 reorders its own two rows.
    await wrapper.findAllComponents({ name: 'QuestionList' })[0]?.vm.$emit('reorder', [2, 1])
    await flushPromises()

    // Guard against a vacuous pass: if the emit never reached the handler,
    // nothing below would be evidence of anything.
    expect(reorderQuestions).toHaveBeenCalledWith(5, [2, 1])

    // The OTHER competency's question is still rendered.
    expect(wrapper.find('[data-testid="question-row-3"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="question-row-1"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="question-row-2"]').exists()).toBe(true)
  })

  it('says the English question is required instead of silently doing nothing', async () => {
    // The form is `novalidate`, so `required` renders nothing native, and this
    // path used to just `return`: the operator pressed Save and nothing
    // happened at all — no message, no focus, no way to find out why.
    const wrapper = await mountPanel()

    await wrapper.find('[data-testid="question-add-11"]').trigger('click')
    await wrapper.find('[data-testid="question-editor"]').trigger('submit')
    await flushPromises()

    expect(createQuestion).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="question-text-error"]').exists()).toBe(true)
  })

  it('saves a new question against the competency whose Add was pressed', async () => {
    // The whole point of the grouping: the competency is decided by WHERE the
    // operator clicked, so the save must carry that id and no other.
    createQuestion.mockResolvedValue({ data: question({ id: 9, competency_id: 22 }) })

    const wrapper = await mountPanel()

    await wrapper.find('[data-testid="question-add-22"]').trigger('click')
    await wrapper.find('[data-testid="question-text-en"]').setValue('Tell me about a launch.')
    await wrapper.find('[data-testid="question-editor"]').trigger('submit')
    await flushPromises()

    expect(createQuestion).toHaveBeenCalledWith(5, expect.objectContaining({ competency_id: 22 }))
  })
})
