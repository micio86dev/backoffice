<template>
  <div data-slot="voice-preview" class="flex w-full basis-full min-w-0 flex-col gap-1">
    <div data-slot="voice-preview-row" class="flex flex-wrap items-start gap-2">
      <!--
        The accessible name is CONSTANT ("Listen to the Italian sample") and the
        play/stop state rides on aria-pressed. A name that flips between "play"
        and "stop" AND carries aria-pressed is announced as a contradiction
        ("stop, pressed"). aria-busy covers the request in flight.
      -->
      <button
        type="button"
        :data-testid="testId"
        :aria-label="labelled ? undefined : accessibleName"
        :aria-pressed="state === 'playing' ? 'true' : 'false'"
        :aria-busy="state === 'loading' ? 'true' : undefined"
        :aria-describedby="describedBy"
        :title="compact ? captionText : undefined"
        :disabled="unavailableReason !== null"
        :class="
          cn(
            'inline-flex shrink-0 items-center justify-center text-muted-foreground hover:bg-primary/10 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent',
            labelled
              ? 'min-h-10 gap-2 rounded-md border border-border px-3 text-sm font-medium text-foreground'
              : 'size-7 rounded'
          )
        "
        @click="onClick"
      >
        <LoaderCircleIcon
          v-if="state === 'loading'"
          class="size-4 motion-safe:animate-spin"
          aria-hidden="true"
        />
        <SquareIcon v-else-if="state === 'playing'" class="size-4" aria-hidden="true" />
        <Volume2Icon v-else class="size-4" aria-hidden="true" />
        <template v-if="labelled">{{ accessibleName }}</template>
      </button>

      <span
        :id="captionId"
        :data-testid="testId ? `${testId}-caption` : undefined"
        :class="
          cn(
            'flex flex-col gap-0.5 text-xs whitespace-normal break-words text-wrap',
            compact ? 'sr-only' : 'min-w-[12rem] flex-1'
          )
        "
      >
        <span
          :data-testid="testId ? `${testId}-caption-label` : undefined"
          class="font-medium text-foreground"
        >
          {{ captionText }}
        </span>
        <span
          :data-testid="testId ? `${testId}-disclaimer` : undefined"
          class="text-muted-foreground"
        >
          {{ t('avatar_templates.form.voicePreview.disclaimer') }}
        </span>
      </span>
    </div>

    <p
      v-if="unavailableReason !== null"
      :id="reasonId"
      :data-testid="testId ? `${testId}-reason` : undefined"
      class="text-xs text-muted-foreground"
    >
      {{ t(`avatar_templates.form.voicePreview.${unavailableReason}`) }}
    </p>

    <p
      v-if="errorCode !== null"
      :id="errorId"
      role="alert"
      :data-testid="testId ? `${testId}-error` : undefined"
      class="text-xs text-destructive"
    >
      {{ errorText }}
    </p>
  </div>
</template>

<script setup lang="ts">
/**
 * VoicePreviewButton — listen to one voice (DESIGN.md §16.14).
 *
 * Owns no playback: it asks `useVoicePreview` for THIS voice's sample and
 * reflects that sample's state. It says what it is — a vendor sample, not the
 * final Tavus / LiveAvatar rendering — and is disabled WITH a written reason,
 * never hidden, when no sample can exist.
 */
import { computed, useId } from 'vue'
import { LoaderCircleIcon, SquareIcon, Volume2Icon } from '@lucide/vue'
import { cn } from '@/lib/utils'
import {
  useVoicePreview,
  voicePreviewKey,
  type VoicePreviewRequest,
} from '@/composables/useVoicePreview'
import { translateServerCode } from '@/utils/server-message'

