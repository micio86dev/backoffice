/**
 * useVoicePreview — blob playback, one sample at a time, cached per voice.
 *
 * jsdom/happy-dom has no media pipeline, so `Audio` and the object-URL calls
 * are stubbed and what is asserted is the CONTRACT: which request goes out,
 * when a second one does NOT, and which state each outcome lands in.
 */
import { effectScope } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()

vi.mock('../../../app/composables/useApi', () => ({
  useApi: () => ({ apiFetch }),
}))

class FakeAudio {
  static instances: FakeAudio[] = []
  src = ''
  paused = true
  listeners: Record<string, Array<() => void>> = {}
  play = vi.fn(async () => {
    this.paused = false
  })
  pause = vi.fn(() => {
    this.paused = true
  })
  removeAttribute = vi.fn(() => {
    this.src = ''
  })
  constructor() {
    FakeAudio.instances.push(this)
  }
  addEventListener(name: string, fn: () => void): void {
    ;(this.listeners[name] ??= []).push(fn)
  }
  emit(name: string): void {
    for (const fn of this.listeners[name] ?? []) fn()
  }
}

let objectUrlCounter = 0
const revoke = vi.fn()

async function load() {
  vi.resetModules()
  return import('../../../app/composables/useVoicePreview')
}

const cartesia = { provider: 'cartesia', voice_id: 'v-1' } as const
const heygen = { provider: 'heygen', voice_id: 'h-1' } as const

function serverError(status: number, message: string) {
  return {
    status,
    data: new Blob([JSON.stringify({ message })], { type: 'application/json' }),
  }
}

