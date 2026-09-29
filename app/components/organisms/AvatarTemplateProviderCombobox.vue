<template>
  <!--
    The Escape handler is a delegated dismissal for whatever inside the panel
    has focus (search box, options): the interactive controls are the trigger
    and the panel's own children, not this wrapper.
  -->
  <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -->
  <div ref="rootRef" class="relative flex flex-col gap-2" @keydown.esc="onEscape">
    <button
      v-bind="attrs"
      ref="triggerRef"
      type="button"
      role="combobox"
      aria-haspopup="listbox"
      :aria-expanded="isOpen"
      :aria-controls="panelId"
      :class="cn(formSelectClass, 'flex items-center justify-between gap-2 text-left')"
      @click="toggle"
    >
      <span class="flex min-w-0 items-center gap-2">
        <span v-if="selected" class="truncate">{{ selected.label }}</span>
        <span v-else-if="modelValue !== ''" class="truncate font-mono text-xs">
          {{ modelValue }}
        </span>
        <span v-else class="truncate text-muted-foreground">
          {{ t('avatar_templates.form.catalogue.choose') }}
        </span>
        <span
          v-if="selected === null && modelValue !== '' && loaded"
          :data-testid="`${testIdPrefix}-unknown`"
          class="shrink-0 text-xs text-muted-foreground"
        >
          {{ t('avatar_templates.form.catalogue.unknownSelected') }}
        </span>
      </span>
      <ChevronDownIcon class="size-4 shrink-0 opacity-60" aria-hidden="true" />
    </button>

    <!--
      Inline, deliberately NOT teleported to <body>. A teleported list sits
      outside this component's DOM, so "did the pointer land outside?" cannot be
      answered from here, and the focus handling that used to compensate for it
      is what reopened the list after every selection.
    -->
    <div
      v-if="isOpen"
      :id="panelId"
      :data-testid="`${testIdPrefix}-panel`"
      class="flex flex-col gap-2 rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-md"
      role="presentation"
    >
      <input
        v-model="searchTerm"
        type="text"
        autocomplete="off"
        :data-testid="`${testIdPrefix}-search`"
        :aria-label="t('avatar_templates.form.catalogue.searchPlaceholder')"
        :placeholder="t('avatar_templates.form.catalogue.searchPlaceholder')"
        :class="formControlClass"
      />

      <CheckboxField
        v-if="resource === 'voice'"
        :id="`${testIdPrefix}-italian-only`"
        v-model="italianOnly"
        :data-testid="`${testIdPrefix}-italian-only`"
        :label="t('avatar_templates.form.catalogue.italianOnly')"
      />

      <p
        v-if="state === 'loading'"
        :data-testid="`${testIdPrefix}-loading`"
        role="status"
        class="px-2 py-3 text-sm text-muted-foreground"
      >
        {{ t('avatar_templates.form.catalogue.loading') }}
      </p>

      <div
        v-else-if="state === 'provider_error'"
        :data-testid="`${testIdPrefix}-error`"
        role="alert"
        class="flex flex-col gap-2 px-2 py-3 text-sm"
      >
        <p class="text-destructive">
          {{ t(`avatar_templates.form.catalogue.error.${errorCode}`) }}
        </p>
        <button
          type="button"
          :data-testid="`${testIdPrefix}-retry`"
          class="self-start rounded-md border border-border px-3 py-1 text-sm hover:bg-accent-dark hover:text-white"
          @click="load"
        >
          {{ t('avatar_templates.form.catalogue.retry') }}
        </button>
        <!-- eslint-disable-next-line vuejs-accessibility/form-control-has-label -->
        <input
          type="text"
          autocomplete="off"
          :value="modelValue"
          :data-testid="`${testIdPrefix}-manual`"
          :aria-label="t('avatar_templates.form.catalogue.manualLabel')"
          :placeholder="t('avatar_templates.form.catalogue.manualLabel')"
          :class="formControlClass"
          @input="emit('change', ($event.target as HTMLInputElement).value)"
        />
      </div>

      <p
        v-else-if="state === 'empty'"
        :data-testid="`${testIdPrefix}-empty`"
        class="px-2 py-3 text-sm text-muted-foreground"
      >
        {{ t('avatar_templates.form.catalogue.empty') }}
      </p>

      <p
        v-else-if="visibleEntries.length === 0"
        :data-testid="`${testIdPrefix}-no-match`"
        class="px-2 py-3 text-sm text-muted-foreground"
      >
        {{ t('avatar_templates.form.catalogue.noMatch') }}
      </p>

      <ul v-else role="listbox" class="flex max-h-72 flex-col gap-1 overflow-y-auto">
        <li v-for="candidate in visibleEntries" :key="candidate.id" role="none">
          <button
            type="button"
            role="option"
            :aria-selected="candidate.id === modelValue"
            :data-testid="`${testIdPrefix}-item-${candidate.id}`"
            :class="
              cn(
                'flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent-dark hover:text-white hover:**:text-white',
                candidate.id === modelValue && 'bg-primary/10'
              )
            "
            @click="onSelect(candidate.id)"
          >
            <span class="flex min-w-0 flex-col">
              <span class="flex items-center gap-2">
                <CheckIcon
                  v-if="candidate.id === modelValue"
                  class="size-4 shrink-0 text-primary"
                  aria-hidden="true"
                  :data-testid="`${testIdPrefix}-selected-mark-${candidate.id}`"
                />
                <span class="truncate font-medium">{{ candidate.label }}</span>
                <span
                  v-if="candidate.italian !== null"
                  :data-testid="`${testIdPrefix}-italian-badge-${candidate.id}`"
                  :class="
                    cn(
                      'shrink-0 rounded-full px-2 text-xs',
                      candidate.italian === 'native'
                        ? 'bg-primary/10 text-primary'
                        : 'bg-muted text-muted-foreground'
                    )
                  "
                >
                  {{
                    candidate.italian === 'native'
                      ? t('avatar_templates.form.catalogue.italianNative')
                      : t('avatar_templates.form.catalogue.italianMultilingual')
                  }}
                </span>
              </span>
              <span class="truncate text-xs text-muted-foreground">
                {{ describe(candidate) }}
              </span>
              <span class="truncate font-mono text-xs text-muted-foreground">
                {{ candidate.id }}
              </span>
            </span>

            <img
              v-if="resource !== 'voice' && candidate.preview_image_url !== null"
              :src="candidate.preview_image_url"
              :alt="candidate.label"
              :data-testid="`${testIdPrefix}-thumb-${candidate.id}`"
              class="size-10 shrink-0 rounded object-cover"
              loading="lazy"
            />
          </button>
          <button
            v-if="resource === 'voice' && candidate.preview_audio_url !== null"
            type="button"
            :data-testid="`${testIdPrefix}-play-${candidate.id}`"
            :aria-label="
              playingId === candidate.id
                ? t('avatar_templates.form.catalogue.preview.pause')
                : t('avatar_templates.form.catalogue.preview.play')
            "
            class="ml-2 rounded p-1 text-muted-foreground hover:bg-primary/10"
            @click="togglePreview(candidate)"
          >
            <PauseIcon v-if="playingId === candidate.id" class="size-4" />
            <PlayIcon v-else class="size-4" />
          </button>
        </li>
      </ul>
    </div>

    <!--
      Selected-avatar preview. Explicit 160px floors as attributes AND inline
      style: a utility class alone can be overridden by a parent layout, and a
      flex/grid child with `w-full` had been shrinking this below what an
      operator can judge a face from.
    -->
    <template v-if="showsImagePreview">
      <img
        v-if="previewUrl !== null"
        :key="previewUrl"
        :src="previewUrl"
        :alt="t('avatar_templates.form.catalogue.previewAlt', { name: selected?.label ?? '' })"
        :data-testid="`${testIdPrefix}-preview-image`"
        :width="PREVIEW_MIN_PX"
        :height="PREVIEW_MIN_PX"
        :style="previewStyle"
        class="rounded-lg border border-border object-cover"
        @error="failedImages.add(previewUrl)"
      />
      <div
        v-else
        :data-testid="`${testIdPrefix}-preview-fallback`"
        :style="previewStyle"
        class="flex items-center justify-center rounded-lg border border-dashed border-border bg-muted text-xs text-muted-foreground"
      >
        {{ t('avatar_templates.form.catalogue.previewFallback') }}
      </div>
    </template>

    <!--
      One shared, hidden element — never per-entry. No <track>: this plays a
      short, wordless provider voice SAMPLE, not interview content.
    -->
    <!-- eslint-disable-next-line vuejs-accessibility/media-has-caption -->
    <audio ref="audioRef" class="hidden" @ended="playingId = null" />
  </div>
