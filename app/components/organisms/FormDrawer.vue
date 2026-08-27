<template>
  <Sheet :open="open" @update:open="(value) => emit('update:open', value)">
    <SheetContent
      side="right"
      data-testid="form-drawer"
      v-bind="ariaDescribedByOverride"
      :class="contentClass"
    >
      <SheetHeader class="shrink-0 border-b border-border">
        <SheetTitle>{{ title }}</SheetTitle>
        <SheetDescription v-if="description">{{ description }}</SheetDescription>
      </SheetHeader>

      <!--
        The scroll region is its OWN flex item (flex-1 + overflow-y-auto),
        siblings of the header/footer rather than a parent of them. This is
        the fix for the defect pages/projects/index.vue's Dialog comment
        documents: a long form growing past the viewport must never take its
        submit button down with it — the footer below is a SIBLING, never a
        descendant, of this element.
      -->
      <div class="flex-1 overflow-y-auto px-4 py-4">
        <slot />
      </div>

      <SheetFooter class="shrink-0 flex-row justify-end gap-2 border-t border-border">
        <slot name="footer" />
      </SheetFooter>
    </SheetContent>
  </Sheet>
</template>

<script setup lang="ts">
/**
 * FormDrawer — the reusable right-side slide-in form panel.
 *
 * A thin wrapper over the existing `Sheet` primitive (itself reka-ui's
 * `DialogRoot`/`DialogContent`), not a new panel implementation: reka-ui
 * already gives a focus trap, focus restore, Escape-to-close and
 * `aria-modal` for free, and hand-rolling any of that here would be strictly
 * worse than what `Sheet` already does.
 *
 * What this wrapper adds on top of the bare primitive:
 *   - a width that fits a two-column form (`Sheet`'s own default,
 *     `sm:max-w-sm`/384px, is a mobile-menu width, not a form width),
 *   - a footer region that never scrolls out of reach — the exact defect
 *     `pages/projects/index.vue`'s Dialog usage documents: a long form
 *     growing past the viewport took its submit button with it, and E2E
 *     caught it as a click that retried until it timed out,
 *   - `SheetTitle`/`SheetDescription` wiring so reka-ui's own
 *     `aria-labelledby`/`aria-describedby` machinery always has a real
 *     target, or is explicitly suppressed rather than left dangling,
 *   - a `prefers-reduced-motion` override on the vendored slide/fade
 *     animation, which carries no such guard on its own.
 */
import { computed } from 'vue'
import { cn } from '@/lib/utils'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

const props = defineProps<{
  open: boolean
  title: string
  description?: string
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
}>()

/**
 * reka-ui's DialogContent defaults `aria-describedby` to an internally
 * generated id, whether or not a Description is actually rendered — so a
 * form with no `description` would otherwise ship a dangling ARIA reference
 * and log reka-ui's own "Missing Description" dev warning. Its own
 * documented opt-out is an EXPLICIT `aria-describedby="undefined"`, which
 * only makes sense to apply when we genuinely have no SheetDescription to
 * point at; with one, the internal default is exactly what we want and must
 * not be overridden.
 */
const ariaDescribedByOverride = computed(() =>
  props.description ? {} : { 'aria-describedby': undefined }
)

/**
 * Matches the EXACT `data-[side=right]:sm:` modifier chain SheetContent's
 * own default cap uses (`data-[side=right]:sm:max-w-sm`), not a bare
 * `sm:max-w-3xl` — a bare breakpoint class carries one fewer attribute
 * selector than the side-scoped default and loses the CSS specificity fight
 * against it, silently doing nothing on the actual rendered `side="right"`
 * panel. `motion-reduce:*!` closes the pre-existing gap in the vendored
 * animation classes: DESIGN.md mandates that ALL animation respects
 * `prefers-reduced-motion`, and SheetContent's slide/fade classes carry no
 * such guard on their own.
 */
const contentClass = computed(() =>
  cn(
    'flex w-full flex-col gap-0 data-[side=right]:sm:max-w-3xl',
    'motion-reduce:transition-none! motion-reduce:duration-0! motion-reduce:animate-none!'
  )
)
</script>
