<template>
  <p v-if="text !== null" data-testid="external-reference">
    <!--
      `compact` shows a bare `Workday · #12345`, which means nothing read on its
      own by a screen reader: the prefix names it. `labelled` already says what
      each part is in visible text, so it carries no prefix. The explicit
      `{{ ' ' }}` keeps the two runs from concatenating ("referenceWorkday"):
      whitespace between two inline elements is condensed away by the compiler.
    -->
    <span v-if="variant === 'compact'" class="sr-only">{{ t('externalReference.label') }}</span>
    <template v-if="variant === 'compact'">{{ ' ' }}</template>
    <span data-testid="external-reference-value">{{ text }}</span>
  </p>
</template>

<script setup lang="ts">
/**
 * ExternalReference — the calling system's own reference for a candidate
 * (candidate-external-reference, design AD-8): the `source` system and/or the
 * `external_id` it knows the candidate by.
 *
 * Presentational molecule: the two values and the variant arrive as props, it
 * emits nothing and fetches nothing. It renders NOTHING when neither value is
 * present — no empty container, no lone separator — so a participant without a
 * reference, or an older payload that does not carry the keys at all, leaves
 * the surrounding row exactly as it was.
 *
 * - `compact`: the muted sub-line under `candidate_ref` in the participants
 *   list — `Workday · #12345`, `Workday` or `#12345`.
 * - `labelled`: the participant detail header line —
 *   `External ID 12345 · Source Workday`, each part only when present.
 *
 * `external_id` is an IDENTIFIER, not a quantity, so it is interpolated as
 * plain decimal digits: no `Intl.NumberFormat`, no locale grouping. `source` is
 * operator-supplied free text and is only ever interpolated (escaped) — never
 * rendered as HTML. Neither the values nor the `·` and `#` glyphs are
 * translated; only the labels are.
 */
import { computed } from 'vue'

export interface ExternalReferenceProps {
  /** The calling system's numeric id for the candidate; `null` when none. */
  externalId?: number | null
  /** The calling system's name; `null` when none. */
  source?: string | null
  variant: 'compact' | 'labelled'
}

const props = defineProps<ExternalReferenceProps>()

const { t } = useI18n()

const SEPARATOR = ' · '

const parts = computed<string[]>(() => {
  const result: string[] = []
  const source = typeof props.source === 'string' ? props.source.trim() : ''
  const hasId = typeof props.externalId === 'number'

  if (props.variant === 'labelled') {
    if (hasId) result.push(`${t('externalReference.externalId')} ${props.externalId}`)
    if (source !== '') result.push(`${t('externalReference.source')} ${source}`)

    return result
  }

  if (source !== '') result.push(source)
  if (hasId) result.push(`#${props.externalId}`)

  return result
})

/** `null` (render nothing) when there is nothing to say. */
const text = computed<string | null>(() =>
  parts.value.length === 0 ? null : parts.value.join(SEPARATOR)
)
</script>
