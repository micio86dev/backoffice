<template>
  <div class="flex flex-col gap-6">
    <h1 class="text-2xl font-semibold text-foreground">{{ $t('participants.title') }}</h1>
    <CandidateTable
      :participants="participants"
      :meta="meta"
      :filters="filters"
      @update:filters="onFiltersChange"
      @update:page="onPageChange"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import CandidateTable, {
  type CandidateTableFilters,
  type CandidateTableMeta,
  type CandidateTableParticipant,
} from '@/components/organisms/CandidateTable.vue'
import { useParticipants } from '@/composables/useParticipants'

definePageMeta({
  name: 'participants',
})

useHead({
  title: 'Candidates',
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})

const { listParticipants } = useParticipants()

const participants = ref<CandidateTableParticipant[]>([])
const meta = ref<CandidateTableMeta | null>(null)
const filters = ref<CandidateTableFilters>({ status: '', q: '' })
const page = ref(1)

async function load(): Promise<void> {
  const response = await listParticipants({
    page: page.value,
    status: filters.value.status || undefined,
    q: filters.value.q || undefined,
  })
  participants.value = response.data as unknown as CandidateTableParticipant[]
  meta.value = response.meta
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
