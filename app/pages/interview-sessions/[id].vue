<template>
  <div class="flex flex-col gap-8">
    <PageHeader :title="$t('review.title')" :subtitle="$t('review.subtitle')" />

    <Alert
      v-if="loadError"
      :variant="loadError === 'not-ready' ? 'default' : 'destructive'"
      :data-state="loadError"
      data-testid="review-error"
    >
      <AlertTitle>{{ $t(loadErrorTitleKey) }}</AlertTitle>
      <AlertDescription>{{ $t(loadErrorMessageKey) }}</AlertDescription>
    </Alert>

    <SessionReviewPanel v-else-if="review" :review="review" :locale="locale" />
  </div>
</template>

<script setup lang="ts">
/**
 * Interview session review (C11).
 *
 * A view of its own rather than a panel on the participant detail: a
 * participant has one session per competency, and folding N proctoring
 * timelines into a page that already carries a lifecycle timeline, a
 * transcript and a BARS report makes all four harder to read (design D11).
 */
import { ref, computed, onMounted } from 'vue'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import PageHeader from '@/components/molecules/PageHeader.vue'
import SessionReviewPanel from '@/components/organisms/SessionReviewPanel.vue'
import { useSessionReview, type SessionReview } from '@/composables/useSessionReview'
import {
  resolveResourceErrorState,
  resourceErrorKey,
  type ResourceErrorState,
} from '@/utils/error-state'

definePageMeta({ name: 'interview-session-review' })

const { t, locale } = useI18n()
const route = useRoute()

useHead({
  title: () => t('head.title.review'),
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})

const { fetchReview } = useSessionReview()

const review = ref<SessionReview | null>(null)
const loadError = ref<ResourceErrorState | null>(null)

const loadErrorTitleKey = computed(() => resourceErrorKey(loadError.value ?? 'error', 'title'))
const loadErrorMessageKey = computed(() => resourceErrorKey(loadError.value ?? 'error', 'message'))

onMounted(async () => {
  try {
    review.value = (await fetchReview(String(route.params.id))).data
    loadError.value = null
  } catch (error) {
    // A failed review must never fall through to an empty panel: that would
    // report a 403 as "this session had no events", which is a different and
    // much worse claim.
    loadError.value = resolveResourceErrorState(error)
  }
})
</script>
