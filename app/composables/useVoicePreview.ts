/**
 * useVoicePreview — listen to a voice before a template is activated.
 *
 * `POST /avatar-templates/voice-preview` (and `GET /avatar-templates/catalogue-sample`,
 * Cartesia's own clip) answer RAW AUDIO BYTES, not JSON, so
 * they are read as a Blob and played from an object URL. Everything else is about
 * keeping that cheap and unsurprising:
 *
 *  - ONE sample plays at a time, app-wide. The state below is module-scoped on
 *    purpose: two buttons in the same drawer must know about each other, and
 *    the catalogue combobox's own free sample player can register itself
 *    through `claimPlayback` so the two never talk over each other.
 *  - Every sample is cached in memory per (provider, voice, engine, language).
 *    A second click is instant and costs nothing — the endpoint bills the
 *    provider a synthesis on a cold call.
 *  - Object URLs are revoked, and playback stopped, when the last consumer
 *    goes away.
 *
 * Errors are typed codes, never prose: the button translates them.
 */
import { getCurrentScope, onScopeDispose, readonly, ref } from 'vue'
import type { components } from '../../types/api'
import { getErrorStatus } from '../utils/http-error'
import { useApi } from './useApi'

export type VoicePreviewRequest = components['schemas']['AvatarVoicePreviewRequest']

export type VoicePreviewState = 'idle' | 'loading' | 'playing' | 'error'

/** The server's `voice_preview_*` codes with the shared prefix dropped, plus client-side ones. */
export type VoicePreviewErrorCode =
  | 'unavailable'
  // Why a PERSONA has no sample, as the server reports it in `reason`.
  | 'pal_uses_tavus_voice'
  | 'pal_azure_engine'
  | 'pal_no_voice_configured'
  | 'tavus_stock_voice'
  | 'provider_not_configured'
  | 'voice_not_found'
  | 'provider_error'
  | 'rate_limited'
  | 'invalid_request'
  | 'forbidden'
  | 'playback_failed'
  | 'unknown'

const SERVER_CODES: Record<string, VoicePreviewErrorCode> = {
  voice_preview_unavailable: 'unavailable',
  voice_preview_provider_not_configured: 'provider_not_configured',
  voice_preview_voice_not_found: 'voice_not_found',
  voice_preview_provider_error: 'provider_error',
}

const PAL_REASONS = [
  'pal_uses_tavus_voice',
  'pal_azure_engine',
  'pal_no_voice_configured',
  'tavus_stock_voice',
] as const

/** Cache / ownership key: everything that changes what the sample sounds like. */
export function voicePreviewKey(request: VoicePreviewRequest): string {
  return [
    request.provider,
    // A persona and a voice id live in different namespaces: never share a key.
    request.pal_id !== undefined ? `pal:${request.pal_id}` : request.voice_id,
    request.provider === 'tavus' ? (request.tts_engine ?? '') : '',
    request.language ?? 'it',
  ].join('|')
}

/**
 * Cache / ownership key of a vendor CATALOGUE clip (`GET /avatar-templates/catalogue-sample`).
 * The leading `catalogue` is never a provider, so it cannot collide with `voicePreviewKey`.
 */
export function catalogueSampleKey(voiceId: string): string {
  return ['catalogue', 'cartesia', voiceId].join('|')
}

// --- module-scoped, shared by every consumer ---------------------------------

const activeKey = ref<string | null>(null)
const activeState = ref<VoicePreviewState>('idle')
const activeError = ref<VoicePreviewErrorCode | null>(null)

const cache = new Map<string, string>()
let audio: HTMLAudioElement | null = null
let externalStop: (() => void) | null = null
let consumers = 0
// Monotonic token: a slow answer for a sample the operator has already moved
// away from must not start playing over the one they asked for last.
let requestSeq = 0

function getAudio(): HTMLAudioElement {
  if (audio === null) {
    audio = new Audio()
    audio.addEventListener('ended', () => {
      activeState.value = 'idle'
    })
    audio.addEventListener('error', () => {
      // An unset `src` also fires `error` in some engines; only a sample we
      // are actually playing is a failure worth surfacing.
      if (activeState.value !== 'playing') return
      activeError.value = 'playback_failed'
      activeState.value = 'error'
    })
  }

  return audio
}

function pausePlayback(): void {
  if (audio !== null) {
    audio.pause()
  }
}

function stopExternal(): void {
  const stop = externalStop
  externalStop = null
  stop?.()
}

/** A Blob error body is JSON in a Blob when the request asked for `blob`. */
async function readErrorBody(
  error: unknown
): Promise<{ message: string | null; reason: string | null }> {
  const empty = { message: null, reason: null }
  if (typeof error !== 'object' || error === null) return empty
  let data = (error as { data?: unknown }).data

  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    try {
      data = JSON.parse(await data.text())
    } catch {
      return empty
    }
  }

  if (typeof data !== 'object' || data === null) return empty
  const { message, reason } = data as { message?: unknown; reason?: unknown }

  return {
    message: typeof message === 'string' ? message : null,
    reason: typeof reason === 'string' ? reason : null,
  }
}

