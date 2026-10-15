<template>
  <InterviewPhraseForm
    field="interview_intro_phrase"
    i18n-prefix="settings.platform.introPhrase"
    test-id-prefix="intro-phrase"
    :initial="initial"
    :loaded="loaded"
    :save="save"
    @saved="emit('saved')"
  />
</template>

<script setup lang="ts">
/**
 * InterviewIntroPhraseForm — what the avatar says before the first question.
 *
 * Spoken once, at the true start of every interview, and it COUNTS against the
 * interview time limit. Only ever PATCHes `interview_intro_phrase`.
 */
import InterviewPhraseForm from '@/components/organisms/InterviewPhraseForm.vue'
import {
  usePlatformSettings,
  type InterviewIntroPhrase,
  type StoredInterviewIntroPhrase,
} from '@/composables/usePlatformSettings'

defineProps<{
  /** The stored map, or null when no intro is set. */
  initial: StoredInterviewIntroPhrase | undefined
  loaded: boolean
}>()

const emit = defineEmits<{ (e: 'saved'): void }>()

const { updateInterviewIntroPhrase } = usePlatformSettings()

async function save(phrase: InterviewIntroPhrase): Promise<StoredInterviewIntroPhrase | undefined> {
  return (await updateInterviewIntroPhrase(phrase)).data.interview_intro_phrase
}
</script>
