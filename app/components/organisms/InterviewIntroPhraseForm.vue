<template>
  <form data-testid="intro-phrase-form" novalidate @submit.prevent="onSubmit">
    <FormFieldset :disabled="saving">
      <FieldGroup>
        <div>
          <h3 class="text-base font-medium">{{ $t('settings.platform.introPhrase.title') }}</h3>
          <p id="intro-phrase-description" class="text-sm text-muted-foreground">
            {{ $t('settings.platform.introPhrase.description') }}
          </p>
        </div>

        <Field v-for="locale in LOCALES" :key="locale" :data-invalid="Boolean(errors[locale])">
          <FieldLabel :for="`intro-phrase-${locale}`">
            {{ $t(`settings.platform.introPhrase.label.${locale}`) }}
          </FieldLabel>
          <Textarea
            :id="`intro-phrase-${locale}`"
            v-model="values[locale]"
            rows="4"
            :aria-invalid="Boolean(errors[locale]) || isOver(locale)"
            :aria-describedby="describedBy(locale)"
            :data-testid="`intro-phrase-${locale}`"
          />
          <FieldDescription :id="`intro-phrase-${locale}-help`">
            {{ $t(`settings.platform.introPhrase.help.${locale}`) }}
          </FieldDescription>
          <p
            :id="`intro-phrase-${locale}-counter`"
            :class="['text-sm', isOver(locale) ? 'text-destructive' : 'text-muted-foreground']"
            :data-testid="`intro-phrase-${locale}-counter`"
          >
            {{
              $t('settings.platform.introPhrase.counter', {
                count: length(locale),
                max: MAX_CHARACTERS,
                seconds: seconds(locale),
              })
            }}
            <!-- Words as well as colour: WCAG 1.4.1. -->
            <strong v-if="isOver(locale)">
              {{
                $t('settings.platform.introPhrase.overBy', {
                  over: length(locale) - MAX_CHARACTERS,
                })
              }}
            </strong>
          </p>
          <FieldError
            v-if="errors[locale]"
            :id="`intro-phrase-${locale}-error`"
            :data-testid="`intro-phrase-${locale}-error`"
          >
            {{ errors[locale] }}
          </FieldError>
        </Field>

        <FormMessage
          v-if="formMessage"
          :kind="formMessage.kind"
          :text="formMessage.text"
          test-id="intro-phrase-banner"
        />

        <div class="flex gap-2">
          <Button
            type="submit"
            :loading="saving"
            :disabled="!loaded"
            data-testid="intro-phrase-submit"
          >
            {{ $t('projects.action.save') }}
          </Button>
          <Button
            type="button"
            variant="outline"
            :disabled="!loaded"
            data-testid="intro-phrase-clear"
            @click="confirmingClear = true"
          >
            {{ $t('settings.platform.introPhrase.clear') }}
          </Button>
        </div>
      </FieldGroup>
    </FormFieldset>

    <ConfirmDialog
      :open="confirmingClear"
      variant="destructive"
      :title="$t('settings.platform.introPhrase.clearConfirmTitle')"
      :description="$t('settings.platform.introPhrase.clearConfirmDescription')"
      :confirm-label="$t('settings.platform.introPhrase.clear')"
      @confirm="onClearConfirmed"
      @cancel="confirmingClear = false"
    />
  </form>
</template>

<script setup lang="ts">
/**
 * InterviewIntroPhraseForm — what the avatar says before the first question.
 *
 * Spoken once, at the true start of every interview, and it COUNTS against the
 * interview time limit — hence the live duration estimate and the hard cap.
 * This form only ever PATCHes `interview_intro_phrase`, never the question
 * caps, so saving a phrase cannot overwrite a cap the operator never touched.
 */
import { reactive, ref, watch } from 'vue'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { FormFieldset } from '@/components/ui/form-fieldset'
import ConfirmDialog from '@/components/molecules/ConfirmDialog.vue'
import FormMessage, { type FormMessageKind } from '@/components/molecules/FormMessage.vue'
import {
  usePlatformSettings,
  type InterviewIntroPhrase,
  type StoredInterviewIntroPhrase,
} from '@/composables/usePlatformSettings'
import { applyServerFieldErrors } from '@/utils/http-error'

const props = defineProps<{
  /** The stored map, or null when no intro is set. */
  initial: StoredInterviewIntroPhrase | undefined
  /** Withheld until the stored value has been read, as for the caps. */
  loaded: boolean
}>()

const emit = defineEmits<{ (e: 'saved'): void }>()

const { updateInterviewIntroPhrase } = usePlatformSettings()
const { t } = useI18n()

type Locale = 'en' | 'it'
const LOCALES: readonly Locale[] = ['en', 'it']

/** Mirrors the API's cap. */
const MAX_CHARACTERS = 600
/** Rough speaking rate used for the estimate only; the API never sees it. */
const CHARACTERS_PER_SECOND = 15

const values = reactive<Record<Locale, string>>({ en: '', it: '' })
const errors = ref<Partial<Record<Locale, string>>>({})
const formMessage = ref<{ kind: FormMessageKind; text: string } | null>(null)
const saving = ref(false)
const confirmingClear = ref(false)

function seed(phrase: StoredInterviewIntroPhrase | undefined): void {
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
  return [
    errors.value[locale] ? `intro-phrase-${locale}-error` : null,
    `intro-phrase-${locale}-help`,
    `intro-phrase-${locale}-counter`,
  ]
    .filter((id): id is string => id !== null)
    .join(' ')
}

function validate(): boolean {
  const next: Partial<Record<Locale, string>> = {}

  for (const locale of LOCALES) {
    if (isOver(locale)) {
      next[locale] = t('settings.platform.introPhrase.tooLong', { max: MAX_CHARACTERS })
    }
  }
  if (values.en.trim() === '' && values.it.trim() !== '') {
    next.en = t('settings.platform.introPhrase.enRequired')
  }

  errors.value = next
  return Object.keys(next).length === 0
}

const SERVER_FIELD_TO_ERROR_KEY = {
  'interview_intro_phrase.en': 'en',
  'interview_intro_phrase.it': 'it',
} as const

async function save(phrase: InterviewIntroPhrase, successKey: string): Promise<void> {
  saving.value = true

  try {
    const response = await updateInterviewIntroPhrase(phrase)

    // The server's answer is the only account of what is stored now.
    seed(response.data.interview_intro_phrase)
    formMessage.value = { kind: 'success', text: t(successKey) }
    emit('saved')
  } catch (submitError) {
    let mapped = false
    const unmapped = applyServerFieldErrors(submitError, SERVER_FIELD_TO_ERROR_KEY, (key, msg) => {
      mapped = true
      errors.value[key] = msg
    })

    // Banner only for what no control could show: suppressed when every key
    // was mapped, generic when the rejection had no field errors at all.
    if (unmapped === null || unmapped.length > 0 || !mapped) {
      formMessage.value = {
        kind: 'error',
        text:
          unmapped !== null && unmapped.length > 0
            ? unmapped.join(' ')
            : t('settings.platform.introPhrase.saveFailed'),
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
  const phrase: InterviewIntroPhrase = en === '' ? null : it === '' ? { en } : { en, it }

  await save(phrase, 'settings.platform.introPhrase.saved')
}

async function onClearConfirmed(): Promise<void> {
  confirmingClear.value = false
  formMessage.value = null
  errors.value = {}

  await save(null, 'settings.platform.introPhrase.cleared')
}
</script>
