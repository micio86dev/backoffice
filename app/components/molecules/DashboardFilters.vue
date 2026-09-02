<template>
  <div class="flex flex-wrap items-end gap-3" data-testid="dashboard-filters">
    <Field class="w-40">
      <FieldLabel for="dashboard-year">{{ $t('dashboard.filters.year') }}</FieldLabel>
      <select
        id="dashboard-year"
        :value="year === null ? '' : String(year)"
        data-testid="dashboard-year"
        class="border-border bg-card text-foreground rounded-md border px-2 py-1 text-sm"
        @change="onYear"
      >
        <!--
          "All time" lives on the YEAR select rather than as a third control:
          clearing the year is the only way to mean "no period at all", and a
          separate reset button would let the two disagree.
        -->
        <option value="">{{ $t('dashboard.filters.allTime') }}</option>
        <option v-for="y in years" :key="y" :value="String(y)">{{ y }}</option>
      </select>
    </Field>

    <Field class="w-48">
      <FieldLabel for="dashboard-month">{{ $t('dashboard.filters.month') }}</FieldLabel>
      <select
        id="dashboard-month"
        :value="month === null ? '' : String(month)"
        :disabled="year === null"
        data-testid="dashboard-month"
        class="border-border bg-card text-foreground rounded-md border px-2 py-1 text-sm disabled:opacity-50"
        @change="onMonth"
      >
        <!--
          Disabled rather than hidden while no year is chosen: a control that
          vanishes moves everything beside it, and the operator loses the
          target they were reaching for.
        -->
        <option value="">{{ $t('dashboard.filters.wholeYear') }}</option>
        <option v-for="(label, index) in monthLabels" :key="label" :value="String(index + 1)">
          {{ label }}
        </option>
      </select>
    </Field>
  </div>
</template>

<script setup lang="ts">
/**
 * Which period the dashboard is describing.
 *
 * Presentational: it emits a RANGE and never fetches. The page owns the
 * requests, and passes the same range to both endpoints so the tiles and the
 * activity list cannot end up covering different months.
 *
 * Native selects, no new dependency — keyboard-operable, announced, and
 * type-to-search everywhere this product runs. The calendar arithmetic lives
 * in `dashboard-period.ts` where it can be tested by running it.
 */
import { computed, ref } from 'vue'
import { Field, FieldLabel } from '@/components/ui/field'
import { periodToRange, yearsBack, type DateRange } from '@/utils/dashboard-period'

const props = withDefaults(
  defineProps<{
    /** Injected so the component has no hidden clock of its own to test around. */
    currentYear?: number
    yearCount?: number
    locale?: string
  }>(),
  { currentYear: undefined, yearCount: 4, locale: 'en' }
)

const emit = defineEmits<{ (e: 'change', range: DateRange): void }>()

const year = ref<number | null>(null)
const month = ref<number | null>(null)

const years = computed(() =>
  yearsBack(props.currentYear ?? new Date().getFullYear(), props.yearCount)
)

/** Month names in the reader's language, from the platform rather than a list. */
const monthLabels = computed(() => {
  const formatter = new Intl.DateTimeFormat(props.locale, { month: 'long' })

  return Array.from({ length: 12 }, (_, i) => formatter.format(new Date(2026, i, 1)))
})

function emitRange(): void {
  if (year.value === null) {
    emit('change', periodToRange({ kind: 'all' }))

    return
  }

  emit(
    'change',
    month.value === null
      ? periodToRange({ kind: 'year', year: year.value })
      : periodToRange({ kind: 'month', year: year.value, month: month.value })
  )
}

function onYear(event: Event): void {
  const raw = (event.target as HTMLSelectElement).value
  year.value = raw === '' ? null : Number(raw)

  // Clearing the year clears the month too: "March of no year" is not a
  // period, and leaving it selected would show a stale month beside "all time".
  if (year.value === null) month.value = null

  emitRange()
}

function onMonth(event: Event): void {
  const raw = (event.target as HTMLSelectElement).value
  month.value = raw === '' ? null : Number(raw)
  emitRange()
}
</script>
