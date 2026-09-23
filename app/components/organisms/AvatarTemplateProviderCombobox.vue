<template>
  <ComboboxRoot
    :ignore-filter="true"
    :open="isOpen"
    class="flex flex-col gap-1"
    @update:open="isOpen = $event"
    @update:model-value="onSelect($event as string)"
  >
    <ComboboxAnchor>
      <ComboboxInput
        v-bind="attrs"
        :placeholder="t('avatar_templates.form.catalogue.searchPlaceholder')"
        :model-value="searchTerm"
        autocomplete="off"
        @update:model-value="onSearchInput($event)"
        @focus="isOpen = true"
      />
    </ComboboxAnchor>

    <ComboboxList>
      <div class="flex flex-col gap-2">
        <!-- eslint-disable-next-line vuejs-accessibility/form-control-has-label -->
        <select
          v-if="entries.length !== 0"
          v-model="languageFilter"
          :data-testid="`${testIdPrefix}-language-filter`"
          :aria-label="t('avatar_templates.form.catalogue.languageFilterLabel')"
          :class="formSelectClass"
        >
          <option value="all">{{ t('avatar_templates.form.catalogue.languageAll') }}</option>
          <option v-for="lang in availableLanguages" :key="lang" :value="lang">{{ lang }}</option>
        </select>

        <div
          v-if="showEmptyHint"
          :data-testid="`${testIdPrefix}-empty-hint`"
          class="px-2 py-3 text-sm text-muted-foreground"
        >
          {{ emptyHintText }}
        </div>

        <ComboboxViewport v-else>
          <ComboboxGroup>
            <ComboboxItem
              v-for="candidate in filteredEntries"
              :key="candidate.id"
              :data-testid="`${testIdPrefix}-item-${candidate.id}`"
              :value="candidate.id"
              :text-value="candidate.label"
              class="justify-between"
            >
              <span class="flex items-center gap-2 truncate">
                <span class="truncate">{{ candidate.label }}</span>
                <span v-if="candidate.language !== null" class="text-xs text-muted-foreground">
                  {{ candidate.language }}
                </span>
              </span>

              <img
                v-if="resource !== 'voice' && candidate.preview_image_url !== null"
                :src="candidate.preview_image_url"
                :alt="candidate.label"
                :data-testid="`${testIdPrefix}-thumb-${candidate.id}`"
                class="size-6 shrink-0 rounded object-cover"
              />

              <button
                v-if="resource === 'voice' && candidate.preview_audio_url !== null"
                type="button"
                :data-testid="`${testIdPrefix}-preview-${candidate.id}`"
                :aria-label="
                  playingId === candidate.id
                    ? t('avatar_templates.form.catalogue.preview.pause')
                    : t('avatar_templates.form.catalogue.preview.play')
                "
                class="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent"
                @click.stop.prevent="togglePreview(candidate)"
              >
                <PauseIcon v-if="playingId === candidate.id" class="size-4" />
                <PlayIcon v-else class="size-4" />
              </button>
            </ComboboxItem>
          </ComboboxGroup>
        </ComboboxViewport>
      </div>
    </ComboboxList>

    <!--
      One shared, hidden element — never per-entry, so an entry with no
      preview never renders a broken/empty <audio> tag of its own.

      No <track> is added: this plays a short, wordless provider voice
      SAMPLE (a preset preview, not spoken dialogue or interview content —
      the transcript/caption discipline `session review` owns applies to a
      candidate's actual answers, not to an operator sampling a voice preset
      before picking it), so there is no caption content to author.
    -->
    <!-- eslint-disable-next-line vuejs-accessibility/media-has-caption -->
    <audio ref="audioRef" class="hidden" @ended="playingId = null" />
  </ComboboxRoot>
</template>

<script setup lang="ts">
/**
 * The provider-catalogue picker (avatar-template-catalogue PR4, design
 * D5/D7). Built on PR3's `combobox` primitives.
 *
 * D7 — the reason this file exists in this exact shape: selecting a
 * catalogue entry and typing a value manually both emit `change` with the
 * plain string `AvatarTemplateForm.vue`'s existing `onFieldChange()` already
 * knows how to write (or drop, on empty). This component owns no write path
 * of its own — it never touches `draft.config` — so the "clearing drops the
 * key" contract stays satisfied by construction rather than by a second,
 * easy-to-drift implementation.
 *
 * D4 — the catalogue is fetched and filtered entirely client-side; a `null`
 * language (Tavus's voices/replicas carry no language field at all) never
 * matches a specific language filter. This is the direct fix for the bug
 * this whole feature exists to catch: a preset named "Alessandra" that is
 * actually tagged `language: "en"`.
 */
