/**
 * InterviewClosingPhraseForm — the farewell spoken after the last question.
 *
 * Thin wrapper over the shared phrase form: these tests pin only what makes it
 * the CLOSING greeting — its field, its message namespace, its test ids and
 * that it saves through `updateInterviewClosingPhrase` alone.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

const tMock = (key: string, params?: Record<string, unknown>) =>
  params ? `${key}:${JSON.stringify(params)}` : key

const updateInterviewClosingPhrase = vi.fn()
const updateInterviewIntroPhrase = vi.fn()

vi.mock('../../../../app/composables/usePlatformSettings', () => ({
  usePlatformSettings: () => ({ updateInterviewClosingPhrase, updateInterviewIntroPhrase }),
}))

const ConfirmDialogStub = defineComponent({
  props: { open: Boolean },
  emits: ['confirm', 'cancel'],
  setup(props, { emit }) {
    return () =>
      props.open
        ? h('button', { 'data-testid': 'confirm-stub-confirm', onClick: () => emit('confirm') })
        : null
  },
})

async function mountForm(initial: { en?: string; it?: string } | null = null) {
  const { default: Form } =
    await import('../../../../app/components/organisms/InterviewClosingPhraseForm.vue')
  const wrapper = mount(Form, {
    props: { initial, loaded: true },
    global: { mocks: { $t: tMock }, stubs: { ConfirmDialog: ConfirmDialogStub } },
  })
  await flushPromises()
  return wrapper
}

type W = Awaited<ReturnType<typeof mountForm>>
const en = (w: W) => w.get('[data-testid="closing-phrase-en"]')
const it_ = (w: W) => w.get('[data-testid="closing-phrase-it"]')
const submit = async (w: W) => {
  await w.get('[data-testid="closing-phrase-form"]').trigger('submit')
  await flushPromises()
}

describe('InterviewClosingPhraseForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal(
      'useI18n',
      vi.fn(() => ({ t: tMock }))
    )
    updateInterviewClosingPhrase.mockResolvedValue({
      data: { interview_closing_phrase: { en: 'Thanks', it: 'Grazie' } },
    })
  })

  it('shows the stored closing greeting and the closing copy', async () => {
    const w = await mountForm({ en: 'Thanks for coming', it: 'Grazie di essere venuto' })

    expect((en(w).element as HTMLTextAreaElement).value).toBe('Thanks for coming')
    expect((it_(w).element as HTMLTextAreaElement).value).toBe('Grazie di essere venuto')
    expect(w.text()).toContain('settings.platform.closingPhrase.title')
    expect(w.get('[data-testid="closing-phrase-en-counter"]').text()).toContain('"max":3600')
  })

  it.each([
    ['null when both are blank', '   ', '', null],
    ['{en} when Italian is blank', ' Thanks ', '', { en: 'Thanks' }],
    ['{en, it} when both are filled', 'Thanks', 'Grazie', { en: 'Thanks', it: 'Grazie' }],
  ])('PATCHes %s through the closing setter only', async (_name, enText, itText, expected) => {
    const w = await mountForm({ en: 'old' })

    await en(w).setValue(enText)
    await it_(w).setValue(itText)
    await submit(w)

    expect(updateInterviewClosingPhrase).toHaveBeenCalledWith(expected)
    expect(updateInterviewIntroPhrase).not.toHaveBeenCalled()
    expect(w.get('[data-testid="closing-phrase-banner"]').text()).toBe(
      'settings.platform.closingPhrase.saved'
    )
    expect(w.emitted('saved')).toHaveLength(1)
  })

  it('requires English when only Italian is filled and blocks over 3600', async () => {
    const w = await mountForm(null)

    await it_(w).setValue('Grazie')
    await submit(w)
    expect(w.get('[data-testid="closing-phrase-en-error"]').text()).toBe(
      'settings.platform.closingPhrase.enRequired'
    )

    await en(w).setValue('a'.repeat(3601))
    await submit(w)
    expect(w.get('[data-testid="closing-phrase-en-error"]').text()).toContain('tooLong')
    expect(updateInterviewClosingPhrase).not.toHaveBeenCalled()
  })

  it('maps the server end-phrase refusal onto the locale it names', async () => {
    updateInterviewClosingPhrase.mockRejectedValue(
      Object.assign(new Error('HTTP 422'), {
        status: 422,
        data: { errors: { 'interview_closing_phrase.en': ['Do not use the end phrase.'] } },
      })
    )
    const w = await mountForm(null)

    await en(w).setValue("Let's move on to the next question.")
    await submit(w)

    expect(w.get('[data-testid="closing-phrase-en-error"]').text()).toBe(
      'Do not use the end phrase.'
    )
    expect(w.find('[data-testid="closing-phrase-banner"]').exists()).toBe(false)
  })

  it('clears with a confirmation and sends null', async () => {
    updateInterviewClosingPhrase.mockResolvedValue({ data: { interview_closing_phrase: null } })
    const w = await mountForm({ en: 'Thanks' })

    await w.get('[data-testid="closing-phrase-clear"]').trigger('click')
    expect(updateInterviewClosingPhrase).not.toHaveBeenCalled()
    await w.get('[data-testid="confirm-stub-confirm"]').trigger('click')
    await flushPromises()

    expect(updateInterviewClosingPhrase).toHaveBeenCalledWith(null)
    expect((en(w).element as HTMLTextAreaElement).value).toBe('')
    expect(w.get('[data-testid="closing-phrase-banner"]').text()).toBe(
      'settings.platform.closingPhrase.cleared'
    )
  })
})