</template>

<script setup lang="ts">
/**
 * The provider-catalogue picker.
 *
 * Selecting an entry and typing an id by hand (only while the provider is
 * down) both emit `change` with the plain string `AvatarTemplateForm`'s
 * `onFieldChange()` already knows how to write, so this component owns no
 * write path of its own and "clearing drops the key" holds by construction.
 *
 * It also reports what the catalogue holds (`loaded`): the ids when the list is
 * trustworthy, `null` when it is not (still loading, or a provider error). The
 * form uses that to refuse an id the provider does not have BEFORE the round
 * trip, without ever blocking a save just because the provider is down.
 */
import { computed, onMounted, reactive, ref, useAttrs, watch } from 'vue'
import { CheckIcon, ChevronDownIcon, PauseIcon, PlayIcon } from '@lucide/vue'
import CheckboxField from '@/components/molecules/CheckboxField.vue'
import { formControlClass, formSelectClass } from '@/components/ui/form-control'
import { cn } from '@/lib/utils'
import { useAvatarTemplates } from '@/composables/useAvatarTemplates'
import { useExclusivePopover } from '@/composables/useExclusivePopover'
import type {
  CatalogueEntry,
  CatalogueErrorCode,
  CatalogueProvider,
  CatalogueResource,
  FieldSpec,
} from '@/types/avatar-template'