import { computed, onMounted, ref, useAttrs, watch } from 'vue'
import { PauseIcon, PlayIcon } from '@lucide/vue'
import {
  Combobox as ComboboxRoot,
  ComboboxAnchor,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxViewport,
} from '@/components/ui/combobox'
import { formSelectClass } from '@/components/ui/form-control'
import { useAvatarTemplates } from '@/composables/useAvatarTemplates'
import type { CatalogueEntry, FieldSpec, ProviderName } from '@/types/avatar-template'

defineOptions({ inheritAttrs: false })

const props = defineProps<{
  field: FieldSpec
  provider: ProviderName
  modelValue: string
}>()

const emit = defineEmits<{
  (e: 'change', value: string): void
}>()

const { t } = useI18n()
const { fetchCatalogue } = useAvatarTemplates()

// Everything the parent passes that is not a declared prop — id,
// data-testid, aria-invalid, aria-describedby, aria-required, the @blur
// listener — is forwarded onto the ACTUAL search/manual-entry <input>, the
// same element `template-config-${field.key}` names today for every other
// field type. `inheritAttrs: false` + this explicit forward is what keeps
// `wrapper.find('[data-testid="template-config-voiceId"]').setValue(...)`
// working identically to the plain-input branch it replaces.
const attrs = useAttrs()

const resource = computed(() => props.field.catalogue_resource)
const testIdPrefix = computed(() => `template-config-${props.field.key}`)

const entries = ref<CatalogueEntry[]>([])
const status = ref<'ok' | 'unavailable'>('ok')
const searchTerm = ref(props.modelValue)
const languageFilter = ref('all')
const isOpen = ref(false)
const playingId = ref<string | null>(null)
const audioRef = ref<HTMLAudioElement | null>(null)

// The operator may still be typing a value the catalogue never resolves
// (that is the whole point of the manual-entry fallback) — but if the field
// changes from OUTSIDE this component (provider switch, a different
// template loaded), the displayed text must follow it.
watch(
  () => props.modelValue,
  (value) => {
    if (value !== searchTerm.value) searchTerm.value = value
  }
)

onMounted(async () => {
  if (resource.value === undefined) {
    status.value = 'unavailable'

    return
  }

  try {
    const response = await fetchCatalogue(props.provider, resource.value)
    entries.value = response.items
    status.value = response.status
  } catch {
    // A frontend-side failure (network error, etc.) degrades exactly like
    // the API's own `status: 'unavailable'` — the picker falls back to
    // manual entry, it does not break the field.
    entries.value = []
    status.value = 'unavailable'
  }
})

const availableLanguages = computed(() => {
  const languages = new Set<string>()

  for (const candidate of entries.value) {
    if (candidate.language !== null) languages.add(candidate.language)
  }

  return Array.from(languages).sort()
})

function matchesSearch(candidate: CatalogueEntry): boolean {
  const term = searchTerm.value.trim().toLowerCase()

  return term === '' || candidate.label.toLowerCase().includes(term)
}

function matchesLanguage(candidate: CatalogueEntry): boolean {
  if (languageFilter.value === 'all') return true

  // D4: a `null`-language entry NEVER matches a specific language filter —
  // never treated as "matches everything".
  return candidate.language === languageFilter.value
}

const filteredEntries = computed(() =>
  entries.value.filter((candidate) => matchesSearch(candidate) && matchesLanguage(candidate))
)

const showEmptyHint = computed(
  () => status.value === 'unavailable' || filteredEntries.value.length === 0
)

const emptyHintText = computed(() =>
  status.value === 'unavailable'
    ? t('avatar_templates.form.catalogue.emptyUnavailable')
    : t('avatar_templates.form.catalogue.emptyForLanguage')
)

function onSearchInput(value: string): void {
  searchTerm.value = value
  isOpen.value = true
  emit('change', value)
}

function onSelect(value: string): void {
  searchTerm.value = value
  isOpen.value = false
  emit('change', value)
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

  // jsdom (unit tests) has no real media pipeline: `.play()` returns a
  // promise that rejects with "not implemented". A real browser resolves it.
  // Either way, a rejection here must not surface as an unhandled promise
  // rejection or leave the button stuck showing "playing".
  const playResult = audio.play()
  if (typeof playResult?.catch === 'function') {
    playResult.catch(() => {
      playingId.value = null
    })
  }
}
</script>
