<template>
  <div class="flex flex-col gap-6">
    <ReportGlossary />

    <Table>
      <TableCaption>{{ $t('report.table.caption') }}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>{{ $t('report.table.competency') }}</TableHead>
          <TableHead>{{ $t('report.table.mean') }}</TableHead>
          <TableHead>{{ $t('report.table.reliability') }}</TableHead>
          <TableHead>{{ $t('report.table.indicators') }}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <CompetencyRow
          v-for="(result, code) in evaluation"
          :key="code"
          :code="code"
          :result="result"
          :locale="locale"
        />
      </TableBody>
    </Table>

    <p class="text-muted-foreground text-xs">
      {{ $t('report.provenance.label') }}: prompt {{ meta.prompt_version }} · model
      {{ meta.model_version }} · framework {{ meta.framework_version }}
    </p>

    <EvidenceAccordion :evaluation="evaluation" />
  </div>
</template>

<script setup lang="ts">
// Full BARS competency grid (D8, DESIGN.md §8.3) — <table> + <caption> +
// per-competency CompetencyRows, with the glossary above it and the
// indicator-level evidence below it. Presentational only: the container
// (participant detail page) fetches the data and resolves the
// 409/403/404/loading states before ever mounting this.
//
// `meta` (D7, bars-full-scale-1-5): the Evaluation's scoring provenance,
// rendered as an unobtrusive footnote between the table and the evidence
// block — muted, small, but always present (never collapsed behind a
// disclosure). The label is localized; the three values are LITERAL in
// every locale (CLAUDE.md — machine-facing values are never translated).
//
// NOTHING new is drawn INSIDE the <table>. tests/e2e/admin-flow.spec.ts
// screenshots `getByRole('table')` against four committed baselines
// (chromium/webkit × darwin/linux) and only the darwin pair can be
// regenerated off CI, so the grid's own box is treated as frozen. The
// glossary is its previous sibling and the evidence accordion its later one;
// EvaluationReport.spec.ts asserts that boundary so a future edit that drifts
// a tooltip into a <th> fails in unit tests rather than in CI's screenshot
// diff.
import {
  Table,
  TableBody,
  TableCaption,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import CompetencyRow from '@/components/molecules/CompetencyRow.vue'
import ReportGlossary from '@/components/molecules/ReportGlossary.vue'
import EvidenceAccordion from '@/components/organisms/EvidenceAccordion.vue'
import type { EvaluationReportData, EvaluationScoringMeta } from '@/composables/useEvaluationReport'

defineProps<{
  evaluation: EvaluationReportData
  locale: string
  meta: EvaluationScoringMeta
}>()
</script>
