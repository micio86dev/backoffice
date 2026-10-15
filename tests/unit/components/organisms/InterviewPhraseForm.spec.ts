/**
 * InterviewPhraseForm — the shared per-locale phrase form, driven purely by props.
 *
 * The intro and closing wrappers only bind a field, a prefix and a save
 * function; every rule (cap, trim, en-required, payload shape, server-error
 * mapping, clear flow) lives here, so it is exercised here with a prefix that
 * belongs to neither wrapper.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

const tMock = (key: string, params?: Record<string, unknown>) =>
  params ? `${key}:${JSON.stringify(params)}` : key

const save = vi.fn()

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
    await import('../../../../app/components/organisms/InterviewPhraseForm.vue')
  const wrapper = mount(Form, {
    props: {
      field: 'some_phrase',
      i18nPrefix: 'settings.platform.somePhrase',
      testIdPrefix: 'some-phrase',
      initial,
      loaded,
      save,
    },
    global: { mocks: { $t: tMock }, stubs: { ConfirmDialog: ConfirmDialogStub } },
  })
  await flushPromises()
  return wrapper
}

type W = Awaited<ReturnType<typeof mountForm>>
const en = (w: W) => w.get('[data-testid="some-phrase-en"]')
const it_ = (w: W) => w.get('[data-testid="some-phrase-it"]')
const value = (el: ReturnType<typeof en>) => (el.element as HTMLTextAreaElement).value
const submit = async (w: W) => {
  await w.get('[data-testid="some-phrase-form"]').trigger('submit')
  await flushPromises()
}

function refusal(errors: Record<string, string[]>) {
  return Object.assign(new Error('HTTP 422'), { status: 422, data: { errors } })
}

describe('InterviewPhraseForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal(
      'useI18n',
      vi.fn(() => ({ t: tMock }))
    )
    save.mockResolvedValue({ en: 'Hello', it: 'Ciao' })
  })

  it('shows the stored map and re-seeds when it arrives late', async () => {
    const w = await mountForm({ en: 'Hello there' }, false)
    expect(value(en(w))).toBe('Hello there')
    expect(value(it_(w))).toBe('')

    await w.setProps({ initial: { en: 'Late', it: 'Tardi' }, loaded: true })
    expect(value(en(w))).toBe('Late')
    expect(value(it_(w))).toBe('Tardi')
  })

  it('namespaces ids, testids and messages by its props', async () => {
    const w = await mountForm(null)

    expect(w.text()).toContain('settings.platform.somePhrase.title')
    expect(en(w).attributes('aria-describedby')).toBe('some-phrase-en-help some-phrase-en-counter')
    expect(w.find('#some-phrase-en-counter').exists()).toBe(true)
  })

  it('counts code points of the trimmed text and estimates the spoken time', async () => {
    const w = await mountForm(null)

    await en(w).setValue(`  ${'😀'.repeat(31)}  `)

    const counter = w.get('[data-testid="some-phrase-en-counter"]').text()
    expect(counter).toContain('"count":31')
    expect(counter).toContain('"seconds":3')
  })

  it('blocks a locale over 3600 characters, in words and via aria-invalid', async () => {
    const w = await mountForm(null)

    await en(w).setValue('a'.repeat(3601))
    expect(w.get('[data-testid="some-phrase-en-counter"]').text()).toContain('"over":1')
    await submit(w)

    expect(save).not.toHaveBeenCalled()
    expect(w.get('[data-testid="some-phrase-en-error"]').text()).toContain('tooLong')
    expect(en(w).attributes('aria-invalid')).toBe('true')
    expect(en(w).attributes('aria-describedby')).toContain('some-phrase-en-error')
  })

  it('clears a locale error, and its tab marker, as soon as that locale is edited', async () => {
    const w = await mountForm(null)

    await en(w).setValue('a'.repeat(3601))
    await submit(w)
    expect(w.find('[data-testid="some-phrase-en-error"]').exists()).toBe(true)
    expect(w.find('[data-testid="some-phrase-tab-en-error"]').exists()).toBe(true)

    await en(w).setValue('Hello')

    expect(w.find('[data-testid="some-phrase-en-error"]').exists()).toBe(false)
    expect(w.find('[data-testid="some-phrase-tab-en-error"]').exists()).toBe(false)
  })

  it('accepts exactly 3600 trimmed characters', async () => {
    const w = await mountForm(null)

    await en(w).setValue(`  ${'a'.repeat(3600)}  `)
    await submit(w)

    expect(save).toHaveBeenCalledWith({ en: 'a'.repeat(3600) })
  })

  it('requires English when only Italian is filled', async () => {
    const w = await mountForm(null)

    await it_(w).setValue('Ciao')
    await submit(w)

    expect(save).not.toHaveBeenCalled()
    expect(w.get('[data-testid="some-phrase-en-error"]').text()).toBe(
      'settings.platform.somePhrase.enRequired'
    )
  })

  it('sends null, {en} or {en, it} trimmed, nothing else', async () => {
    save.mockImplementation(async (phrase) => phrase)
    const w = await mountForm({ en: 'x' })

    await en(w).setValue('   ')
    await submit(w)
    expect(save).toHaveBeenLastCalledWith(null)

    await en(w).setValue('  Hello  ')
    await submit(w)
    expect(save).toHaveBeenLastCalledWith({ en: 'Hello' })

    await it_(w).setValue(' Ciao ')
    await submit(w)
    expect(save).toHaveBeenLastCalledWith({ en: 'Hello', it: 'Ciao' })
    expect(w.get('[data-testid="some-phrase-banner"]').text()).toBe(
      'settings.platform.somePhrase.saved'
    )
    expect(w.emitted('saved')).toHaveLength(3)
  })

  it('re-seeds from the value the server answers with', async () => {
    save.mockResolvedValue({ en: 'Normalised', it: 'Normalizzato' })
    const w = await mountForm(null)

    await en(w).setValue('Hello')
    await submit(w)

    expect(value(en(w))).toBe('Normalised')
    expect(value(it_(w))).toBe('Normalizzato')
  })

  it('refuses to save before the stored value has been read', async () => {
    const w = await mountForm(null, false)

    await en(w).setValue('Hello')
    await submit(w)

    expect(save).not.toHaveBeenCalled()
    expect(w.get('[data-testid="some-phrase-submit"]').attributes('disabled')).toBeDefined()
    expect(w.get('[data-testid="some-phrase-clear"]').attributes('disabled')).toBeDefined()
  })

  describe('locale tabs', () => {
    const tab = (w: W, locale: 'en' | 'it') => w.get(`[data-testid="some-phrase-tab-${locale}"]`)
    const select = async (w: W, locale: 'en' | 'it') => {
      await tab(w, locale).trigger('mousedown', { button: 0 })
      await flushPromises()
    }
    const selected = (w: W, locale: 'en' | 'it') => tab(w, locale).attributes('aria-selected')

    it('offers one tab per locale, English first and selected', async () => {
      const w = await mountForm(null)

      expect(tab(w, 'en').text()).toContain('settings.platform.phraseLocale.en')
      expect(tab(w, 'it').text()).toContain('settings.platform.phraseLocale.it')
      expect(selected(w, 'en')).toBe('true')
      expect(selected(w, 'it')).toBe('false')
    })

    it('keeps what was typed in each locale across tab switches', async () => {
      const w = await mountForm(null)

      await en(w).setValue('Hello')
      await select(w, 'it')
      expect(selected(w, 'it')).toBe('true')
      await it_(w).setValue('Ciao')
      await select(w, 'en')

      expect(value(en(w))).toBe('Hello')
      expect(value(it_(w))).toBe('Ciao')
    })

    it('marks the tab of a locale that has an error, in words for screen readers', async () => {
      const w = await mountForm(null)
      expect(w.find('[data-testid="some-phrase-tab-it-error"]').exists()).toBe(false)

      await it_(w).setValue('a'.repeat(3601))
      await en(w).setValue('Hello')
      await submit(w)

      const marker = w.get('[data-testid="some-phrase-tab-it-error"]')
      expect(marker.text()).toBe('settings.platform.phraseTabError')
      expect(w.find('[data-testid="some-phrase-tab-en-error"]').exists()).toBe(false)
    })

    it('jumps to the first tab with an error on submit', async () => {
      const w = await mountForm(null)

      await it_(w).setValue('a'.repeat(3601))
      await en(w).setValue('Hello')
      expect(selected(w, 'en')).toBe('true')
      await submit(w)

      expect(selected(w, 'it')).toBe('true')
    })

    it('stays on English when English is the first with an error', async () => {
      const w = await mountForm(null)

      await select(w, 'it')
      await it_(w).setValue('Ciao')
      await submit(w)

      expect(selected(w, 'en')).toBe('true')
    })

    it('jumps to the tab a server refusal names', async () => {
      save.mockRejectedValue(refusal({ 'some_phrase.it': ['Nope.'] }))
      const w = await mountForm(null)

      await en(w).setValue('Hello')
      await it_(w).setValue('Ciao')
      await submit(w)

      expect(selected(w, 'it')).toBe('true')
      expect(w.find('[data-testid="some-phrase-tab-it-error"]').exists()).toBe(true)
    })
  })

  describe('clearing', () => {
    it('asks first, then sends null and empties both fields', async () => {
      save.mockResolvedValue(null)
      const w = await mountForm({ en: 'Hello', it: 'Ciao' })

      await w.get('[data-testid="some-phrase-clear"]').trigger('click')
      expect(save).not.toHaveBeenCalled()

      await w.get('[data-testid="confirm-stub-confirm"]').trigger('click')
      await flushPromises()

      expect(save).toHaveBeenCalledWith(null)
      expect(value(en(w))).toBe('')
      expect(w.get('[data-testid="some-phrase-banner"]').text()).toBe(
        'settings.platform.somePhrase.cleared'
      )
    })

    it('does nothing when dismissed, and keeps the text when the clear fails', async () => {
      const w = await mountForm({ en: 'Hello' })
      await w.get('[data-testid="some-phrase-clear"]').trigger('click')
      await w.get('[data-testid="confirm-stub-cancel"]').trigger('click')
      expect(save).not.toHaveBeenCalled()

      save.mockRejectedValue(new Error('offline'))
      await w.get('[data-testid="some-phrase-clear"]').trigger('click')
      await w.get('[data-testid="confirm-stub-confirm"]').trigger('click')
      await flushPromises()

      expect(value(en(w))).toBe('Hello')
      expect(w.get('[data-testid="some-phrase-banner"]').text()).toBe(
        'settings.platform.somePhrase.saveFailed'
      )
    })
  })

  describe('server refusals', () => {
    it('lands an end-phrase refusal on the locale its field names, without a banner', async () => {
      save.mockRejectedValue(refusal({ 'some_phrase.it': ['Non usare la frase di chiusura.'] }))
      const w = await mountForm(null)

      await en(w).setValue('Hello')
      await it_(w).setValue('Ciao')
      await submit(w)

      expect(w.get('[data-testid="some-phrase-it-error"]').text()).toBe(
        'Non usare la frase di chiusura.'
      )
      expect(w.find('[data-testid="some-phrase-en-error"]').exists()).toBe(false)
      expect(w.find('[data-testid="some-phrase-banner"]').exists()).toBe(false)
    })

    it('ignores errors keyed to another field and shows them in the banner', async () => {
      save.mockRejectedValue(refusal({ interview_intro_phrase: ['Nope.'] }))
      const w = await mountForm(null)

      await en(w).setValue('Hello')
      await submit(w)

      expect(w.get('[data-testid="some-phrase-banner"]').text()).toBe('Nope.')
    })

    it('shows the generic message when there are no field errors', async () => {
      save.mockRejectedValue(new Error('offline'))
      const w = await mountForm(null)

      await en(w).setValue('Hello')
      await submit(w)

      expect(w.get('[data-testid="some-phrase-banner"]').text()).toBe(
        'settings.platform.somePhrase.saveFailed'
      )
    })
  })
})
