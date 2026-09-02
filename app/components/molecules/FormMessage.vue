<template>
  <Alert
    :variant="variant"
    role="alert"
    aria-live="polite"
    :tabindex="focusable ? -1 : undefined"
    :data-testid="testId"
  >
    <AlertDescription>{{ text }}</AlertDescription>
  </Alert>
</template>

<script setup lang="ts">
/**
 * The ONE place an outcome becomes a colour.
 *
 * Eight call sites each carried their own copy of
 * `:variant="formMessage.kind === 'error' ? 'destructive' : 'default'"`,
 * wrapped in the same five lines of Alert markup, and they did not agree: six
 * mapped a SUCCESS to `default`, which renders grey, so "your reset link has
 * been sent" looked identical to a neutral notice. Two mapped it to `success`.
 * A third vocabulary existed too — `TemplatePortability` said `'ok'` where
 * everyone else said `'success'`.
 *
 * NO NEW STYLING IS INTRODUCED HERE, and that is the point. `ui/alert` already
 * defines `success`, `warning` and `destructive` against the DESIGN.md
 * semantic tokens, with the light/dark contrast reasoning recorded beside
 * them. This component does not restate those decisions — it chooses between
 * them, in one place, so a ninth form cannot invent a ninth answer.
 *
 * `role="alert"` and `aria-live="polite"` are unconditional rather than props:
 * every call site set both by hand and every one of them wants the same thing,
 * so making them optional would only create a way to forget them.
 */
import { computed } from 'vue'
import { Alert, AlertDescription } from '@/components/ui/alert'

/**
 * The vocabulary, closed.
 *
 * `waiting` is deliberately part of it. Grey is not "no colour chosen", it is
 * the colour of "nothing has happened yet" — naming that state is what stops
 * the next author reaching for the neutral variant to mean success, which is
 * exactly how this drifted the first time.
 */
export type FormMessageKind = 'success' | 'warning' | 'error' | 'waiting'

const props = withDefaults(
  defineProps<{
    kind: FormMessageKind
    text: string
    /** Test hook, and the anchor pages use to move focus here after a submit. */
    testId: string
    /**
     * Opt-in `tabindex="-1"`. Only the pages that programmatically focus the
     * banner need it; adding it everywhere would put a stop in the tab order
     * of forms that never move focus there.
     */
    focusable?: boolean
  }>(),
  { focusable: false }
)

const VARIANTS = {
  success: 'success',
  warning: 'warning',
  error: 'destructive',
  waiting: 'default',
} as const

const variant = computed(() => VARIANTS[props.kind])
</script>
