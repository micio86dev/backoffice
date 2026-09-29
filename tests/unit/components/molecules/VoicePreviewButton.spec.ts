/**
 * VoicePreviewButton — the one listen control (DESIGN.md §16.14).
 *
 * The composable is replaced by a controllable double: what is under test here
 * is the button's a11y wiring, its disabled explanations and its honest
 * captions, not the playback machinery (useVoicePreview.spec.ts owns that).
 */
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const states = ref<Record<string, string>>({})
const errors = ref<Record<string, string | null>>({})
const toggle = vi.fn()

vi.mock('../../../../app/composables/useVoicePreview', () => ({
  voicePreviewKey: (r: {
    provider: string
    voice_id?: string
    pal_id?: string
    tts_engine?: string
  }) =>
    `${r.provider}|${r.pal_id !== undefined ? `pal:${r.pal_id}` : r.voice_id}|${r.tts_engine ?? ''}`,
  useVoicePreview: () => ({
    stateFor: (key: string) => states.value[key] ?? 'idle',
    errorFor: (key: string) => errors.value[key] ?? null,
    toggle,
    stop: vi.fn(),
    claimPlayback: vi.fn(),
  }),
}))

const VoicePreviewButton = (
  await import('../../../../app/components/molecules/VoicePreviewButton.vue')
).default

function mountButton(props: Record<string, unknown> = {}) {
  return mount(VoicePreviewButton, {
    props: { provider: 'cartesia', voiceId: 'v-1', testId: 'vp', ...props },
    attachTo: document.body,
  })
}

const button = (w: ReturnType<typeof mountButton>) => w.get('[data-testid="vp"]')