const props = withDefaults(
  defineProps<{
    provider: VoicePreviewRequest['provider']
    voiceId?: string
    /**
     * A Tavus persona whose OWN voice is sampled (server-side: it reads the
     * persona's TTS layer). Instead of `voiceId`. Whether a sample exists is
     * only known after asking, so the control is enabled once a persona is
     * chosen and shows the server's reason afterwards.
     */
    palId?: string
    /** Only meaningful for `tavus`: the TTS vendor its voice is routed through. */
    ttsEngine?: string | null
    language?: 'it' | 'en'
    /** Caption for assistive tech and as a tooltip only — for dense list rows. */
    compact?: boolean
    /** Visible text next to the icon, on a 40px-tall control — never icon-only. */
    labelled?: boolean
    testId?: string
    /** Names the voice in the accessible name — needed where many rows share a list. */
    voiceName?: string
  }>(),
  {
    voiceId: '',
    palId: undefined,
    ttsEngine: null,
    language: 'it',
    compact: false,
    labelled: false,
    testId: undefined,
    voiceName: undefined,
  }
)

const { t, te } = useI18n()
const { stateFor, errorFor, toggle } = useVoicePreview()

const ROUTABLE_ENGINES = ['cartesia', 'elevenlabs'] as const
type RoutableEngine = (typeof ROUTABLE_ENGINES)[number]

function routableEngine(value: string | null): value is RoutableEngine {
  return ROUTABLE_ENGINES.includes(value as RoutableEngine)
}

const isPersona = computed(() => props.palId !== undefined)

const request = computed<VoicePreviewRequest>(() => {
  if (props.palId !== undefined) {
    return { provider: 'tavus', pal_id: props.palId, language: props.language }
  }

  const base: VoicePreviewRequest = {
    provider: props.provider,
    voice_id: props.voiceId,
    language: props.language,
  }

  if (props.provider === 'tavus' && props.ttsEngine !== null) {
    return { ...base, tts_engine: props.ttsEngine as VoicePreviewRequest['tts_engine'] }
  }

  return base
})

const key = computed(() => voicePreviewKey(request.value))
const state = computed(() => stateFor(key.value))
const errorCode = computed(() => errorFor(key.value))

/** Why no sample can exist, or `null` when one can. */
const unavailableReason = computed<'noVoice' | 'noPersona' | 'stockUnavailable' | null>(() => {
  if (props.palId !== undefined) return props.palId.trim() === '' ? 'noPersona' : null

  // Tavus's own stock voices (and Azure) expose no preview anywhere; only a
  // voice routed through Cartesia or ElevenLabs can be sampled. Checked BEFORE
  // "no voice yet": choosing a voice would not help, choosing an engine does.
  if (props.provider === 'tavus' && !routableEngine(props.ttsEngine)) return 'stockUnavailable'
  if (props.voiceId === undefined || props.voiceId.trim() === '') return 'noVoice'

  return null
})

const captionText = computed(() =>
  t(
    isPersona.value
      ? 'avatar_templates.form.voicePreview.caption.pal'
      : props.provider === 'heygen'
        ? 'avatar_templates.form.voicePreview.caption.heygen'
        : 'avatar_templates.form.voicePreview.caption.italian'
  )
)

const accessibleName = computed(() =>
  props.voiceName === undefined
    ? t(
        isPersona.value
          ? 'avatar_templates.form.voicePreview.palAction'
          : props.provider === 'heygen'
            ? 'avatar_templates.form.voicePreview.actionGeneric'
            : 'avatar_templates.form.voicePreview.action'
      )
    : t('avatar_templates.form.voicePreview.rowAction', { name: props.voiceName })
)

const errorText = computed(() =>
  errorCode.value === null
    ? ''
    : translateServerCode({ t, te }, 'avatar_templates.form.voicePreview.error', errorCode.value)
)

const uid = useId()
const captionId = `${uid}-caption`
const reasonId = `${uid}-reason`
const errorId = `${uid}-error`

const describedBy = computed(() =>
  [
    unavailableReason.value !== null ? reasonId : null,
    captionId,
    errorCode.value !== null ? errorId : null,
  ]
    .filter((id): id is string => id !== null)
    .join(' ')
)

function onClick(): void {
  if (unavailableReason.value !== null) return
  void toggle(request.value)
}
</script>
