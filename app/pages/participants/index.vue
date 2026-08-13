<template>
  <div class="flex flex-col gap-6">
    <PageHeader :title="$t('participants.title')" :subtitle="$t('participants.subtitle')" />
    <Alert
      v-if="loadError"
      :variant="loadError === 'not-ready' ? 'default' : 'destructive'"
      :data-state="loadError"
      data-testid="participants-error"
    >
      <AlertTitle>{{ $t(loadErrorTitleKey) }}</AlertTitle>
      <AlertDescription>{{ $t(loadErrorMessageKey) }}</AlertDescription>
    </Alert>
    <CandidateTable
      v-else
      :participants="participants"
      :meta="meta"
      :filters="filters"
      @update:filters="onFiltersChange"
      @update:page="onPageChange"
    />
  </div>
</template>

<script setup lang="ts">
import PageHeader from '@/components/molecules/PageHeader.vue'
import { ref, computed, onMounted } from 'vue'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import CandidateTable, {
  type CandidateTableFilters,
  type CandidateTableMeta,
  type CandidateTableParticipant,
} from '@/components/organisms/CandidateTable.vue'
import { useParticipants } from '@/composables/useParticipants'
import {
  resolveResourceErrorState,
  resourceErrorKey,
  type ResourceErrorState,
} from '@/utils/error-state'

definePageMeta({
  name: 'participants',
})

const { t } = useI18n()

useHead({
  // A <title> is user-facing (browser tab, bookmark, window switcher, and the
  // first thing a screen reader announces on navigation) — it goes through
  // i18n like every other user-facing string.
  title: () => t('head.title.participants'),
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})

const { listParticipants } = useParticipants()

const participants = ref<CandidateTableParticipant[]>([])
const meta = ref<CandidateTableMeta | null>(null)
const filters = ref<CandidateTableFilters>({ status: '', q: '' })
const page = ref(1)

// A failed list fetch must NEVER fall through to the table's empty state:
// "No candidates match the current filters" is indistinguishable from a
// genuinely empty result set, so a 403 would be reported to the operator as
// success-with-no-rows (D4).
const loadError = ref<ResourceErrorState | null>(null)

const loadErrorTitleKey = computed(() => resourceErrorKey(loadError.value ?? 'error', 'title'))
const loadErrorMessageKey = computed(() => resourceErrorKey(loadError.value ?? 'error', 'message'))

async function load(): Promise<void> {
  try {
    const response = await listParticipants({
      page: page.value,
      status: filters.value.status || undefined,
      q: filters.value.q || undefined,
    })
    participants.value = response.data
    meta.value = response.meta
    loadError.value = null
  } catch (error) {
    loadError.value = resolveResourceErrorState(error)
  }
}

function onFiltersChange(next: CandidateTableFilters): void {
  filters.value = next
  page.value = 1
  void load()
}

function onPageChange(next: number): void {
  page.value = next
  void load()
}

onMounted(() => {
  void load()
})
</script>
