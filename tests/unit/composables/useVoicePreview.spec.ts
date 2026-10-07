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

  describe('catalogue sample (Cartesia clip served by the api)', () => {
    it('GETs the bytes through the api as a blob and plays the object URL, never a remote url', async () => {
      const { useVoicePreview, catalogueSampleKey } = await load()
      const scope = effectScope()
      const preview = scope.run(() => useVoicePreview())!

      await preview.toggleCatalogueSample('c-1')

      expect(apiFetch).toHaveBeenCalledTimes(1)
      expect(apiFetch).toHaveBeenCalledWith('/avatar-templates/catalogue-sample', {
        method: 'GET',
        query: { provider: 'cartesia', voice_id: 'c-1' },
        responseType: 'blob',
      })
      expect(FakeAudio.instances[0]!.src).toBe('blob:sample-1')
      expect(FakeAudio.instances[0]!.src).not.toContain('cartesia.ai')
      expect(preview.stateFor(catalogueSampleKey('c-1'))).toBe('playing')
      scope.stop()
    })

    it('goes loading then playing, stops on a second click and replays from memory', async () => {
      const { useVoicePreview, catalogueSampleKey } = await load()
      let resolve!: (b: Blob) => void
      apiFetch.mockReturnValueOnce(new Promise<Blob>((r) => (resolve = r)))
      const scope = effectScope()
      const preview = scope.run(() => useVoicePreview())!
      const key = catalogueSampleKey('c-1')

      const pending = preview.toggleCatalogueSample('c-1')
      expect(preview.stateFor(key)).toBe('loading')
      resolve(new Blob(['x']))
      await pending
      expect(preview.stateFor(key)).toBe('playing')

      await preview.toggleCatalogueSample('c-1') // stop
      expect(preview.stateFor(key)).toBe('idle')
      await preview.toggleCatalogueSample('c-1') // replay

      expect(apiFetch).toHaveBeenCalledTimes(1)
      expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
      scope.stop()
    })

    it('never shares a key or a cache entry with the synthesised sample of the same voice', async () => {
      const { useVoicePreview, catalogueSampleKey, voicePreviewKey } = await load()
      const scope = effectScope()
      const preview = scope.run(() => useVoicePreview())!

      expect(catalogueSampleKey('v-1')).not.toBe(voicePreviewKey(cartesia))

      await preview.toggle(cartesia)
      await preview.toggleCatalogueSample('v-1')

      expect(apiFetch).toHaveBeenCalledTimes(2)
      expect(preview.stateFor(voicePreviewKey(cartesia))).toBe('idle')
      expect(preview.stateFor(catalogueSampleKey('v-1'))).toBe('playing')
      scope.stop()
    })

    it('silences the combobox own player when it starts', async () => {
      const { useVoicePreview } = await load()
      const scope = effectScope()
      const preview = scope.run(() => useVoicePreview())!
      const stopCatalogue = vi.fn()

      preview.claimPlayback(stopCatalogue)
      await preview.toggleCatalogueSample('c-1')

      expect(stopCatalogue).toHaveBeenCalledTimes(1)
      scope.stop()
    })

    it.each([
      [422, 'voice_preview_unavailable', 'unavailable'],
      [503, 'voice_preview_provider_not_configured', 'provider_not_configured'],
      [404, 'voice_preview_voice_not_found', 'voice_not_found'],
      [502, 'voice_preview_provider_error', 'provider_error'],
    ])('maps %i %s to %s and asks again on the next click', async (status, message, expected) => {
      const { useVoicePreview, catalogueSampleKey } = await load()
      apiFetch.mockRejectedValueOnce(serverError(status, message))
      const scope = effectScope()
      const preview = scope.run(() => useVoicePreview())!
      const key = catalogueSampleKey('c-1')

      await preview.toggleCatalogueSample('c-1')
      expect(preview.stateFor(key)).toBe('error')
      expect(preview.errorFor(key)).toBe(expected)

      await preview.toggleCatalogueSample('c-1')
      expect(apiFetch).toHaveBeenCalledTimes(2)
      expect(preview.stateFor(key)).toBe('playing')
      scope.stop()
    })

    it('maps a throttled request to rate_limited', async () => {
      const { useVoicePreview, catalogueSampleKey } = await load()
      apiFetch.mockRejectedValueOnce({ status: 429, data: { message: 'Too Many Attempts.' } })
      const scope = effectScope()
      const preview = scope.run(() => useVoicePreview())!

      await preview.toggleCatalogueSample('c-1')

      expect(preview.errorFor(catalogueSampleKey('c-1'))).toBe('rate_limited')
      scope.stop()
    })

    it('revokes its object URL when the last consumer unmounts', async () => {
      const { useVoicePreview } = await load()
      const scope = effectScope()
      const preview = scope.run(() => useVoicePreview())!

      await preview.toggleCatalogueSample('c-1')
      scope.stop()

      expect(revoke).toHaveBeenCalledTimes(1)
    })
  })

  describe('every documented failure of both audio routes', () => {
    // The openapi.json documents 404/422/429/502/503 for BOTH routes; whichever route failed, the sample must
    // end in `error` with the translated code, never stay `loading`/`playing`, and leave no object URL behind.
    const FAILURES = [
      [404, { message: 'voice_preview_voice_not_found' }, 'voice_not_found'],
      [422, { message: 'voice_preview_unavailable' }, 'unavailable'],
      [
        422,
        {
          message: 'The given data was invalid.',
          errors: { voice_id: ['The voice id field is required.'] },
        },
        'invalid_request',
      ],
      [429, { message: 'Too Many Attempts.' }, 'rate_limited'],
      [502, { message: 'voice_preview_provider_error' }, 'provider_error'],
      [503, { message: 'voice_preview_provider_not_configured' }, 'provider_not_configured'],
    ] as const

    const ROUTES = [
      [
        'synthesised sample',
        (
          p: Awaited<ReturnType<typeof load>>['useVoicePreview'] extends () => infer R ? R : never
        ) => p.toggle(cartesia),
      ],
      [
        'catalogue sample',
        (
          p: Awaited<ReturnType<typeof load>>['useVoicePreview'] extends () => infer R ? R : never
        ) => p.toggleCatalogueSample('v-1'),
      ],
    ] as const

    for (const [route, run] of ROUTES) {
      it.each(FAILURES)(
        `${route}: %i ends in error, never stuck, nothing to revoke`,
        async (status, body, expected) => {
          const { useVoicePreview, voicePreviewKey, catalogueSampleKey } = await load()
          const key =
            route === 'catalogue sample' ? catalogueSampleKey('v-1') : voicePreviewKey(cartesia)
          // 429 carries the documented Retry-After; the blob error body is what `responseType: 'blob'` yields.
          apiFetch.mockRejectedValueOnce({
            status,
            response: { headers: new Headers(status === 429 ? { 'Retry-After': '42' } : {}) },
            data: new Blob([JSON.stringify(body)], { type: 'application/json' }),
          })
          const scope = effectScope()
          const preview = scope.run(() => useVoicePreview())!

          await run(preview)

          expect(preview.stateFor(key)).toBe('error')
          expect(preview.errorFor(key)).toBe(expected)
          expect(URL.createObjectURL).not.toHaveBeenCalled()
          expect(FakeAudio.instances.every((audio) => audio.src === '')).toBe(true)

          // Recoverable: the next click asks again, and its object URL IS revoked on unmount.
          await run(preview)
          expect(preview.stateFor(key)).toBe('playing')
          expect(preview.errorFor(key)).toBeNull()
          scope.stop()
          expect(revoke).toHaveBeenCalledTimes(1)
        }
      )
    }
  })

  describe('persona variant (pal_id)', () => {
    const pal = { provider: 'tavus', pal_id: 'p-1' } as const

    it('sends pal_id and no voice_id, with the Italian default', async () => {
      const { useVoicePreview } = await load()
      const scope = effectScope()
      const preview = scope.run(() => useVoicePreview())!

      await preview.toggle(pal)

      expect(apiFetch).toHaveBeenCalledWith('/avatar-templates/voice-preview', {
        method: 'POST',
        body: { provider: 'tavus', pal_id: 'p-1', language: 'it' },
        responseType: 'blob',
      })
      scope.stop()
    })

    it('caches per persona id and never shares a key with a voice id of the same value', async () => {
      const { useVoicePreview, voicePreviewKey } = await load()
      const scope = effectScope()
      const preview = scope.run(() => useVoicePreview())!

      expect(voicePreviewKey(pal)).not.toBe(voicePreviewKey({ provider: 'tavus', voice_id: 'p-1' }))
      expect(voicePreviewKey(pal)).not.toBe(voicePreviewKey({ provider: 'tavus', pal_id: 'p-2' }))

      await preview.toggle(pal)
      await preview.toggle(pal) // stop
      await preview.toggle(pal) // replay from memory
      expect(apiFetch).toHaveBeenCalledTimes(1)

      await preview.toggle({ provider: 'tavus', pal_id: 'p-2' })
      expect(apiFetch).toHaveBeenCalledTimes(2)
      scope.stop()
    })

    it.each([
      'pal_uses_tavus_voice',
      'pal_azure_engine',
      'pal_no_voice_configured',
      'tavus_stock_voice',
    ])('surfaces the 422 reason %s instead of the umbrella code', async (reason) => {
      const { useVoicePreview, voicePreviewKey } = await load()
      apiFetch.mockRejectedValueOnce({
        status: 422,
        data: new Blob([JSON.stringify({ message: 'voice_preview_unavailable', reason })]),
      })
      const scope = effectScope()
      const preview = scope.run(() => useVoicePreview())!

      await preview.toggle(pal)

      expect(preview.errorFor(voicePreviewKey(pal))).toBe(reason)
      scope.stop()
    })

    it('keeps "unavailable" for an unknown or missing reason', async () => {
      const { useVoicePreview, voicePreviewKey } = await load()
      apiFetch.mockRejectedValueOnce({
        status: 422,
        data: { message: 'voice_preview_unavailable', reason: 'something_new' },
      })
      const scope = effectScope()
      const preview = scope.run(() => useVoicePreview())!

      await preview.toggle(pal)

      expect(preview.errorFor(voicePreviewKey(pal))).toBe('unavailable')
      scope.stop()
    })

    it('maps a missing persona (404) and a provider failure like a voice', async () => {
      const { useVoicePreview, voicePreviewKey } = await load()
      apiFetch.mockRejectedValueOnce(serverError(404, 'voice_preview_voice_not_found'))
      const scope = effectScope()
      const preview = scope.run(() => useVoicePreview())!

      await preview.toggle(pal)

      expect(preview.errorFor(voicePreviewKey(pal))).toBe('voice_not_found')
      scope.stop()
    })
  })
})