defineOptions({ inheritAttrs: false })

const PREVIEW_MIN_PX = 160
const previewStyle = `min-width: ${PREVIEW_MIN_PX}px; min-height: ${PREVIEW_MIN_PX}px; width: ${PREVIEW_MIN_PX}px; height: ${PREVIEW_MIN_PX}px`

const props = defineProps<{
  field: FieldSpec
  provider: CatalogueProvider
  modelValue: string
}>()

const emit = defineEmits<{
  (e: 'change', value: string): void
  (e: 'loaded', ids: string[] | null): void
}>()

const { t } = useI18n()
const { fetchCatalogue } = useAvatarTemplates()
const attrs = useAttrs()

const rootRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLButtonElement | null>(null)
const audioRef = ref<HTMLAudioElement | null>(null)
const { isOpen, close, toggle } = useExclusivePopover(rootRef)

const resource = computed<CatalogueResource>(() => props.field.catalogue_resource ?? 'voice')
const testIdPrefix = computed(() => `template-config-${props.field.key}`)
const panelId = computed(() => `${testIdPrefix.value}-panel`)

type State = 'loading' | 'ok' | 'empty' | 'provider_error'

const entries = ref<CatalogueEntry[]>([])
const state = ref<State>('loading')
const errorCode = ref<CatalogueErrorCode>('provider_unreachable')
const searchTerm = ref('')
const italianOnly = ref(false)
const playingId = ref<string | null>(null)
const failedImages = reactive(new Set<string>())

const loaded = computed(() => state.value === 'ok' || state.value === 'empty')

// Monotonic request token. A provider switch mid-flight must not let the slow
// answer for the OLD provider overwrite the list for the new one.
let requestSeq = 0

async function load(): Promise<void> {
  const seq = (requestSeq += 1)
  state.value = 'loading'
  entries.value = []
  emit('loaded', null)

  try {
    const response = await fetchCatalogue(props.provider, resource.value)
    if (seq !== requestSeq) return

    entries.value = response.items
    state.value = response.status
    if (response.status === 'provider_error') {
      errorCode.value = response.code ?? 'provider_unreachable'
    }
  } catch {
    if (seq !== requestSeq) return

    // A transport failure degrades exactly like the API's own provider error.
    entries.value = []
    errorCode.value = 'provider_unreachable'
    state.value = 'provider_error'
  }

  emit('loaded', loaded.value ? entries.value.map((entry) => entry.id) : null)
}

onMounted(load)
watch(() => [props.provider, resource.value], load)

const selected = computed(
  () => entries.value.find((candidate) => candidate.id === props.modelValue) ?? null
)

const visibleEntries = computed(() => {
  const term = searchTerm.value.trim().toLowerCase()

  return entries.value.filter((candidate) => {
    if (italianOnly.value && candidate.italian !== 'native') return false
    if (term === '') return true

    return [
      candidate.label,
      candidate.name,
      candidate.language,
      candidate.locale,
      candidate.accent,
      candidate.id,
    ].some((part) => typeof part === 'string' && part.toLowerCase().includes(term))
  })
})

function describe(candidate: CatalogueEntry): string {
  return [
    t(`avatar_templates.provider.${candidate.provider}`),
    candidate.locale ?? candidate.language,
    candidate.accent,
  ]
    .filter((part): part is string => typeof part === 'string' && part !== '')
    .join(' · ')
}

const showsImagePreview = computed(
  () => resource.value !== 'voice' && props.modelValue !== '' && selected.value !== null
)

const previewUrl = computed(() => {
  const url = selected.value?.preview_image_url ?? null

  return url !== null && !failedImages.has(url) ? url : null
})

function onSelect(value: string): void {
  emit('change', value)
  close()
  triggerRef.value?.focus()
}

function onEscape(): void {
  if (!isOpen.value) return
  close()
  triggerRef.value?.focus()
}

function togglePreview(candidate: CatalogueEntry): void {
  const audio = audioRef.value
  if (audio === null || candidate.preview_audio_url === null) return

  if (playingId.value === candidate.id) {
    audio.pause()
    playingId.value = null

    return
  }

  audio.src = candidate.preview_audio_url
  playingId.value = candidate.id

  // happy-dom has no media pipeline: `.play()` may reject or be absent. A
  // rejection must neither surface as an unhandled rejection nor leave the
  // button stuck on "playing".
  const playResult = audio.play?.()
  if (typeof playResult?.catch === 'function') {
    playResult.catch(() => {
      playingId.value = null
    })
  }
}
</script>
