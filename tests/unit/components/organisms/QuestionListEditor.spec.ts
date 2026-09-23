/**
 * QuestionListEditor — the extracted presentational core of
 * `ProjectQuestionsPanel` (framework-catalogue-authoring D11).
 *
 * `ProjectQuestionsPanel.spec.ts` is the pre-refactor baseline for every
 * behaviour this file exercises directly (competency-grouped list, dual-locale
 * fields, drag reorder, cap display, client + server validation) — it must
 * keep passing UNCHANGED once this component exists and the panel becomes a
 * thin container over it. This file tests the SAME behaviour at the level it
 * now actually lives at, so a regression here is caught before it reaches the
 * panel's black-box assertions.
 *
 * Deliberately NOT re-testing everything `ProjectQuestionsPanel.spec.ts`
 * already covers byte-for-byte (e.g. every server-error-mapping case): this
 * suite is the editor's own contract — no network, props in, events out — the
 * panel suite is the network wiring on top of it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { realI18n } from '../../support/i18n'
import type {
  QuestionEditorCompetency,
  QuestionEditorItem,
} from '../../../../app/types/question-editor'

const tMock = (key: string, params?: Record<string, unknown>) =>
  params ? `${key} ${JSON.stringify(params)}` : key

vi.stubGlobal('useI18n', () => realI18n())

const COMPETENCIES: QuestionEditorCompetency[] = [
  { id: 11, label: 'COL' },
  { id: 22, label: 'INN' },
]

function item(overrides: Partial<QuestionEditorItem> = {}): QuestionEditorItem {
  return {
    id: 1,
    competencyId: 11,
    text: { en: 'An existing question.', it: 'Una domanda esistente.' },
    ...overrides,
  }
}

async function mountEditor(
  props: Partial<{
    competencies: QuestionEditorCompetency[]
    questions: QuestionEditorItem[]
    unsavedCompetencyIds: number[]
    locale: string
    cap: number | null
    saving: boolean
    submitError: unknown | null
    readonly: boolean
  }> = {}
) {
  const { default: QuestionListEditor } =
    await import('../../../../app/components/organisms/QuestionListEditor.vue')

  return mount(QuestionListEditor, {
    props: {
      competencies: COMPETENCIES,
      questions: [],
      locale: 'en',
      cap: null,
      saving: false,
      submitError: null,
      ...props,
    },
    global: { mocks: { $t: tMock }, stubs: { ConfirmDialog: true } },
    attachTo: document.body,
  })
}

describe('QuestionListEditor', () => {
  beforeEach(() => {
    vi.stubGlobal('useI18n', () => realI18n())
    document.body.innerHTML = ''
  })

  it('renders one group per competency, questions or not', async () => {
    const wrapper = await mountEditor()

    expect(wrapper.find('[data-testid="question-group-11"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="question-group-22"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="question-add-11"]').exists()).toBe(true)
  })

  it('groups questions under the right competency', async () => {
    const wrapper = await mountEditor({
      questions: [item({ id: 1, competencyId: 11 }), item({ id: 2, competencyId: 22 })],
    })

    expect(
      wrapper
        .get('[data-testid="question-group-11"]')
        .find('[data-testid="question-row-1"]')
        .exists()
    ).toBe(true)
    expect(
      wrapper
        .get('[data-testid="question-group-22"]')
        .find('[data-testid="question-row-2"]')
        .exists()
    ).toBe(true)
  })

  it('opens the editor inside the group whose Add was pressed, with both locale fields', async () => {
    const wrapper = await mountEditor()

    await wrapper.find('[data-testid="question-add-22"]').trigger('click')

    const group = wrapper.get('[data-testid="question-group-22"]')

    expect(group.find('[data-testid="question-editor"]').exists()).toBe(true)
    // Dual-locale, always both, never one following the operator's locale.
    expect(wrapper.find('[data-testid="question-text-en"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="question-text-it"]').exists()).toBe(true)
  })

  it('emits reorder with the ids QuestionList sends', async () => {
    const wrapper = await mountEditor({
      questions: [item({ id: 1, competencyId: 11 }), item({ id: 2, competencyId: 11 })],
    })

    await wrapper.findComponent({ name: 'QuestionList' }).vm.$emit('reorder', [2, 1])

    expect(wrapper.emitted('reorder')).toEqual([[[2, 1]]])
  })

  it('opens a confirmation before emitting remove, then emits it once confirmed', async () => {
    const wrapper = await mountEditor({ questions: [item({ id: 7, competencyId: 11 })] })

    await wrapper.findComponent({ name: 'QuestionList' }).vm.$emit('remove', 7)

    expect(wrapper.emitted('remove')).toBeUndefined()

    await wrapper.findComponent({ name: 'ConfirmDialog' }).vm.$emit('confirm')

    expect(wrapper.emitted('remove')).toEqual([[7]])
  })

  describe('cap display', () => {
    it('disables Add once the group holds as many questions as the cap allows', async () => {
      const wrapper = await mountEditor({
        questions: [item({ id: 1, competencyId: 11 }), item({ id: 2, competencyId: 11 })],
        cap: 2,
      })

      const add = wrapper.get('[data-testid="question-add-11"]').element as HTMLButtonElement

      expect(add.disabled).toBe(true)
      expect(wrapper.get('[data-testid="question-cap-11"]').text()).toContain(
        'projectQuestions.atCap'
      )
    })

    it('leaves Add enabled when the cap is null (unknown, or genuinely unlimited)', async () => {
      const wrapper = await mountEditor({
        questions: [item({ id: 1, competencyId: 11 }), item({ id: 2, competencyId: 11 })],
        cap: null,
      })

      const add = wrapper.get('[data-testid="question-add-11"]').element as HTMLButtonElement

      expect(add.disabled).toBe(false)
      expect(wrapper.find('[data-testid="question-cap-11"]').exists()).toBe(false)
    })
  })

  describe('unsaved competency', () => {
    it('disables Add for a competency ticked but not yet saved, with an explanation', async () => {
      const wrapper = await mountEditor({ unsavedCompetencyIds: [11] })

      const add = wrapper.get('[data-testid="question-add-11"]').element as HTMLButtonElement

      expect(add.disabled).toBe(true)
      expect(wrapper.get('[data-testid="question-unsaved-11"]').text()).toContain(
        'projectQuestions.unsavedCompetency'
      )
    })

    it('leaves every OTHER competency unaffected', async () => {
      const wrapper = await mountEditor({ unsavedCompetencyIds: [11] })

      const add = wrapper.get('[data-testid="question-add-22"]').element as HTMLButtonElement

      expect(add.disabled).toBe(false)
      expect(wrapper.find('[data-testid="question-unsaved-22"]').exists()).toBe(false)
    })

    it('tells QuestionList when the group itself is unsaved, so the empty state does not overclaim', async () => {
      const wrapper = await mountEditor({ unsavedCompetencyIds: [11] })

      const group11List = wrapper
        .get('[data-testid="question-group-11"]')
        .findComponent({ name: 'QuestionList' })
      const group22List = wrapper
        .get('[data-testid="question-group-22"]')
        .findComponent({ name: 'QuestionList' })

      expect(group11List.props('unsaved')).toBe(true)
      expect(group22List.props('unsaved')).toBe(false)
    })

    it('behaves exactly as before when nothing is unsaved (default: no prop passed)', async () => {
      const wrapper = await mountEditor({
        questions: [item({ id: 1, competencyId: 11 }), item({ id: 2, competencyId: 11 })],
        cap: 2,
      })

      const add = wrapper.get('[data-testid="question-add-11"]').element as HTMLButtonElement

      expect(add.disabled).toBe(true)
      expect(wrapper.find('[data-testid="question-unsaved-11"]').exists()).toBe(false)
      expect(wrapper.get('[data-testid="question-cap-11"]').text()).toContain(
        'projectQuestions.atCap'
      )
    })
  })

  describe('submit', () => {
    it('requires the English text client-side and never emits submit for a blank one', async () => {
      const wrapper = await mountEditor()

      await wrapper.find('[data-testid="question-add-11"]').trigger('click')
      await wrapper.find('[data-testid="question-editor"]').trigger('submit')

      expect(wrapper.emitted('submit')).toBeUndefined()
      expect(wrapper.find('[data-testid="question-text-error"]').exists()).toBe(true)
    })

    it('emits submit with the competency whose Add was pressed', async () => {
      const wrapper = await mountEditor()

      await wrapper.find('[data-testid="question-add-22"]').trigger('click')
      await wrapper.find('[data-testid="question-text-en"]').setValue('Tell me about a launch.')
      await wrapper.find('[data-testid="question-editor"]').trigger('submit')

      expect(wrapper.emitted('submit')).toEqual([
        [{ id: null, competencyId: 22, text: { en: 'Tell me about a launch.' } }],
      ])
    })

    it('carries the Italian text only when it was written', async () => {
      const wrapper = await mountEditor()

      await wrapper.find('[data-testid="question-add-11"]').trigger('click')
      await wrapper.find('[data-testid="question-text-en"]').setValue('English only.')
      await wrapper.find('[data-testid="question-editor"]').trigger('submit')

      expect(wrapper.emitted('submit')?.[0]?.[0]).toEqual({
        id: null,
        competencyId: 11,
        text: { en: 'English only.' },
      })
    })

    it('maps a server field error onto its field via the submitError prop', async () => {
      const wrapper = await mountEditor()

      await wrapper.find('[data-testid="question-add-11"]').trigger('click')
      await wrapper.find('[data-testid="question-text-en"]').setValue('A question.')
      await wrapper.find('[data-testid="question-editor"]').trigger('submit')

      await wrapper.setProps({
        submitError: Object.assign(new Error('422'), {
          status: 422,
          data: { errors: { 'text.en': ['text_en_too_long'] } },
        }),
      })

      expect(wrapper.get('[data-testid="question-text-error"]').text()).toContain(
        'projectQuestions.serverError.text_en_too_long'
      )
    })

    it('emits the unmapped remainder of a server error, translated, for a container-owned banner', async () => {
      const wrapper = await mountEditor()

      await wrapper.find('[data-testid="question-add-11"]').trigger('click')
      await wrapper.find('[data-testid="question-text-en"]').setValue('A question.')
      await wrapper.find('[data-testid="question-editor"]').trigger('submit')

      await wrapper.setProps({
        // `ids` is not one of this editor's own fields (`text`/`text.it`/
        // `competency_id`) — a real code the mapper cannot place, exactly
        // like a server field this UI renders no control for.
        submitError: Object.assign(new Error('422'), {
          status: 422,
          data: { errors: { ids: ['ids_required'] } },
        }),
      })

      const emitted = wrapper.emitted('unmapped-error')

      expect(emitted?.at(-1)).toEqual([
        { kind: 'error', text: 'projectQuestions.serverError.ids_required' },
      ])
    })

    it('resolves a rejection with no field errors through the shared D4 state mapper', async () => {
      const wrapper = await mountEditor()

      await wrapper.find('[data-testid="question-add-11"]').trigger('click')
      await wrapper.find('[data-testid="question-text-en"]').setValue('A question.')
      await wrapper.find('[data-testid="question-editor"]').trigger('submit')

      await wrapper.setProps({
        submitError: Object.assign(new Error('network down'), { status: 0 }),
      })

      // No field-shaped body at all → the generic `error` state, same as
      // every other remote read in this app (error-state.ts), never the
      // action-specific copy — that distinction belongs to whichever
      // container names its own fallback.
      expect(wrapper.emitted('unmapped-error')?.at(-1)).toEqual([
        { kind: 'error', text: 'errors.states.error.message' },
      ])
    })

    it('renders a 409 as `waiting`, never as an error, distinct from a 403 or 404', async () => {
      const wrapper = await mountEditor()

      await wrapper.find('[data-testid="question-add-11"]').trigger('click')
      await wrapper.find('[data-testid="question-text-en"]').setValue('A question.')
      await wrapper.find('[data-testid="question-editor"]').trigger('submit')

      await wrapper.setProps({ submitError: Object.assign(new Error('409'), { status: 409 }) })

      expect(wrapper.emitted('unmapped-error')?.at(-1)).toEqual([
        { kind: 'waiting', text: 'errors.states.notReady.message' },
      ])

      await wrapper.setProps({ submitError: Object.assign(new Error('403'), { status: 403 }) })

      expect(wrapper.emitted('unmapped-error')?.at(-1)).toEqual([
        { kind: 'error', text: 'errors.states.forbidden.message' },
      ])
    })

    it('emits null once a fully-mapped error clears (e.g. the retry attempt starts)', async () => {
      const wrapper = await mountEditor({
        submitError: Object.assign(new Error('422'), {
          status: 422,
          data: { errors: { 'text.en': ['text_en_too_long'] } },
        }),
      })

      await wrapper.setProps({ submitError: null })

      expect(wrapper.emitted('unmapped-error')?.at(-1)).toEqual([null])
    })

    it('does not carry one competency’s error into another’s editor', async () => {
      const wrapper = await mountEditor()

      await wrapper.find('[data-testid="question-add-11"]').trigger('click')
      await wrapper.find('[data-testid="question-editor"]').trigger('submit')
      expect(wrapper.find('[data-testid="question-text-error"]').exists()).toBe(true)

      await wrapper.find('[data-testid="question-cancel"]').trigger('click')
      await wrapper.find('[data-testid="question-add-22"]').trigger('click')

      expect(wrapper.find('[data-testid="question-text-error"]').exists()).toBe(false)
    })
  })

  describe('exposed control', () => {
    it('startNew() opens the editor for the given competency; closeEditor() closes it', async () => {
      const wrapper = await mountEditor()

      await (wrapper.vm as unknown as { startNew: (id: number) => void }).startNew(22)
      await wrapper.vm.$nextTick()

      expect(
        wrapper
          .get('[data-testid="question-group-22"]')
          .find('[data-testid="question-editor"]')
          .exists()
      ).toBe(true)

      ;(wrapper.vm as unknown as { closeEditor: () => void }).closeEditor()
      await wrapper.vm.$nextTick()

      expect(wrapper.find('[data-testid="question-editor"]').exists()).toBe(false)
    })
  })
})

describe('QuestionListEditor — becoming read-only', () => {
  beforeEach(() => {
    vi.stubGlobal('useI18n', () => realI18n())
    document.body.innerHTML = ''
  })

  it('closes an editor that was open when the list turns read-only', async () => {
    // The catalogue page flips `readonly` in place when a draft is
    // published: an inline form left open would still save into a revision
    // that no longer accepts writes.
    const wrapper = await mountEditor({ questions: [item()] })

    await wrapper.get('[data-testid="question-edit-1"]').trigger('click')
    expect(wrapper.find('[data-testid="question-editor"]').exists()).toBe(true)

    await wrapper.setProps({ readonly: true })

    expect(wrapper.find('[data-testid="question-editor"]').exists()).toBe(false)

    // Nothing reopens it once the list is writable again.
    await wrapper.setProps({ readonly: false })

    expect(wrapper.find('[data-testid="question-editor"]').exists()).toBe(false)
  })
})
