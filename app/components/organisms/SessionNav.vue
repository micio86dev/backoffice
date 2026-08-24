<template>
  <nav
    v-if="sessions.length > 1"
    class="flex flex-wrap items-center gap-2"
    :aria-label="$t('review.sessions.nav')"
    data-testid="session-nav"
  >
    <template v-for="session in orderedSessions" :key="session.id">
      <Button
        v-if="session.id === currentSessionId"
        variant="default"
        size="sm"
        disabled
        aria-current="page"
        :aria-label="$t('review.sessions.current', { competency: session.competency_code })"
        :data-testid="`session-nav-current-${session.id}`"
      >
        {{ session.competency_code }}
      </Button>
      <Button v-else as-child variant="outline" size="sm">
        <NuxtLink
          :to="`/interview-sessions/${session.id}`"
          :data-testid="`session-nav-${session.id}`"
        >
          {{ session.competency_code }}
        </NuxtLink>
      </Button>
    </template>
  </nav>
</template>

<script setup lang="ts">
/**
 * A compact switcher between the sibling sessions of the same interview
 * (operator-participant-visibility follow-up) — one row per competency, the
 * current one shown as a disabled, visually distinct pill rather than a link
 * to itself.
 *
 * Deliberately absent when there is only one session: a nav with a single,
 * disabled entry is chrome with no function.
 */
import { computed } from 'vue'
import { Button } from '@/components/ui/button'
import type { SessionSummary } from '@/composables/useSessionReview'

const props = defineProps<{
  sessions: SessionSummary[]
  currentSessionId: number
}>()

// `question_index` is the project's own delivery order — the order a
// candidate actually sat these competencies in, not creation order or an
// alphabetical competency_code sort.
const orderedSessions = computed(() =>
  [...props.sessions].sort((a, b) => a.question_index - b.question_index)
)
</script>