async function mapError(error: unknown): Promise<VoicePreviewErrorCode> {
  const status = getErrorStatus(error)
  const { message, reason } = await readErrorBody(error)

  if (message !== null && message in SERVER_CODES) {
    const code = SERVER_CODES[message] as VoicePreviewErrorCode
    // A persona's "unavailable" says WHY; surface the reason, not the umbrella.
    if (
      code === 'unavailable' &&
      reason !== null &&
      (PAL_REASONS as readonly string[]).includes(reason)
    ) {
      return reason as VoicePreviewErrorCode
    }

    return code
  }
  if (status === 429) return 'rate_limited'
  if (status === 403) return 'forbidden'
  if (status === 422) return 'invalid_request'

  return 'unknown'
}

function releaseAll(): void {
  requestSeq += 1
  pausePlayback()
  if (audio !== null) audio.removeAttribute('src')
  for (const url of cache.values()) URL.revokeObjectURL(url)
  cache.clear()
  activeKey.value = null
  activeState.value = 'idle'
  activeError.value = null
}

async function play(url: string, key: string, seq: number): Promise<void> {
  const element = getAudio()
  element.src = url
  activeKey.value = key
  activeState.value = 'playing'

  try {
    await element.play()
  } catch {
    if (seq !== requestSeq) return
    activeError.value = 'playback_failed'
    activeState.value = 'error'
  }
}

export function useVoicePreview() {
  const { apiFetch } = useApi()

  consumers += 1
  if (getCurrentScope() !== undefined) {
    onScopeDispose(() => {
      consumers -= 1
      if (consumers <= 0) {
        consumers = 0
        releaseAll()
      }
    })
  }

  function stateFor(key: string): VoicePreviewState {
    return activeKey.value === key ? activeState.value : 'idle'
  }

  function errorFor(key: string): VoicePreviewErrorCode | null {
    return activeKey.value === key && activeState.value === 'error' ? activeError.value : null
  }

  function stop(): void {
    requestSeq += 1
    pausePlayback()
    activeState.value = 'idle'
    activeError.value = null
  }

  /**
   * Another player (the catalogue's free sample) is about to speak: stop ours
   * and remember how to stop it when we start.
   */
  function claimPlayback(stopOther: () => void): void {
    stop()
    stopExternal()
    externalStop = stopOther
  }

  /**
   * Play the sample under `key`, or stop it when it is the one currently
   * playing. `fetchSample` is the only thing that differs between the
   * synthesised sample and a catalogue clip: where the bytes come from.
   */
  async function toggleKey(key: string, fetchSample: () => Promise<Blob>): Promise<void> {
    if (activeKey.value === key && activeState.value === 'playing') {
      stop()

      return
    }
    if (activeKey.value === key && activeState.value === 'loading') return

    stop()
    stopExternal()
    const seq = requestSeq
    activeKey.value = key
    activeError.value = null

    const cached = cache.get(key)
    if (cached !== undefined) {
      await play(cached, key, seq)

      return
    }

    activeState.value = 'loading'

    try {
      const blob = await fetchSample()
      const url = URL.createObjectURL(blob)
      cache.set(key, url)

      // Cached above either way; only the newest request may start playing.
      if (seq !== requestSeq) return

      await play(url, key, seq)
    } catch (error) {
      const code = await mapError(error)
      if (seq !== requestSeq) return

      activeError.value = code
      activeState.value = 'error'
    }
  }

  /** Play the synthesised sample, or stop it when it is the one currently playing. */
  function toggle(request: VoicePreviewRequest): Promise<void> {
    return toggleKey(voicePreviewKey(request), () =>
      apiFetch<Blob>('/avatar-templates/voice-preview', {
        method: 'POST',
        body: { ...request, language: request.language ?? 'it' },
        responseType: 'blob',
      })
    )
  }

  /**
   * Play Cartesia's own catalogue clip of a voice. The file host needs the
   * platform key, so the api downloads it and we receive the BYTES: the
   * browser never calls the vendor and never holds a key or a vendor url.
   */
  function toggleCatalogueSample(voiceId: string): Promise<void> {
    return toggleKey(catalogueSampleKey(voiceId), () =>
      apiFetch<Blob>('/avatar-templates/catalogue-sample', {
        method: 'GET',
        query: { provider: 'cartesia', voice_id: voiceId },
        responseType: 'blob',
      })
    )
  }

  return {
    activeKey: readonly(activeKey),
    stateFor,
    errorFor,
    toggle,
    toggleCatalogueSample,
    stop,
    claimPlayback,
  }
}
