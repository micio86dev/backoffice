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
  voicePreviewKey: (r: { provider: string; voice_id: string; tts_engine?: string }) =>
    `${r.provider}|${r.voice_id}|${r.tts_engine ?? ''}`,
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
})
