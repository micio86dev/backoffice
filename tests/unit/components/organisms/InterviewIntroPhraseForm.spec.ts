/**
 * InterviewIntroPhraseForm — the spoken introduction, one textarea per locale.
 *
 * The intro counts against the interview time limit, so the form shows how
 * long it will take to say and refuses a text the API would refuse anyway.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

const tMock = (key: string, params?: Record<string, unknown>) =>
  params ? `${key}:${JSON.stringify(params)}` : key

const updateInterviewIntroPhrase = vi.fn()

vi.mock('../../../../app/composables/usePlatformSettings', () => ({
  usePlatformSettings: () => ({ updateInterviewIntroPhrase }),
}))

// ConfirmDialog renders through a portal; a stub keeps the contract (open in,
// confirm/cancel out) without reka-ui in the way.
const ConfirmDialogStub = defineComponent({
  props: { open: Boolean },
  emits: ['confirm', 'cancel'],
  setup(props, { emit }) {
    return () =>
      props.open
        ? h('div', { 'data-testid': 'confirm-stub' }, [
            h('button', { 'data-testid': 'confirm-stub-confirm', onClick: () => emit('confirm') }),
            h('button', { 'data-testid': 'confirm-stub-cancel', onClick: () => emit('cancel') }),
          ])
        : null
  },
})

type Initial = { en?: string; it?: string } | null

async function mountForm(initial: Initial = null, loaded = true) {
  const { default: Form } =
    await import('../../../../app/components/organisms/InterviewIntroPhraseForm.vue')
  const wrapper = mount(Form, {
    props: { initial, loaded },
    global: { mocks: { $t: tMock }, stubs: { ConfirmDialog: ConfirmDialogStub } },
  })
  await flushPromises()
  return wrapper
}

const en = (w: Awaited<ReturnType<typeof mountForm>>) => w.get('[data-testid="intro-phrase-en"]')
const it_ = (w: Awaited<ReturnType<typeof mountForm>>) => w.get('[data-testid="intro-phrase-it"]')
const submit = async (w: Awaited<ReturnType<typeof mountForm>>) => {
  await w.get('[data-testid="intro-phrase-form"]').trigger('submit')
  await flushPromises()
}

function refusal(errors: Record<string, string[]>) {
  return Object.assign(new Error('HTTP 422'), { status: 422, data: { errors } })
}

describe('InterviewIntroPhraseForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal(
      'useI18n',
      vi.fn(() => ({ t: tMock }))
    )
    updateInterviewIntroPhrase.mockResolvedValue({
      data: { interview_intro_phrase: { en: 'Hello', it: 'Ciao' } },
    })
  })

  it('shows the stored map in both textareas', async () => {
    const w = await mountForm({ en: 'Hello there', it: 'Ciao a tutti' })

    expect((en(w).element as HTMLTextAreaElement).value).toBe('Hello there')
    expect((it_(w).element as HTMLTextAreaElement).value).toBe('Ciao a tutti')
  })

  it('shows empty textareas when nothing is stored', async () => {
    const w = await mountForm(null)

    expect((en(w).element as HTMLTextAreaElement).value).toBe('')
    expect((it_(w).element as HTMLTextAreaElement).value).toBe('')
  })

  it('tolerates a stored map with only one locale', async () => {
    const w = await mountForm({ en: 'Hello' })

    expect((it_(w).element as HTMLTextAreaElement).value).toBe('')
  })

  it('re-seeds when the stored value arrives after mount', async () => {
    const w = await mountForm(null, false)

    await w.setProps({ initial: { en: 'Late', it: 'Tardi' }, loaded: true })

    expect((en(w).element as HTMLTextAreaElement).value).toBe('Late')
  })

  it('counts characters and estimates the spoken time per locale', async () => {
    const w = await mountForm(null)

    await en(w).setValue('a'.repeat(31))

    expect(w.get('[data-testid="intro-phrase-en-counter"]').text()).toContain('"count":31')
    // 31 characters at ~15 per second is 2.07 s, rounded UP to 3.
    expect(w.get('[data-testid="intro-phrase-en-counter"]').text()).toContain('"seconds":3')
    expect(w.get('[data-testid="intro-phrase-it-counter"]').text()).toContain('"count":0')
    expect(w.get('[data-testid="intro-phrase-it-counter"]').text()).toContain('"seconds":0')
  })

  it('describes each textarea by its help and its counter', async () => {
    const w = await mountForm(null)

    expect(en(w).attributes('aria-describedby')).toBe(
      'intro-phrase-en-help intro-phrase-en-counter'
    )
    expect(w.find('#intro-phrase-en-counter').exists()).toBe(true)
    expect(w.find('#intro-phrase-en-help').exists()).toBe(true)
  })

  it('warns and blocks saving when a locale is over 3600 characters', async () => {
    const w = await mountForm(null)

    await en(w).setValue('a'.repeat(3601))
    await submit(w)

    expect(updateInterviewIntroPhrase).not.toHaveBeenCalled()
    expect(w.find('[data-testid="intro-phrase-en-error"]').exists()).toBe(true)
    expect(en(w).attributes('aria-invalid')).toBe('true')
    expect(en(w).attributes('aria-describedby')).toContain('intro-phrase-en-error')
    expect(w.get('[data-testid="intro-phrase-en-counter"]').classes()).toContain('text-destructive')
  })

  it('says in words, not only in colour, that a locale is over the limit', async () => {
    const w = await mountForm(null)

    expect(w.get('[data-testid="intro-phrase-en-counter"]').text()).not.toContain('overBy')

    await en(w).setValue('a'.repeat(3605))

    expect(w.get('[data-testid="intro-phrase-en-counter"]').text()).toContain(
      'settings.platform.introPhrase.overBy:{"over":5}'
    )
  })

  it('counts characters, not UTF-16 units, like the API does', async () => {
    const w = await mountForm(null)

    await en(w).setValue('😀'.repeat(3600))
    await submit(w)

    expect(updateInterviewIntroPhrase).toHaveBeenCalledTimes(1)
  })

  it('measures the trimmed text, as it is what gets sent', async () => {
    const w = await mountForm(null)
    const counter = () => w.get('[data-testid="intro-phrase-en-counter"]').text()

    // 3600 characters once trimmed, 3610 raw: savable, counter and estimate agree.
    await en(w).setValue(`  ${'a'.repeat(3600)}        `)
    expect(counter()).toContain('"count":3600')
    expect(counter()).toContain('"seconds":240')
    expect(counter()).not.toContain('overBy')
    expect(en(w).attributes('aria-invalid')).toBe('false')
    await submit(w)
    expect(updateInterviewIntroPhrase).toHaveBeenCalledWith({ en: 'a'.repeat(3600) })
  })

  it('still blocks padded text that is over the limit once trimmed', async () => {
    const w = await mountForm(null)

    await en(w).setValue(`  ${'a'.repeat(3601)}  `)
    expect(w.get('[data-testid="intro-phrase-en-counter"]').text()).toContain('"over":1')
    await submit(w)

    expect(updateInterviewIntroPhrase).not.toHaveBeenCalled()
    expect(w.find('[data-testid="intro-phrase-en-error"]').exists()).toBe(true)
  })

  it('requires English when only Italian is filled', async () => {
    const w = await mountForm(null)

    await it_(w).setValue('Ciao')
    await submit(w)

    expect(updateInterviewIntroPhrase).not.toHaveBeenCalled()
    expect(w.get('[data-testid="intro-phrase-en-error"]').text()).toBe(
      'settings.platform.introPhrase.enRequired'
    )
  })

  it('blocks Italian over the limit even when English is fine', async () => {
    const w = await mountForm(null)

    await en(w).setValue('Hello')
    await it_(w).setValue('a'.repeat(3601))
    await submit(w)

    expect(updateInterviewIntroPhrase).not.toHaveBeenCalled()
    expect(w.find('[data-testid="intro-phrase-it-error"]').exists()).toBe(true)
    expect(w.find('[data-testid="intro-phrase-en-error"]').exists()).toBe(false)
  })

  it('sends exactly the trimmed map and only that', async () => {
    const w = await mountForm(null)

    await en(w).setValue('  Hello  ')
    await it_(w).setValue('Ciao')
    await submit(w)

    expect(updateInterviewIntroPhrase).toHaveBeenCalledWith({ en: 'Hello', it: 'Ciao' })
    expect(w.get('[data-testid="intro-phrase-banner"]').text()).toBe(
      'settings.platform.introPhrase.saved'
    )
    expect(w.emitted('saved')).toHaveLength(1)
  })

  it('omits Italian when it is left blank', async () => {
    const w = await mountForm(null)

    await en(w).setValue('Hello')
    await submit(w)

    expect(updateInterviewIntroPhrase).toHaveBeenCalledWith({ en: 'Hello' })
  })

  it('treats two blank fields as a clear and sends null', async () => {
    const w = await mountForm({ en: 'Hello' })

    await en(w).setValue('   ')
    await submit(w)

    expect(updateInterviewIntroPhrase).toHaveBeenCalledWith(null)
  })

  it('re-seeds from the server answer', async () => {
    updateInterviewIntroPhrase.mockResolvedValue({
      data: { interview_intro_phrase: { en: 'Normalised', it: 'Normalizzato' } },
    })
    const w = await mountForm(null)

    await en(w).setValue('Hello')
    await submit(w)

    expect((en(w).element as HTMLTextAreaElement).value).toBe('Normalised')
    expect((it_(w).element as HTMLTextAreaElement).value).toBe('Normalizzato')
  })

  it('refuses to save before the stored value has been read', async () => {
    const w = await mountForm(null, false)

    await en(w).setValue('Hello')
    await submit(w)

    expect(updateInterviewIntroPhrase).not.toHaveBeenCalled()
    expect(w.get('[data-testid="intro-phrase-submit"]').attributes('disabled')).toBeDefined()
    expect(w.get('[data-testid="intro-phrase-clear"]').attributes('disabled')).toBeDefined()
  })

  describe('clearing', () => {
    it('asks first, then sends null and empties both fields', async () => {
      updateInterviewIntroPhrase.mockResolvedValue({ data: { interview_intro_phrase: null } })
      const w = await mountForm({ en: 'Hello', it: 'Ciao' })

      await w.get('[data-testid="intro-phrase-clear"]').trigger('click')
      expect(updateInterviewIntroPhrase).not.toHaveBeenCalled()

      await w.get('[data-testid="confirm-stub-confirm"]').trigger('click')
      await flushPromises()

      expect(updateInterviewIntroPhrase).toHaveBeenCalledWith(null)
      expect((en(w).element as HTMLTextAreaElement).value).toBe('')
      expect(w.find('[data-testid="confirm-stub"]').exists()).toBe(false)
      expect(w.get('[data-testid="intro-phrase-banner"]').text()).toBe(
        'settings.platform.introPhrase.cleared'
      )
    })

    it('does nothing when the confirmation is dismissed', async () => {
      const w = await mountForm({ en: 'Hello' })

      await w.get('[data-testid="intro-phrase-clear"]').trigger('click')
      await w.get('[data-testid="confirm-stub-cancel"]').trigger('click')

      expect(updateInterviewIntroPhrase).not.toHaveBeenCalled()
      expect(w.find('[data-testid="confirm-stub"]').exists()).toBe(false)
    })

    it('reports a failed clear and keeps the text', async () => {
      updateInterviewIntroPhrase.mockRejectedValue(new Error('offline'))
      const w = await mountForm({ en: 'Hello' })

      await w.get('[data-testid="intro-phrase-clear"]').trigger('click')
      await w.get('[data-testid="confirm-stub-confirm"]').trigger('click')
      await flushPromises()

      expect((en(w).element as HTMLTextAreaElement).value).toBe('Hello')
      expect(w.get('[data-testid="intro-phrase-banner"]').text()).toBe(
        'settings.platform.introPhrase.saveFailed'
      )
    })
  })

  describe('server refusals', () => {
    it('lands the end-phrase refusal on the field it names', async () => {
      updateInterviewIntroPhrase.mockRejectedValue(
        refusal({ 'interview_intro_phrase.it': ['Non usare la frase di chiusura.'] })
      )
      const w = await mountForm(null)

      await en(w).setValue('Hello')
      await it_(w).setValue('Ciao')
      await submit(w)

      expect(w.get('[data-testid="intro-phrase-it-error"]').text()).toBe(
        'Non usare la frase di chiusura.'
      )
      expect(w.find('[data-testid="intro-phrase-en-error"]').exists()).toBe(false)
      // Every key mapped: the generic banner must not pile on.
      expect(w.find('[data-testid="intro-phrase-banner"]').exists()).toBe(false)
    })

    it('maps an English refusal onto the English field', async () => {
      updateInterviewIntroPhrase.mockRejectedValue(
        refusal({ 'interview_intro_phrase.en': ['Too long.'] })
      )
      const w = await mountForm(null)

      await en(w).setValue('Hello')
      await submit(w)

      expect(w.get('[data-testid="intro-phrase-en-error"]').text()).toBe('Too long.')
    })

    it('falls back to the banner for a key it renders no control for', async () => {
      updateInterviewIntroPhrase.mockRejectedValue(refusal({ interview_intro_phrase: ['Nope.'] }))
      const w = await mountForm(null)

      await en(w).setValue('Hello')
      await submit(w)

      expect(w.get('[data-testid="intro-phrase-banner"]').text()).toBe('Nope.')
    })

    it('shows the generic message when the rejection carries no field errors', async () => {
      updateInterviewIntroPhrase.mockRejectedValue(new Error('offline'))
      const w = await mountForm(null)

      await en(w).setValue('Hello')
      await submit(w)

      expect(w.get('[data-testid="intro-phrase-banner"]').text()).toBe(
        'settings.platform.introPhrase.saveFailed'
      )
    })
  })
})