describe('useVoicePreview', () => {
  beforeEach(() => {
    FakeAudio.instances = []
    objectUrlCounter = 0
    apiFetch.mockReset()
    apiFetch.mockResolvedValue(new Blob(['x'], { type: 'audio/mpeg' }))
    revoke.mockReset()
    vi.stubGlobal('Audio', FakeAudio)
    URL.createObjectURL = vi.fn(() => `blob:sample-${(objectUrlCounter += 1)}`)
    URL.revokeObjectURL = revoke
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('requests raw audio as a blob with the Italian default and plays the object URL', async () => {
    const { useVoicePreview, voicePreviewKey } = await load()
    const scope = effectScope()
    const preview = scope.run(() => useVoicePreview())!

    await preview.toggle(cartesia)

    expect(apiFetch).toHaveBeenCalledWith('/avatar-templates/voice-preview', {
      method: 'POST',
      body: { provider: 'cartesia', voice_id: 'v-1', language: 'it' },
      responseType: 'blob',
    })
    expect(FakeAudio.instances[0]!.src).toBe('blob:sample-1')
    expect(preview.stateFor(voicePreviewKey(cartesia))).toBe('playing')
    scope.stop()
  })

  it('passes tts_engine only for tavus and keys the cache on it', async () => {
    const { voicePreviewKey } = await load()

    expect(voicePreviewKey({ provider: 'tavus', voice_id: 'a', tts_engine: 'cartesia' })).not.toBe(
      voicePreviewKey({ provider: 'tavus', voice_id: 'a', tts_engine: 'elevenlabs' })
    )
    expect(voicePreviewKey({ provider: 'cartesia', voice_id: 'a', tts_engine: 'cartesia' })).toBe(
      voicePreviewKey({ provider: 'cartesia', voice_id: 'a' })
    )
    expect(voicePreviewKey({ ...cartesia, language: 'en' })).not.toBe(voicePreviewKey(cartesia))
  })

  it('goes loading then playing, and stopping returns to idle', async () => {
    const { useVoicePreview, voicePreviewKey } = await load()
    let resolve!: (b: Blob) => void
    apiFetch.mockReturnValueOnce(new Promise<Blob>((r) => (resolve = r)))
    const scope = effectScope()
    const preview = scope.run(() => useVoicePreview())!
    const key = voicePreviewKey(cartesia)

    const pending = preview.toggle(cartesia)
    expect(preview.stateFor(key)).toBe('loading')

    resolve(new Blob(['x']))
    await pending
    expect(preview.stateFor(key)).toBe('playing')

    await preview.toggle(cartesia)
    expect(preview.stateFor(key)).toBe('idle')
    expect(FakeAudio.instances[0]!.pause).toHaveBeenCalled()
    scope.stop()
  })

  it('returns to idle when the sample ends', async () => {
    const { useVoicePreview, voicePreviewKey } = await load()
    const scope = effectScope()
    const preview = scope.run(() => useVoicePreview())!

    await preview.toggle(cartesia)
    FakeAudio.instances[0]!.emit('ended')

    expect(preview.stateFor(voicePreviewKey(cartesia))).toBe('idle')
    scope.stop()
  })

  it('serves a second click from memory without another request', async () => {
    const { useVoicePreview } = await load()
    const scope = effectScope()
    const preview = scope.run(() => useVoicePreview())!

    await preview.toggle(cartesia)
    await preview.toggle(cartesia) // stop
    await preview.toggle(cartesia) // replay

    expect(apiFetch).toHaveBeenCalledTimes(1)
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    expect(FakeAudio.instances[0]!.play).toHaveBeenCalledTimes(2)
    scope.stop()
  })

  it('plays one sample at a time, app-wide', async () => {
    const { useVoicePreview, voicePreviewKey } = await load()
    const scopeA = effectScope()
    const scopeB = effectScope()
    const a = scopeA.run(() => useVoicePreview())!
    const b = scopeB.run(() => useVoicePreview())!

    await a.toggle(cartesia)
    await b.toggle(heygen)

    expect(a.stateFor(voicePreviewKey(cartesia))).toBe('idle')
    expect(b.stateFor(voicePreviewKey(heygen))).toBe('playing')
    expect(FakeAudio.instances).toHaveLength(1)
    scopeA.stop()
    scopeB.stop()
  })

  it('stops the combobox catalogue sample when it starts, and is stopped by it', async () => {
    const { useVoicePreview, voicePreviewKey } = await load()
    const scope = effectScope()
    const preview = scope.run(() => useVoicePreview())!
    const stopCatalogue = vi.fn()

    preview.claimPlayback(stopCatalogue)
    await preview.toggle(cartesia)
    expect(stopCatalogue).toHaveBeenCalledTimes(1)

    preview.claimPlayback(vi.fn())
    expect(preview.stateFor(voicePreviewKey(cartesia))).toBe('idle')
    scope.stop()
  })

  it('discards a slow answer for a sample the operator moved away from', async () => {
    const { useVoicePreview, voicePreviewKey } = await load()
    let resolveSlow!: (b: Blob) => void
    apiFetch.mockReturnValueOnce(new Promise<Blob>((r) => (resolveSlow = r)))
    const scope = effectScope()
    const preview = scope.run(() => useVoicePreview())!

    const slow = preview.toggle(cartesia)
    await preview.toggle(heygen)
    resolveSlow(new Blob(['late']))
    await slow

    expect(preview.stateFor(voicePreviewKey(heygen))).toBe('playing')
    expect(preview.stateFor(voicePreviewKey(cartesia))).toBe('idle')
    scope.stop()
  })

  it.each([
    [422, 'voice_preview_unavailable', 'unavailable'],
    [503, 'voice_preview_provider_not_configured', 'provider_not_configured'],
    [404, 'voice_preview_voice_not_found', 'voice_not_found'],
    [502, 'voice_preview_provider_error', 'provider_error'],
  ])('maps %i %s to %s (error body arrives as a Blob)', async (status, message, expected) => {
    const { useVoicePreview, voicePreviewKey } = await load()
    apiFetch.mockRejectedValueOnce(serverError(status, message))
    const scope = effectScope()
    const preview = scope.run(() => useVoicePreview())!

    await preview.toggle(cartesia)
    const key = voicePreviewKey(cartesia)

    expect(preview.stateFor(key)).toBe('error')
    expect(preview.errorFor(key)).toBe(expected)
    scope.stop()
  })

  it.each([
    [429, 'Too Many Attempts.', 'rate_limited'],
    [403, 'This action is unauthorized.', 'forbidden'],
    [422, 'The voice id field format is invalid.', 'invalid_request'],
    [500, 'Server Error', 'unknown'],
  ])('maps a generic %i to %s', async (status, message, expected) => {
    const { useVoicePreview, voicePreviewKey } = await load()
    apiFetch.mockRejectedValueOnce({ status, data: { message } })
    const scope = effectScope()
    const preview = scope.run(() => useVoicePreview())!

    await preview.toggle(cartesia)

    expect(preview.errorFor(voicePreviewKey(cartesia))).toBe(expected)
    scope.stop()
  })

  it('does not cache a failure: the next click asks again', async () => {
    const { useVoicePreview, voicePreviewKey } = await load()
    apiFetch.mockRejectedValueOnce({
      status: 502,
      data: { message: 'voice_preview_provider_error' },
    })
    const scope = effectScope()
    const preview = scope.run(() => useVoicePreview())!

    await preview.toggle(cartesia)
    await preview.toggle(cartesia)

    expect(apiFetch).toHaveBeenCalledTimes(2)
    expect(preview.stateFor(voicePreviewKey(cartesia))).toBe('playing')
    scope.stop()
  })

  it('surfaces a rejected play() and an element error as playback_failed', async () => {
    const { useVoicePreview, voicePreviewKey } = await load()
    const scope = effectScope()
    const preview = scope.run(() => useVoicePreview())!
    const key = voicePreviewKey(cartesia)

    await preview.toggle(cartesia)
    FakeAudio.instances[0]!.play.mockRejectedValueOnce(new Error('NotAllowed'))
    await preview.toggle(heygen)
    expect(preview.errorFor(voicePreviewKey(heygen))).toBe('playback_failed')

    await preview.toggle(cartesia)
    FakeAudio.instances[0]!.emit('error')
    expect(preview.errorFor(key)).toBe('playback_failed')
    scope.stop()
  })

  it('revokes every object URL and stops playback when the last consumer unmounts', async () => {
    const { useVoicePreview } = await load()
    const scopeA = effectScope()
    const scopeB = effectScope()
    const a = scopeA.run(() => useVoicePreview())!
    scopeB.run(() => useVoicePreview())

    await a.toggle(cartesia)
    await a.toggle(heygen)

    scopeA.stop()
    expect(revoke).not.toHaveBeenCalled()

    scopeB.stop()
    expect(revoke).toHaveBeenCalledTimes(2)
    expect(FakeAudio.instances[0]!.pause).toHaveBeenCalled()
  })
})
