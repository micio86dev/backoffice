<template>
  <InterviewPhraseForm
    field="interview_closing_phrase"
    i18n-prefix="settings.platform.closingPhrase"
    test-id-prefix="closing-phrase"
    :initial="initial"
    :loaded="loaded"
    :save="save"
    @saved="emit('saved')"
  />
</template>

<script setup lang="ts">
/**
 * InterviewClosingPhraseForm — what the avatar says after the last question.
 *
 * Spoken once, right before the standard final phrase ends the interview.
 * Only ever PATCHes `interview_closing_phrase`.
 */
import InterviewPhraseForm from '@/components/organisms/InterviewPhraseForm.vue'
import {
  usePlatformSettings,
  type InterviewClosingPhrase,
  type StoredInterviewClosingPhrase,
} from '@/composables/usePlatformSettings'

defineProps<{
  /** The stored map, or null when no closing greeting is set. */
  initial: StoredInterviewClosingPhrase | undefined
  loaded: boolean
}>()

const emit = defineEmits<{ (e: 'saved'): void }>()

const { updateInterviewClosingPhrase } = usePlatformSettings()

async function save(
  phrase: InterviewClosingPhrase
): Promise<StoredInterviewClosingPhrase | undefined> {
  return (await updateInterviewClosingPhrase(phrase)).data.interview_closing_phrase
}
</script>
