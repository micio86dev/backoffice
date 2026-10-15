<template>
  <form :data-testid="`${testIdPrefix}-form`" novalidate @submit.prevent="onSubmit">
    <FormFieldset :disabled="saving">
      <FieldGroup>
        <div>
          <h3 class="text-base font-medium">{{ $t(`${i18nPrefix}.title`) }}</h3>
          <p :id="`${testIdPrefix}-description`" class="text-sm text-muted-foreground">
            {{ $t(`${i18nPrefix}.description`) }}
          </p>
        </div>

        <Tabs v-model="activeLocale">
          <TabsList>
            <TabsTrigger
              v-for="locale in LOCALES"
              :key="locale"
              :value="locale"
              :data-testid="`${testIdPrefix}-tab-${locale}`"
            >
              {{ $t(`settings.platform.phraseLocale.${locale}`) }}
              <!-- Errors in a hidden tab must not be invisible: dot for sight, words for the rest. -->
              <template v-if="errors[locale]">
                <span class="size-2 rounded-full bg-destructive" aria-hidden="true" />
                <span class="sr-only" :data-testid="`${testIdPrefix}-tab-${locale}-error`">
                  {{ $t('settings.platform.phraseTabError') }}
                </span>
              </template>
            </TabsTrigger>
          </TabsList>

          <!-- Force-mounted: every textarea stays in the DOM (hidden), so nothing is lost on a switch. -->
          <TabsContent v-for="locale in LOCALES" :key="locale" :value="locale" force-mount>
            <Field :data-invalid="Boolean(errors[locale])">
              <FieldLabel :for="`${testIdPrefix}-${locale}`">
                {{ $t(`${i18nPrefix}.label.${locale}`) }}
              </FieldLabel>
              <Textarea
                :id="`${testIdPrefix}-${locale}`"
                v-model="values[locale]"
                rows="4"
                :aria-invalid="Boolean(errors[locale]) || isOver(locale)"
                :aria-describedby="describedBy(locale)"
                :data-testid="`${testIdPrefix}-${locale}`"
              />
              <FieldDescription :id="`${testIdPrefix}-${locale}-help`">
                {{ $t(`${i18nPrefix}.help.${locale}`) }}
              </FieldDescription>
              <p
                :id="`${testIdPrefix}-${locale}-counter`"
                :class="['text-sm', isOver(locale) ? 'text-destructive' : 'text-muted-foreground']"
                :data-testid="`${testIdPrefix}-${locale}-counter`"
              >
                {{
                  $t(`${i18nPrefix}.counter`, {
                    count: length(locale),
                    max: MAX_CHARACTERS,
                    seconds: seconds(locale),
                  })
                }}
                <!-- Words as well as colour: WCAG 1.4.1. -->
                <strong v-if="isOver(locale)">
                  {{ $t(`${i18nPrefix}.overBy`, { over: length(locale) - MAX_CHARACTERS }) }}
                </strong>
              </p>
              <FieldError
                v-if="errors[locale]"
                :id="`${testIdPrefix}-${locale}-error`"
                :data-testid="`${testIdPrefix}-${locale}-error`"
              >
                {{ errors[locale] }}
              </FieldError>
            </Field>
          </TabsContent>
        </Tabs>

        <FormMessage
          v-if="formMessage"
          :kind="formMessage.kind"
          :text="formMessage.text"
          :test-id="`${testIdPrefix}-banner`"
        />

        <div class="flex gap-2">
          <Button
            type="submit"
            :loading="saving"
            :disabled="!loaded"
            :data-testid="`${testIdPrefix}-submit`"
          >
            {{ $t('projects.action.save') }}
          </Button>
          <Button
            type="button"
            variant="outline"
            :disabled="!loaded"
            :data-testid="`${testIdPrefix}-clear`"
            @click="confirmingClear = true"
          >
            {{ $t(`${i18nPrefix}.clear`) }}
          </Button>
        </div>
      </FieldGroup>
    </FormFieldset>

    <ConfirmDialog
      :open="confirmingClear"
      variant="destructive"
      :title="$t(`${i18nPrefix}.clearConfirmTitle`)"
      :description="$t(`${i18nPrefix}.clearConfirmDescription`)"
      :confirm-label="$t(`${i18nPrefix}.clear`)"
      @confirm="onClearConfirmed"
      @cancel="confirmingClear = false"
    />
  </form>
</template>

<script setup lang="ts">
/**
 * InterviewPhraseForm — one platform-wide spoken phrase, one textarea per locale.
 *
 * Shared by the intro (before the first question) and the closing greeting
 * (after the last): same limits, same live duration estimate, same clear flow.
 * Everything that differs is a prop — the API field, the i18n prefix, the
 * test-id prefix and the save function — so the two forms cannot drift.
 * Each save PATCHes its own field only, never the caps or the other phrase.
 */
import { reactive, ref, watch } from 'vue'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FormFieldset } from '@/components/ui/form-fieldset'
import ConfirmDialog from '@/components/molecules/ConfirmDialog.vue'
import FormMessage, { type FormMessageKind } from '@/components/molecules/FormMessage.vue'
import type {
  InterviewIntroPhrase,
  StoredInterviewIntroPhrase,
} from '@/composables/usePlatformSettings'
import { applyServerFieldErrors } from '@/utils/http-error'

