/**
 * CatalogueDefaultQuestionsPanel — the catalogue's own default questions
 * (catalogue-authoring spec), authored per competency in the currently open
 * draft revision.
 *
 * A thin container over `QuestionListEditor`, same shape as
 * `ProjectQuestionsPanel.spec.ts` — this file proves the CATALOGUE-specific
 * differences the generated client actually imposes (position on create, no
 * bulk reorder endpoint, no per-competency cap) rather than re-testing
 * behaviour `QuestionListEditor.spec.ts` already owns.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { realI18n } from '../../support/i18n'

const tMock = (key: string, params?: Record<string, unknown>) =>
  params ? `${key} ${JSON.stringify(params)}` : key

vi.stubGlobal('useI18n', () => realI18n())

const COMPETENCIES = [
  { id: 11, code: 'COL', revision_id: 1, type: 'standard', name: {}, definition: {} },
  { id: 22, code: 'INN', revision_id: 1, type: 'standard', name: {}, definition: {} },
]

function defaultQuestion(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    revision_id: 1,
    competency_id: 11,
    position: 0,
    text: { en: 'An existing default.', it: 'Un default esistente.' },
    ...overrides,
  }
}

const listCompetencies = vi.fn()
const fetchDefaultQuestions = vi.fn()
const createDefaultQuestion = vi.fn()
const updateDefaultQuestion = vi.fn()
const deleteDefaultQuestion = vi.fn()

vi.mock('../../../../app/composables/useCatalogue', () => ({
  useCatalogue: () => ({ listCompetencies }),
}))

vi.mock('../../../../app/composables/useCatalogueDefaultQuestions', () => ({
  useCatalogueDefaultQuestions: () => ({
    fetchDefaultQuestions,
    createDefaultQuestion,
    updateDefaultQuestion,
    deleteDefaultQuestion,
  }),
}))

async function mountPanel(questions: ReturnType<typeof defaultQuestion>[] = []) {
  listCompetencies.mockResolvedValue({ data: COMPETENCIES })
  fetchDefaultQuestions.mockResolvedValue({ data: questions })

  const { default: CatalogueDefaultQuestionsPanel } =
    await import('../../../../app/components/organisms/CatalogueDefaultQuestionsPanel.vue')

  const wrapper = mount(CatalogueDefaultQuestionsPanel, {
    props: { editable: true },
    global: { mocks: { $t: tMock }, stubs: { ConfirmDialog: true } },
    attachTo: document.body,
  })

  await flushPromises()

  return wrapper
}

describe('CatalogueDefaultQuestionsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('useI18n', () => realI18n())
    document.body.innerHTML = ''
  })

  it('renders one group per catalogue competency', async () => {
    const wrapper = await mountPanel()

    expect(wrapper.find('[data-testid="question-add-11"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="question-add-22"]').exists()).toBe(true)
  })

  it('has no per-competency cap — Add is never disabled by count', async () => {
    const filled = [0, 1, 2, 3, 4].map((i) =>
      defaultQuestion({ id: i + 1, competency_id: 11, position: i })
    )
    const wrapper = await mountPanel(filled)

    expect(
      (wrapper.get('[data-testid="question-add-11"]').element as HTMLButtonElement).disabled
    ).toBe(false)
    expect(wrapper.find('[data-testid="question-cap-11"]').exists()).toBe(false)
  })

  it('creates a default question WITH a computed position, appended to its group', async () => {
    createDefaultQuestion.mockResolvedValue({ data: defaultQuestion({ id: 9, competency_id: 22 }) })

    const wrapper = await mountPanel([defaultQuestion({ id: 1, competency_id: 22, position: 0 })])

    await wrapper.find('[data-testid="question-add-22"]').trigger('click')
    await wrapper.find('[data-testid="question-text-en"]').setValue('A new default.')
    await wrapper.find('[data-testid="question-editor"]').trigger('submit')
    await flushPromises()

    expect(createDefaultQuestion).toHaveBeenCalledWith(
      expect.objectContaining({ competency_id: 22, position: 1 })
    )
  })

  it('sends `it` as an empty string rather than omitting it — the server requires both locales', async () => {
    // StoreDefaultQuestionRequest requires text.en AND text.it (unlike a
    // project question's it-optional shape). QuestionListEditor's own
    // client-side check only enforces `en`, so a blank Italian field must
    // still reach the server as `it: ''` rather than being dropped from the
    // payload — an ABSENT key and an EMPTY string are different requests,
    // and only the second is a shape the generated client (and the server)
    // actually accept.
    createDefaultQuestion.mockResolvedValue({ data: defaultQuestion({ id: 9, competency_id: 11 }) })

    const wrapper = await mountPanel()

    await wrapper.find('[data-testid="question-add-11"]').trigger('click')
    await wrapper.find('[data-testid="question-text-en"]').setValue('English only.')
    await wrapper.find('[data-testid="question-editor"]').trigger('submit')
    await flushPromises()

    expect(createDefaultQuestion).toHaveBeenCalledWith(
      expect.objectContaining({ text: { en: 'English only.', it: '' } })
    )
  })

  it('maps a text.it refusal from a blank Italian onto the Italian field', async () => {
    createDefaultQuestion.mockRejectedValueOnce(
      Object.assign(new Error('422'), {
        status: 422,
        data: { errors: { 'text.it': ['text_it_invalid'] } },
      })
    )

    const wrapper = await mountPanel()

    await wrapper.get('[data-testid="question-add-11"]').trigger('click')
    await wrapper.get('[data-testid="question-text-en"]').setValue('English only.')
    await wrapper.get('[data-testid="question-editor"]').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-testid="question-text-it-error"]').text()).toContain(
      'projectQuestions.serverError.text_it_invalid'
    )
  })

  it('reorders via individual PATCH calls carrying the new position, not a bulk order call', async () => {
    updateDefaultQuestion.mockResolvedValue({ data: defaultQuestion() })

    const wrapper = await mountPanel([
      defaultQuestion({ id: 1, competency_id: 11, position: 0 }),
      defaultQuestion({ id: 2, competency_id: 11, position: 1 }),
    ])

    await wrapper.findAllComponents({ name: 'QuestionList' })[0]?.vm.$emit('reorder', [2, 1])
    await flushPromises()

    expect(updateDefaultQuestion).toHaveBeenCalledWith(2, { position: 0 })
    expect(updateDefaultQuestion).toHaveBeenCalledWith(1, { position: 1 })
  })

  it('calls those PATCHes sequentially, never in parallel — the position pair is a DB-unique slot', async () => {
    const order: number[] = []

    updateDefaultQuestion.mockImplementation(async (id: number) => {
      order.push(id)
      await Promise.resolve()

      return { data: defaultQuestion({ id }) }
    })

    const wrapper = await mountPanel([
      defaultQuestion({ id: 1, competency_id: 11, position: 0 }),
      defaultQuestion({ id: 2, competency_id: 11, position: 1 }),
    ])

    await wrapper.findAllComponents({ name: 'QuestionList' })[0]?.vm.$emit('reorder', [2, 1])
    await flushPromises()

    // Two phases, each strictly sequential: every changing row is parked at
    // a temporary position first (2, then 1), THEN placed at its real final
    // position (2, then 1 again) — never both rows before either settles,
    // which is what a `Promise.all` batch would produce instead.
    expect(order).toEqual([2, 1, 2, 1])
  })

  it('swaps two rows without ever sending a position another row in the group still holds', async () => {
    // Simulates the REAL server rule (`UpdateDefaultQuestionRequest.php`):
    // `position` must be unique within `(revision_id, competency_id)` at
    // the instant of the request — not deferred to commit. A same-
    // competency swap sent as two ordinary PATCHes fails outright on the
    // first one, because the other row still holds the slot being asked
    // for. This is the exact gga review finding the two-phase
    // temporary-position dance exists to avoid.
    const held = new Map<number, number>([
      [1, 0],
      [2, 1],
    ])

    updateDefaultQuestion.mockImplementation(async (id: number, payload: { position: number }) => {
      const collidesWithAnotherRow = [...held.entries()].some(
        ([otherId, otherPosition]) => otherId !== id && otherPosition === payload.position
      )

      if (collidesWithAnotherRow) throw Object.assign(new Error('422'), { status: 422 })

      held.set(id, payload.position)

      return { data: defaultQuestion({ id }) }
    })

    const wrapper = await mountPanel([
      defaultQuestion({ id: 1, competency_id: 11, position: 0 }),
      defaultQuestion({ id: 2, competency_id: 11, position: 1 }),
    ])

    await wrapper.findAllComponents({ name: 'QuestionList' })[0]?.vm.$emit('reorder', [2, 1])
    await flushPromises()

    // No banner — the swap actually succeeded, never refused mid-flight.
    expect(wrapper.find('[data-testid="catalogue-default-questions-banner"]').exists()).toBe(false)
  })

  it('bases the temporary parking slot on the group’s own current highest position, not a fixed constant', async () => {
    // A previous reorder that failed PARTWAY can leave a row stranded at a
    // temporary position — the API places no upper bound on `position`, so
    // that value survives a reload. A fixed parking constant risks landing
    // on exactly that leftover; deriving it from `max(position) + 1` cannot,
    // because it is always strictly above whatever the group currently
    // holds, stray row included.
    const held = new Map<number, number>([
      [1, 0],
      [2, 1],
      // The stray leftover — already occupies the fixed constant an
      // earlier, non-derived implementation would have reused.
      [3, 1_000_000],
    ])

    updateDefaultQuestion.mockImplementation(async (id: number, payload: { position: number }) => {
      const collidesWithAnotherRow = [...held.entries()].some(
        ([otherId, otherPosition]) => otherId !== id && otherPosition === payload.position
      )

      if (collidesWithAnotherRow) throw Object.assign(new Error('422'), { status: 422 })

      held.set(id, payload.position)

      return { data: defaultQuestion({ id }) }
    })

    const wrapper = await mountPanel([
      defaultQuestion({ id: 1, competency_id: 11, position: 0 }),
      defaultQuestion({ id: 2, competency_id: 11, position: 1 }),
      defaultQuestion({ id: 3, competency_id: 11, position: 1_000_000 }),
    ])

    await wrapper.findAllComponents({ name: 'QuestionList' })[0]?.vm.$emit('reorder', [2, 1, 3])
    await flushPromises()

    expect(wrapper.find('[data-testid="catalogue-default-questions-banner"]').exists()).toBe(false)
  })

  it('reflects a reorder in the local list after success, so reversing it sends fresh PATCHes', async () => {
    // gga review finding: without reloading after success, the two rows kept
    // their PRE-reorder `position` in memory forever, so dragging back to
    // the original order compared each id against its STALE position,
    // computed "nothing changed", and silently sent zero PATCHes — the
    // screen and the server disagreed with no error at all.
    updateDefaultQuestion.mockResolvedValue({ data: defaultQuestion() })

    const wrapper = await mountPanel([
      defaultQuestion({ id: 1, competency_id: 11, position: 0 }),
      defaultQuestion({ id: 2, competency_id: 11, position: 1 }),
    ])

    // The reload after a successful reorder must reflect the NEW positions —
    // otherwise reversing the drag below would (again) compute no changes.
    fetchDefaultQuestions.mockResolvedValue({
      data: [
        defaultQuestion({ id: 2, competency_id: 11, position: 0 }),
        defaultQuestion({ id: 1, competency_id: 11, position: 1 }),
      ],
    })

    await wrapper.findAllComponents({ name: 'QuestionList' })[0]?.vm.$emit('reorder', [2, 1])
    await flushPromises()

    updateDefaultQuestion.mockClear()

    // Reversed back to the original order.
    await wrapper.findAllComponents({ name: 'QuestionList' })[0]?.vm.$emit('reorder', [1, 2])
    await flushPromises()

    expect(updateDefaultQuestion).toHaveBeenCalledWith(1, { position: 0 })
    expect(updateDefaultQuestion).toHaveBeenCalledWith(2, { position: 1 })
  })

  it('computes a new default’s position from max(position) + 1, never the group’s row count', async () => {
    // A count-based position collides the moment a delete has left a gap:
    // two rows at positions [0, 2] have a COUNT of 2, and `position: 2`
    // would collide with the survivor already sitting there.
    createDefaultQuestion.mockResolvedValue({ data: defaultQuestion({ id: 9, competency_id: 11 }) })

    const wrapper = await mountPanel([
      defaultQuestion({ id: 1, competency_id: 11, position: 0 }),
      defaultQuestion({ id: 3, competency_id: 11, position: 2 }),
    ])

    await wrapper.find('[data-testid="question-add-11"]').trigger('click')
    await wrapper.find('[data-testid="question-text-en"]').setValue('A third default.')
    await wrapper.find('[data-testid="question-editor"]').trigger('submit')
    await flushPromises()

    expect(createDefaultQuestion).toHaveBeenCalledWith(expect.objectContaining({ position: 3 }))
  })

  it('removes a default question once QuestionListEditor confirms it', async () => {
    deleteDefaultQuestion.mockResolvedValue(undefined)

    const wrapper = await mountPanel([defaultQuestion({ id: 7, competency_id: 11 })])

    await wrapper.findComponent({ name: 'QuestionListEditor' }).vm.$emit('remove', 7)
    await flushPromises()

    expect(deleteDefaultQuestion).toHaveBeenCalledWith(7)
    expect(wrapper.find('[data-testid="question-row-7"]').exists()).toBe(false)
  })

  it('reports a failed remove instead of silently leaving the row', async () => {
    deleteDefaultQuestion.mockRejectedValueOnce(new Error('500'))

    const wrapper = await mountPanel([defaultQuestion({ id: 7, competency_id: 11 })])

    await wrapper.findComponent({ name: 'QuestionListEditor' }).vm.$emit('remove', 7)
    await flushPromises()

    expect(wrapper.get('[data-testid="catalogue-default-questions-banner"]').text()).toContain(
      'catalogue.defaultQuestions.removeError'
    )
    expect(wrapper.find('[data-testid="question-row-7"]').exists()).toBe(true)
  })

  it('reloads from the server after a partial reorder failure, rather than trusting a local rollback', async () => {
    updateDefaultQuestion.mockRejectedValueOnce(new Error('500'))

    const wrapper = await mountPanel([
      defaultQuestion({ id: 1, competency_id: 11, position: 0 }),
      defaultQuestion({ id: 2, competency_id: 11, position: 1 }),
    ])

    fetchDefaultQuestions.mockClear()

    await wrapper.findAllComponents({ name: 'QuestionList' })[0]?.vm.$emit('reorder', [2, 1])
    await flushPromises()

    expect(wrapper.get('[data-testid="catalogue-default-questions-banner"]').text()).toContain(
      'catalogue.defaultQuestions.reorderError'
    )
    // Reloaded from the server, not a locally-guessed rollback — see the
    // component's own docblock on why a partial PATCH batch makes a blind
    // local revert unsafe.
    expect(listCompetencies).toHaveBeenCalled()
    expect(fetchDefaultQuestions).toHaveBeenCalled()
  })

  it('saves an edit through updateDefaultQuestion, carrying no position', async () => {
    updateDefaultQuestion.mockResolvedValue({
      data: defaultQuestion({ id: 7, competency_id: 11, text: { en: 'Edited.' } }),
    })

    const wrapper = await mountPanel([defaultQuestion({ id: 7, competency_id: 11 })])

    await wrapper.find('[data-testid="question-edit-7"]').trigger('click')
    await wrapper.find('[data-testid="question-text-en"]').setValue('Edited.')
    await wrapper.find('[data-testid="question-editor"]').trigger('submit')
    await flushPromises()

    // Both fields resubmit, not only the changed one — the editor always
    // carries the full draft, matching ProjectQuestionsPanel's identical
    // edit behaviour (QuestionListEditor.spec.ts owns that contract).
    expect(updateDefaultQuestion).toHaveBeenCalledWith(7, {
      text: { en: 'Edited.', it: 'Un default esistente.' },
    })
    expect(wrapper.find('[data-testid="question-editor"]').exists()).toBe(false)
  })

  it('sends `it` as an empty string on edit too, never omitted', async () => {
    // `UpdateDefaultQuestionRequest` marks `text.it` `required_with:text` —
    // whenever `text` is present at all (always, on this editor's submit),
    // `it` must be too. Clearing the Italian field and saving must still
    // reach the server as `it: ''`, matching the create path's own fix.
    updateDefaultQuestion.mockResolvedValue({
      data: defaultQuestion({ id: 7, competency_id: 11, text: { en: 'English only.' } }),
    })

    const wrapper = await mountPanel([defaultQuestion({ id: 7, competency_id: 11 })])

    await wrapper.find('[data-testid="question-edit-7"]').trigger('click')
    await wrapper.find('[data-testid="question-text-it"]').setValue('')
    await wrapper.find('[data-testid="question-editor"]').trigger('submit')
    await flushPromises()

    expect(updateDefaultQuestion).toHaveBeenCalledWith(7, {
      text: { en: 'An existing default.', it: '' },
    })
  })

  it('surfaces a create failure through the submitError channel, mapped to the banner', async () => {
    createDefaultQuestion.mockRejectedValueOnce(Object.assign(new Error('403'), { status: 403 }))

    const wrapper = await mountPanel()

    await wrapper.get('[data-testid="question-add-11"]').trigger('click')
    await wrapper.get('[data-testid="question-text-en"]').setValue('A default.')
    await wrapper.get('[data-testid="question-editor"]').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-testid="catalogue-default-questions-banner"]').text()).toContain(
      'errors.states.forbidden.message'
    )
  })

  it('shows a load failure through the same banner every remote read in this app uses', async () => {
    listCompetencies.mockReset().mockRejectedValue(Object.assign(new Error('403'), { status: 403 }))
    fetchDefaultQuestions.mockResolvedValue({ data: [] })

    const { default: CatalogueDefaultQuestionsPanel } =
      await import('../../../../app/components/organisms/CatalogueDefaultQuestionsPanel.vue')

    const wrapper = mount(CatalogueDefaultQuestionsPanel, {
      props: { editable: true },
      global: { mocks: { $t: tMock }, stubs: { ConfirmDialog: true } },
      attachTo: document.body,
    })
    await flushPromises()

    expect(wrapper.get('[data-testid="catalogue-default-questions-banner"]').text()).toContain(
      'forbidden'
    )
  })

  it('emits refresh-revision after a successful create — a write can auto-open a draft', async () => {
    createDefaultQuestion.mockResolvedValue({ data: defaultQuestion({ id: 9, competency_id: 22 }) })

    const wrapper = await mountPanel([defaultQuestion({ id: 1, competency_id: 22, position: 0 })])

    await wrapper.find('[data-testid="question-add-22"]').trigger('click')
    await wrapper.find('[data-testid="question-text-en"]').setValue('A new default.')
    await wrapper.find('[data-testid="question-editor"]').trigger('submit')
    await flushPromises()

    expect(wrapper.emitted('refresh-revision')).toBeTruthy()
  })

  it('emits refresh-revision after a successful edit', async () => {
    updateDefaultQuestion.mockResolvedValue({
      data: defaultQuestion({ id: 7, competency_id: 11, text: { en: 'Edited.' } }),
    })

    const wrapper = await mountPanel([defaultQuestion({ id: 7, competency_id: 11 })])

    await wrapper.find('[data-testid="question-edit-7"]').trigger('click')
    await wrapper.find('[data-testid="question-text-en"]').setValue('Edited.')
    await wrapper.find('[data-testid="question-editor"]').trigger('submit')
    await flushPromises()

    expect(wrapper.emitted('refresh-revision')).toBeTruthy()
  })

  it('emits refresh-revision after a successful remove', async () => {
    deleteDefaultQuestion.mockResolvedValue(undefined)

    const wrapper = await mountPanel([defaultQuestion({ id: 7, competency_id: 11 })])

    await wrapper.findComponent({ name: 'QuestionListEditor' }).vm.$emit('remove', 7)
    await flushPromises()

    expect(wrapper.emitted('refresh-revision')).toBeTruthy()
  })

  it('emits refresh-revision after a successful reorder', async () => {
    updateDefaultQuestion.mockResolvedValue({ data: defaultQuestion() })

    const wrapper = await mountPanel([
      defaultQuestion({ id: 1, competency_id: 11, position: 0 }),
      defaultQuestion({ id: 2, competency_id: 11, position: 1 }),
    ])

    await wrapper.findAllComponents({ name: 'QuestionList' })[0]?.vm.$emit('reorder', [2, 1])
    await flushPromises()

    expect(wrapper.emitted('refresh-revision')).toBeTruthy()
  })

  it('never emits refresh-revision on a failed write', async () => {
    createDefaultQuestion.mockRejectedValueOnce(Object.assign(new Error('403'), { status: 403 }))

    const wrapper = await mountPanel()

    await wrapper.get('[data-testid="question-add-11"]').trigger('click')
    await wrapper.get('[data-testid="question-text-en"]').setValue('A default.')
    await wrapper.get('[data-testid="question-editor"]').trigger('submit')
    await flushPromises()

    expect(wrapper.emitted('refresh-revision')).toBeFalsy()
  })

  it('does not claim the catalogue has no competencies when the load itself failed', async () => {
    // R3-default-questions-load-failure-claims-empty: `competencies` stays
    // empty on a rejected load (nothing ever populates it), so the "no
    // competencies" placeholder rendered right alongside the D4 error
    // banner — telling the operator both "something went wrong" and
    // "there is nothing here" for the exact same failure.
    listCompetencies.mockReset().mockRejectedValue(Object.assign(new Error('500'), { status: 500 }))
    fetchDefaultQuestions.mockResolvedValue({ data: [] })

    const { default: CatalogueDefaultQuestionsPanel } =
      await import('../../../../app/components/organisms/CatalogueDefaultQuestionsPanel.vue')

    const wrapper = mount(CatalogueDefaultQuestionsPanel, {
      props: { editable: true },
      global: { mocks: { $t: tMock }, stubs: { ConfirmDialog: true } },
      attachTo: document.body,
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="catalogue-default-questions-banner"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="catalogue-default-questions-none"]').exists()).toBe(false)
  })

  it('shows a placeholder when the open revision has no competencies yet', async () => {
    listCompetencies.mockResolvedValue({ data: [] })
    fetchDefaultQuestions.mockResolvedValue({ data: [] })

    const { default: CatalogueDefaultQuestionsPanel } =
      await import('../../../../app/components/organisms/CatalogueDefaultQuestionsPanel.vue')

    const wrapper = mount(CatalogueDefaultQuestionsPanel, {
      props: { editable: true },
      global: { mocks: { $t: tMock }, stubs: { ConfirmDialog: true } },
      attachTo: document.body,
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="catalogue-default-questions-none"]').exists()).toBe(true)
  })
})

describe('CatalogueDefaultQuestionsPanel — read-only (published revision)', () => {
  it('lists the questions but offers no add, edit, reorder or remove control', async () => {
    listCompetencies.mockResolvedValue({ data: COMPETENCIES })
    fetchDefaultQuestions.mockResolvedValue({
      data: [
        defaultQuestion({ id: 1, position: 0 }),
        defaultQuestion({ id: 2, position: 1, text: { en: 'Second.', it: 'Seconda.' } }),
      ],
    })

    const { default: CatalogueDefaultQuestionsPanel } =
      await import('../../../../app/components/organisms/CatalogueDefaultQuestionsPanel.vue')

    const wrapper = mount(CatalogueDefaultQuestionsPanel, {
      props: { editable: false },
      global: { mocks: { $t: tMock }, stubs: { ConfirmDialog: true } },
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="question-row-1"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="question-row-2"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="question-add-11"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="question-edit-1"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="question-remove-1"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="question-up-2"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="question-grip-1"]').exists()).toBe(false)
  })
})
