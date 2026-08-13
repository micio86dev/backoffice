<template>
  <div class="flex flex-col gap-4">
    <Card>
      <CardHeader>
        <CardTitle>{{ $t('reports.summary.byStatus') }}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl class="flex flex-wrap gap-6 text-sm">
          <div v-for="(count, status) in summary.by_status" :key="status">
            <dt class="text-muted-foreground">
              {{ $t(`reports.filters.status${capitalize(String(status))}`) }}
            </dt>
            <dd class="text-foreground text-lg font-medium">{{ count }}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>{{ $t('reports.summary.byCompetency') }}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{{ $t('report.table.competency') }}</TableHead>
              <TableHead>{{ $t('report.table.mean') }}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="competency in summary.competencies" :key="competency.competency_code">
              <TableCell>{{ competency.competency_code }}</TableCell>
              <TableCell>
                <span :data-testid="`report-summary-mean-${competency.competency_code}`">
                  {{ competency.mean_score === null ? '—' : competency.mean_score }}
                </span>
                <!--
                  scored_count/result_count are BOTH shown (D7) so a mean
                  built from a fraction of the filtered set reads as visibly
                  partial rather than quietly authoritative.
                -->
                <span class="text-muted-foreground ml-2 text-xs">
                  {{
                    $t('reports.summary.scoredOf', {
                      scored: competency.scored_count,
                      result: competency.result_count,
                    })
                  }}
                </span>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
// Reports summary panel (D7): renders `by_status` counts and the mean
// competency score per code. `by_status` is a Laravel `pluck('aggregate',
// 'status')` collection, which serializes as a status-keyed JSON OBJECT, not
// an array (Scramble mistypes it as `array` — the openapi.json schema is
// wrong here; verified against `EvaluationIndexController.php:114-123`).
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export interface CompetencySummary {
  competency_code: string
  mean_score: number | null
  scored_count: number
  result_count: number
}

export interface EvaluationsSummary {
  by_status: Record<string, number>
  competencies: CompetencySummary[]
}

defineProps<{
  summary: EvaluationsSummary
}>()

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
</script>