describe('VoicePreviewButton', () => {
  beforeEach(() => {
    states.value = {}
    errors.value = {}
    toggle.mockReset()
  })

  it('is a real button with an accessible name and a not-pressed, not-busy idle state', () => {
    const wrapper = mountButton()

    expect(button(wrapper).element.tagName).toBe('BUTTON')
    expect(button(wrapper).attributes('type')).toBe('button')
    expect(button(wrapper).attributes('aria-label')).toBe(
      'avatar_templates.form.voicePreview.action'
    )
    expect(button(wrapper).attributes('aria-pressed')).toBe('false')
    expect(button(wrapper).attributes('aria-busy')).toBeUndefined()
    expect(button(wrapper).attributes('disabled')).toBeUndefined()
  })

  it('names the voice in the accessible name when it sits in a list of them', () => {
    const wrapper = mountButton({ voiceName: 'Giulia' })

    expect(button(wrapper).attributes('aria-label')).toBe(
      'avatar_templates.form.voicePreview.rowAction'
    )
  })

  it('asks the composable for the Italian sample of this exact voice on click', async () => {
    const wrapper = mountButton()

    await button(wrapper).trigger('click')

    expect(toggle).toHaveBeenCalledWith({ provider: 'cartesia', voice_id: 'v-1', language: 'it' })
  })

  it('sends tts_engine only for tavus', async () => {
    const tavus = mountButton({ provider: 'tavus', ttsEngine: 'elevenlabs' })
    await button(tavus).trigger('click')
    expect(toggle).toHaveBeenLastCalledWith({
      provider: 'tavus',
      voice_id: 'v-1',
      tts_engine: 'elevenlabs',
      language: 'it',
    })

    const direct = mountButton({ ttsEngine: 'elevenlabs' })
    await button(direct).trigger('click')
    expect(toggle.mock.lastCall![0]).not.toHaveProperty('tts_engine')
  })

  it('reflects playing as aria-pressed and loading as aria-busy', async () => {
    const wrapper = mountButton()
    states.value = { 'cartesia|v-1|': 'playing' }
    await wrapper.vm.$nextTick()
    expect(button(wrapper).attributes('aria-pressed')).toBe('true')

    states.value = { 'cartesia|v-1|': 'loading' }
    await wrapper.vm.$nextTick()
    expect(button(wrapper).attributes('aria-busy')).toBe('true')
    expect(button(wrapper).attributes('aria-pressed')).toBe('false')
  })

  it('only reflects its OWN sample: another voice playing leaves it idle', async () => {
    const wrapper = mountButton()
    states.value = { 'cartesia|other|': 'playing' }
    await wrapper.vm.$nextTick()

    expect(button(wrapper).attributes('aria-pressed')).toBe('false')
  })

  it('shows a translated error in an alert region wired to the button', async () => {
    const wrapper = mountButton()
    states.value = { 'cartesia|v-1|': 'error' }
    errors.value = { 'cartesia|v-1|': 'rate_limited' }
    await wrapper.vm.$nextTick()

    const alert = wrapper.get('[role="alert"]')
    expect(alert.text()).toContain('rate_limited')
    expect(button(wrapper).attributes('aria-describedby')).toContain(alert.attributes('id'))
  })

  it('is disabled with a visible, referenced explanation when there is no voice yet', () => {
    const wrapper = mountButton({ voiceId: '' })

    expect(button(wrapper).attributes('disabled')).toBeDefined()
    const reasonId = button(wrapper).attributes('aria-describedby')!.split(' ')[0]!
    expect(wrapper.get(`#${reasonId}`).text()).toBe('avatar_templates.form.voicePreview.noVoice')
  })

  it.each(['tavus-auto', 'azure', undefined])(
    'disables a tavus voice with engine %s and explains that stock voices have no preview',
    async (engine) => {
      const wrapper = mountButton({ provider: 'tavus', ttsEngine: engine })

      expect(button(wrapper).attributes('disabled')).toBeDefined()
      expect(wrapper.text()).toContain('avatar_templates.form.voicePreview.stockUnavailable')
      await button(wrapper).trigger('click')
      expect(toggle).not.toHaveBeenCalled()
    }
  )

  it.each(['cartesia', 'elevenlabs'])('enables a tavus voice routed through %s', (engine) => {
    const wrapper = mountButton({ provider: 'tavus', ttsEngine: engine })

    expect(button(wrapper).attributes('disabled')).toBeUndefined()
  })

  it('states honestly what the sample is: a vendor sample, not the final rendering', () => {
    const wrapper = mountButton()

    expect(wrapper.text()).toContain('avatar_templates.form.voicePreview.caption.italian')
    expect(wrapper.text()).toContain('avatar_templates.form.voicePreview.disclaimer')
  })

  it('labels a HeyGen sample as generic, not Italian', () => {
    const wrapper = mountButton({ provider: 'heygen' })

    expect(wrapper.text()).toContain('avatar_templates.form.voicePreview.caption.heygen')
    expect(wrapper.text()).not.toContain('avatar_templates.form.voicePreview.caption.italian')
  })

  it('compact mode keeps the caption for assistive tech and as a tooltip, not on screen', () => {
    const wrapper = mountButton({ compact: true })

    const caption = wrapper.get('[data-testid="vp-caption"]')
    expect(caption.classes()).toContain('sr-only')
    expect(button(wrapper).attributes('title')).toContain(
      'avatar_templates.form.voicePreview.caption.italian'
    )
  })

  it('labelled mode shows the action as visible text on a 40px-tall control, not icon-only', () => {
    const wrapper = mountButton({ labelled: true })

    expect(button(wrapper).text()).toBe('avatar_templates.form.voicePreview.action')
    expect(button(wrapper).classes()).toContain('min-h-10')
    // The visible text IS the name: no separate aria-label that could disagree with it.
    expect(button(wrapper).attributes('aria-label')).toBeUndefined()
  })

  it('names a HeyGen sample honestly: generic, never "Italian"', () => {
    const wrapper = mountButton({ provider: 'heygen', labelled: true })

    expect(button(wrapper).text()).toBe('avatar_templates.form.voicePreview.actionGeneric')
    expect(
      mountButton({ provider: 'heygen' }).get('[data-testid="vp"]').attributes('aria-label')
    ).toBe('avatar_templates.form.voicePreview.actionGeneric')
  })

  // jsdom/happy-dom cannot measure pixels. What CAN be pinned is the structure
  // that stopped the caption being squeezed to ~0 width and rendered one word
  // per line, outside its box: own full-width line, wrapping row, caption that
  // may grow and wrap. Removing any of these brings the defect back.
  describe('layout regression: the caption is never squeezed', () => {
    it('takes its own full-width line rather than being a flex sibling of a field', () => {
      const root = mountButton().get('[data-slot="voice-preview"]')

      expect(root.classes()).toEqual(expect.arrayContaining(['w-full', 'basis-full', 'min-w-0']))
    })

    it('lets the button and caption wrap instead of squeezing one another', () => {
      const wrapper = mountButton()
      const row = wrapper.get('[data-slot="voice-preview-row"]')

      expect(row.classes()).toContain('flex-wrap')
      expect(row.classes()).not.toContain('items-center')
    })

    it('gives the caption room to grow and wrap: a real min width, not min-w-0 alone', () => {
      const caption = mountButton().get('[data-testid="vp-caption"]')

      expect(caption.classes()).toEqual(
        expect.arrayContaining(['min-w-[12rem]', 'flex-1', 'whitespace-normal', 'break-words'])
      )
      expect(caption.classes()).not.toContain('min-w-0')
      expect(caption.classes().join(' ')).not.toMatch(/writing|vertical|w-0|w-px/)
    })

    it('renders the label and the disclaimer as two separate lines, not one span', () => {
      const wrapper = mountButton()
      const caption = wrapper.get('[data-testid="vp-caption"]')
      const label = wrapper.get('[data-testid="vp-caption-label"]')
      const disclaimer = wrapper.get('[data-testid="vp-disclaimer"]')

      expect(caption.classes()).toContain('flex-col')
      expect(label.text()).toBe('avatar_templates.form.voicePreview.caption.italian')
      expect(label.classes()).toContain('font-medium')
      expect(disclaimer.text()).toBe('avatar_templates.form.voicePreview.disclaimer')
      expect(disclaimer.classes()).toContain('text-muted-foreground')
      expect(label.element.parentElement).toBe(caption.element)
      expect(disclaimer.element.parentElement).toBe(caption.element)
    })

    it('keeps compact rows out of the layout without dropping the text', () => {
      const caption = mountButton({ compact: true }).get('[data-testid="vp-caption"]')

      expect(caption.classes()).toContain('sr-only')
    })
  })

  describe('persona variant', () => {
    it('is ENABLED as soon as a persona is chosen and asks for its voice with pal_id', async () => {
      const wrapper = mountButton({ provider: 'tavus', voiceId: '', palId: 'p-1', labelled: true })

      expect(button(wrapper).attributes('disabled')).toBeUndefined()
      expect(button(wrapper).text()).toBe('avatar_templates.form.voicePreview.palAction')
      await button(wrapper).trigger('click')

      expect(toggle).toHaveBeenCalledWith({ provider: 'tavus', pal_id: 'p-1', language: 'it' })
    })

    it('is disabled with a persona-specific reason while none is chosen', () => {
      const wrapper = mountButton({ provider: 'tavus', voiceId: '', palId: '' })

      expect(button(wrapper).attributes('disabled')).toBeDefined()
      expect(wrapper.text()).toContain('avatar_templates.form.voicePreview.noPersona')
    })

    it('renders the server-reported reason as translated copy in the alert region', async () => {
      const wrapper = mountButton({ provider: 'tavus', voiceId: '', palId: 'p-1' })
      states.value = { 'tavus|pal:p-1|': 'error' }
      errors.value = { 'tavus|pal:p-1|': 'pal_uses_tavus_voice' }
      await wrapper.vm.$nextTick()

      expect(wrapper.get('[role="alert"]').text()).toContain(
        'avatar_templates.form.voicePreview.error.pal_uses_tavus_voice'
      )
    })
  })
})
