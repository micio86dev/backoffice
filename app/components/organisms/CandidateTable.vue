<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-end gap-3">
      <Field>
        <FieldLabel for="candidate-search">{{ $t('participants.filters.search') }}</FieldLabel>
        <Input
          id="candidate-search"
          v-model="searchInput"
          :placeholder="$t('participants.filters.searchPlaceholder')"
          data-testid="candidate-search"
          @keyup.enter="onSearchSubmit"
        />
      </Field>
      <Field>
        <FieldLabel for="candidate-status">{{ $t('participants.filters.status') }}</FieldLabel>
        <select
          id="candidate-status"
          v-model="statusInput"
          data-testid="candidate-status-filter"
          class="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full min-w-40 rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3"
          @change="onStatusChange"
        >
          <option value="">{{ $t('participants.filters.allStatuses') }}</option>
          <option v-for="status in PARTICIPANT_STATUSES" :key="status" :value="status">
            {{ $t(`participants.status.${status}`) }}
          </option>
        </select>
      </Field>
    </div>

    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{{ $t('participants.table.candidate') }}</TableHead>
          <TableHead>{{ $t('participants.table.role') }}</TableHead>
          <TableHead>{{ $t('participants.table.status') }}</TableHead>
          <TableHead>{{ $t('participants.table.createdAt') }}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableEmpty v-if="participants.length === 0" :colspan="4">
          {{ $t('participants.table.empty') }}
        </TableEmpty>
        <TableRow v-for="participant in participants" :key="participant.id">
          <TableCell>
            <NuxtLink
              :to="`/participants/${participant.id}`"
              class="text-foreground font-medium hover:underline"
            >
              {{ participant.display_name }}
            </NuxtLink>
            <div class="text-muted-foreground text-xs">{{ participant.candidate_ref }}</div>
          </TableCell>
          <TableCell>{{ participant.role_code }}</TableCell>
          <TableCell>
            <StatusBadge :status="participant.status" />
          </TableCell>
          <TableCell>{{ formatDate(participant.created_at, locale) }}</TableCell>
        </TableRow>
      </TableBody>
    </Table>

    <div v-if="meta" class="flex items-center justify-between">
      <p class="text-muted-foreground text-sm" data-testid="candidate-table-summary">
        {{
          $t('participants.pagination.summary', {
            from: meta.from ?? 0,
            to: meta.to ?? 0,
            total: meta.total,
          })
        }}
      </p>
      <div class="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          data-testid="candidate-table-prev"
          :disabled="meta.current_page <= 1"
          @click="$emit('update:page', meta.current_page - 1)"
        >
          {{ $t('participants.pagination.previous') }}
        </Button>
        <Button
          variant="outline"
          size="sm"
          data-testid="candidate-table-next"
          :disabled="meta.current_page >= meta.last_page"
          @click="$emit('update:page', meta.current_page + 1)"
        >
          {{ $t('participants.pagination.next') }}
        </Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import StatusBadge from '@/components/atoms/StatusBadge.vue'
import { PARTICIPANT_STATUSES } from '@/utils/participant-lifecycle'
import { formatDate } from '@/utils/format'

export interface CandidateTableParticipant {
  id: string
  candidate_ref: string
  display_name: string
  role_code: string
  language: string
  status: string
  project_id: string
  started_at: string | null
  completed_at: string | null
  created_at: string
}

export interface CandidateTableMeta {
  current_page: number
  last_page: number
  total: number
  from: number | null
  to: number | null
  per_page: number
}

export interface CandidateTableFilters {
  status: string
  q: string
}

const props = defineProps<{
  participants: CandidateTableParticipant[]
  meta: CandidateTableMeta | null
  filters: CandidateTableFilters
}>()

const emit = defineEmits<{
  (e: 'update:filters', filters: CandidateTableFilters): void
  (e: 'update:page', page: number): void
}>()

// useI18n() is a Nuxt auto-import (@nuxtjs/i18n); tests stub the global the
// same way SidebarNav.spec.ts stubs useRoute().
const { locale } = useI18n()

const searchInput = ref(props.filters.q)
const statusInput = ref(props.filters.status)

watch(
  () => props.filters,
  (next) => {
    searchInput.value = next.q
    statusInput.value = next.status
  }
)

function onSearchSubmit(): void {
  emit('update:filters', { status: statusInput.value, q: searchInput.value })
}

function onStatusChange(): void {
  emit('update:filters', { status: statusInput.value, q: searchInput.value })
}
</script>