/**
 * The intro and the closing greeting share one API shape, so the intro's
 * generated types stand for both; each wrapper's typecheck proves its own
 * field still matches.
 */
export type PhrasePayload = InterviewIntroPhrase
export type StoredPhrase = StoredInterviewIntroPhrase | undefined

const props = defineProps<{
  /** The API field, e.g. `interview_intro_phrase`; keys the server-error mapping. */
  field: string
  /** i18n prefix holding title, description, label, help, counter and messages. */
  i18nPrefix: string
  /** Prefix of every `data-testid` and element id. */
  testIdPrefix: string
  /** The stored map, or null when nothing is set. */
  initial: StoredPhrase
  /** Withheld until the stored value has been read, as for the caps. */
  loaded: boolean
  /** PATCHes this field only; resolves to the stored value the server answers with. */
  save: (phrase: PhrasePayload) => Promise<StoredPhrase>
}>()

const emit = defineEmits<{ (e: 'saved'): void }>()

const { t } = useI18n()

type Locale = 'en' | 'it'
const LOCALES: readonly Locale[] = ['en', 'it']

/** Mirrors the API's cap. */
const MAX_CHARACTERS = 3600
/** Rough speaking rate used for the estimate only; the API never sees it. */
const CHARACTERS_PER_SECOND = 15

const activeLocale = ref<Locale>('en')
const values = reactive<Record<Locale, string>>({ en: '', it: '' })
const errors = ref<Partial<Record<Locale, string>>>({})
const formMessage = ref<{ kind: FormMessageKind; text: string } | null>(null)
const saving = ref(false)
const confirmingClear = ref(false)

function seed(phrase: StoredPhrase): void {
  values.en = phrase?.en ?? ''
  values.it = phrase?.it ?? ''
}

watch(() => props.initial, seed, { immediate: true })

// Code points, not UTF-16 units: the API counts characters, and an emoji is one.
// Trimmed, because the trimmed value is what onSubmit sends.
const length = (locale: Locale): number => Array.from(values[locale].trim()).length
const isOver = (locale: Locale): boolean => length(locale) > MAX_CHARACTERS
const seconds = (locale: Locale): number => Math.ceil(length(locale) / CHARACTERS_PER_SECOND)

/** Error first, then the hint, then the live counter. */
function describedBy(locale: Locale): string {
  const id = `${props.testIdPrefix}-${locale}`
  return [errors.value[locale] ? `${id}-error` : null, `${id}-help`, `${id}-counter`]
    .filter((part): part is string => part !== null)
    .join(' ')
}

/** Switch to the first locale with an error, so one in a hidden tab is seen. */
function revealFirstError(): void {
  const first = LOCALES.find((locale) => errors.value[locale])
  if (first) activeLocale.value = first
}

function validate(): boolean {
  const next: Partial<Record<Locale, string>> = {}

  for (const locale of LOCALES) {
    if (isOver(locale)) {
      next[locale] = t(`${props.i18nPrefix}.tooLong`, { max: MAX_CHARACTERS })
    }
  }
  if (values.en.trim() === '' && values.it.trim() !== '') {
    next.en = t(`${props.i18nPrefix}.enRequired`)
  }

  errors.value = next
  revealFirstError()
  return Object.keys(next).length === 0
}

async function persist(phrase: PhrasePayload, successKey: string): Promise<void> {
  saving.value = true

  try {
    // The server's answer is the only account of what is stored now.
    seed(await props.save(phrase))
    formMessage.value = { kind: 'success', text: t(`${props.i18nPrefix}.${successKey}`) }
    emit('saved')
  } catch (submitError) {
    let mapped = false
    const unmapped = applyServerFieldErrors(
      submitError,
      { [`${props.field}.en`]: 'en', [`${props.field}.it`]: 'it' } as Record<string, Locale>,
      (key, msg) => {
        mapped = true
        errors.value[key] = msg
      }
    )
    revealFirstError()

    // Banner only for what no control could show: suppressed when every key
    // was mapped, generic when the rejection had no field errors at all.
    if (unmapped === null || unmapped.length > 0 || !mapped) {
      formMessage.value = {
        kind: 'error',
        text:
          unmapped !== null && unmapped.length > 0
            ? unmapped.join(' ')
            : t(`${props.i18nPrefix}.saveFailed`),
      }
    }
  } finally {
    saving.value = false
  }
}

async function onSubmit(): Promise<void> {
  // A form also submits on Enter, with no button involved.
  if (!props.loaded) return

  formMessage.value = null
  if (!validate()) return

  const en = values.en.trim()
  const it = values.it.trim()

  // Both blank is a clear, not an error: the setting is optional.
  const phrase: PhrasePayload = en === '' ? null : it === '' ? { en } : { en, it }

  await persist(phrase, 'saved')
}

async function onClearConfirmed(): Promise<void> {
  confirmingClear.value = false
  formMessage.value = null
  errors.value = {}

  await persist(null, 'cleared')
}
</script>
