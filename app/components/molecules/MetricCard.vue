<template>
  <Card :data-testid="testId" role="group" :aria-labelledby="labelId">
    <CardHeader>
      <CardDescription :id="labelId">{{ label }}</CardDescription>
      <CardTitle class="text-2xl">{{ value }}</CardTitle>
      <!--
        A second line for the figures that are a sum of parts. The headline
        answers "how much", and without the breakdown the next question — "on
        what" — has no answer on this page at all.
      -->
      <!--
        DERIVED from `testId`, not a shared literal. A repeatable component with
        one hardcoded id gives every instance the same handle: two detail-bearing
        cards on a page and a strict-mode locator is ambiguous. The generic id
        stays as the fallback, because `detail.spec.ts` already queries it on a
        page whose card passes no `testId`.
      -->
      <CardDescription
        v-if="detail"
        :data-testid="testId ? `${testId}-detail` : 'metric-card-detail'"
      >
        {{ detail }}
      </CardDescription>
    </CardHeader>
  </Card>
</template>

<script setup lang="ts">
/**
 * `role="group"` + `aria-labelledby` on the Card, because shadcn's CardTitle and
 * CardDescription render plain `<div>`s: a screen reader got three unassociated
 * text runs — the label, the value and the breakdown — with nothing binding any
 * of them together. `detail` made it three instead of two.
 *
 * It also closes the exception the E2E spec had to document. A tile with no role
 * could only be located by test id; now `getByRole('group', { name })` works,
 * which asserts the accessible NAME as a side effect — something a test id can
 * never do. The accessibility fix and the locator fix are the same fix.
 *
 * The label element carries the id and the group points at it, rather than
 * `aria-label` duplicating the text: one string, rendered once.
 *
 * The id comes from `useId()` and NOT from `testId`. Deriving an accessibility
 * property from a test hook makes the name conditional on being under test:
 * `SessionReviewPanel` and the interview detail page render this component
 * with no `testId`, so every one of those tiles would have stayed unnamed —
 * and the one that looks addressable passes `data-testid` as a fallthrough
 * attribute rather than as the prop, so it would have been unnamed too. The
 * two have no reason to share a lifetime: `useId()` is unique per instance,
 * SSR-stable, and always present.
 *
 * This lives here and NOT as a template comment above `<Card>`: a comment at the
 * template root makes the component a FRAGMENT, so Vue stops inheriting
 * fallthrough attrs onto the Card and `wrapper.element` becomes the comment
 * node. `data-testid` silently vanished from the rendered root — caught by the
 * existing test, which is the whole reason it asserts on the root element.
 */
// Presentational KPI card — label/value arrive already locale-formatted
// (Intl.NumberFormat/Intl.DateTimeFormat happen at the call site, format.ts)
// so this molecule stays free of locale logic (DESIGN.md §5: molecules
// contain UI composition only).
import { useId } from 'vue'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

defineProps<{
  label: string
  value: string
  /** Optional second line, for a headline figure that is a sum of parts. */
  detail?: string
  /**
   * Test hook, named by the caller after the METRIC it renders, not its
   * position in the grid — reordering the KPI row must not silently repoint a
   * test at the wrong tile (dashboard-e2e design D1).
   */
  testId?: string
}>()

/** Unique per instance and stable across SSR/hydration, so the group's name
 * survives both. */
const labelId = useId()
</script>
