<template>
  <div>
    <p
      v-if="questions.length === 0"
      data-testid="question-empty"
      class="text-muted-foreground text-sm"
    >
      {{ $t('projectQuestions.empty') }}
    </p>

    <ul v-else class="flex flex-col gap-2">
      <li
        v-for="(q, index) in questions"
        :key="q.id"
        :data-testid="`question-row-${q.id}`"
        class="border-border bg-card flex items-start gap-3 rounded-lg border p-3"
      >
        <!--
          The grip is a BUTTON, not a decorated span, and that is the fix
          eslint-plugin-vuejs-accessibility asked for rather than a suppression:
          `dragstart` is an interactive handler, and hanging it on a static
          element gives a control only a pointer can find. As a button it is
          focusable and announced, and the drag source is now the same element
          a keyboard user tabs to.

          It is also the DROP TARGET, for the same reason: `drop` is an
          interactive handler too, and on the <li> it made the whole row a
          control only a pointer could use. Dropping onto the grip is where a
          handle-drag is aimed anyway.

          `tabindex="-1"` AND `aria-hidden`, because the move buttons beside
          it already carry the keyboard path. It used to carry an
          `aria-label`: browse mode still reaches a `tabindex="-1"` button, so
          a screen reader announced "drag handle, button" for a control with
          no click and no keydown handler — activating it does nothing. A name
          on an inoperable control is worse than no name.
        -->
        <button
          v-if="reorderable"
          type="button"
          tabindex="-1"
          draggable="true"
          aria-hidden="true"
          class="text-muted-foreground cursor-grab select-none pt-1"
          :data-testid="`question-grip-${q.id}`"
          @dragstart="onDragStart(index)"
          @dragover.prevent
          @drop.prevent="onDrop(index)"
        >
          ⠿
        </button>

        <p class="flex-1 text-sm">{{ display(q) }}</p>

        <div class="flex shrink-0 items-center gap-1">
          <!--
            DISABLED at the ends rather than hidden: a control that disappears
            changes the row's width as the list is reordered, and the operator
            loses the button they were aiming at mid-sequence.

            The whole GROUP is hidden when there is only one question, which is
            a different question from "which end are we at". One item has no
            order: two arrows that can never do anything, and a drag handle
            with nowhere to drag to, are three controls that only teach the
            operator this list ignores them.
          -->
          <Button
            v-if="reorderable"
            variant="ghost"
            size="sm"
            :disabled="index === 0"
            :aria-label="$t('projectQuestions.moveUp')"
            :data-testid="`question-up-${q.id}`"
            @click="move(index, -1)"
          >
            ↑
          </Button>
          <Button
            v-if="reorderable"
            variant="ghost"
            size="sm"
            :disabled="index === questions.length - 1"
            :aria-label="$t('projectQuestions.moveDown')"
            :data-testid="`question-down-${q.id}`"
            @click="move(index, 1)"
          >
            ↓
          </Button>
          <Button
            variant="ghost"
            size="sm"
            :aria-label="$t('projectQuestions.edit')"
            :data-testid="`question-edit-${q.id}`"
            @click="emit('edit', q.id)"
          >
            {{ $t('projectQuestions.edit') }}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            :aria-label="$t('projectQuestions.remove')"
            :data-testid="`question-remove-${q.id}`"
            @click="emit('remove', q.id)"
          >
            {{ $t('projectQuestions.remove') }}
          </Button>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
/**
 * The predefined questions of one competency, reorderable.
 *
 * Presentational: props in, events out. The page owns the API calls, so this
 * can be tested without a network layer and reused wherever a project's
 * questions need editing.
 *
 * REORDERING ALWAYS EMITS THE WHOLE LIST, from the buttons and from the drop
 * alike. The server rewrites every position in one transaction because they
 * are unique per competency among live rows — a single-move payload would
 * collide with the position it is moving into, and a half-applied order is
 * worse than a refused one.
 *
 * DRAG IS THE FAST PATH, NOT THE ONLY ONE. A pointer-only reordering control
 * is unusable by keyboard and by anyone on assistive tech; this repo lints
 * templates with eslint-plugin-vuejs-accessibility and runs axe in E2E exactly
 * so that does not ship. The move buttons are the accessible path and carry
 * the same behaviour.
 */
import { computed, ref } from 'vue'
import { Button } from '@/components/ui/button'
import type { ProjectQuestion } from '@/composables/useProjectQuestions'

const props = defineProps<{
  questions: ProjectQuestion[]
  /** The PROJECT's language — the interview's, not the operator's. */
  locale: string
}>()

/**
 * There is an order to change only once there are two questions.
 *
 * Computed, not a prop: the list already knows how many it holds, and letting
 * a caller answer would be one more thing a caller can answer wrongly.
 */
const reorderable = computed(() => props.questions.length > 1)

const emit = defineEmits<{
  (e: 'reorder', ids: number[]): void
  // One signature for both: they carry the same payload, and two overloads
  // that differ only in a string literal are the shape `unified-signatures`
  // exists to collapse.
  (e: 'edit' | 'remove', id: number): void
}>()

const draggingIndex = ref<number | null>(null)

/**
 * The row shows ONE language — the project's — falling back to English.
 *
 * The editor writes both, but a list showing every locale doubles its own
 * length and stops being scannable, which is the one thing a reorderable list
 * has to be. English is the fallback because the API requires it and every
 * question therefore has one.
 */
function display(q: ProjectQuestion): string {
  const text = (q.text ?? {}) as Record<string, string | null | undefined>

  return text[props.locale] || text.en || ''
}

function emitOrder(list: ProjectQuestion[]): void {
  emit(
    'reorder',
    list.map((q) => q.id)
  )
}

function move(index: number, delta: number): void {
  const target = index + delta

  if (target < 0 || target >= props.questions.length) return

  emitOrder(reordered(index, target))
}

function onDragStart(index: number): void {
  draggingIndex.value = index
}

function onDrop(index: number): void {
  const from = draggingIndex.value
  draggingIndex.value = null

  if (from === null || from === index) return

  emitOrder(reordered(from, index))
}

/**
 * The list with one item moved, without asserting anything about `splice`.
 *
 * `splice` is typed as possibly returning nothing, and both call sites had
 * already checked their bounds — so a non-null assertion here would silence a
 * warning by claiming a guarantee the compiler cannot see, in the one function
 * whose whole job is index arithmetic. Filtering by identity says the same
 * thing without the claim.
 */
function reordered(from: number, to: number): ProjectQuestion[] {
  const moved = props.questions[from]

  if (moved === undefined) return [...props.questions]

  const without = props.questions.filter((_, i) => i !== from)

  return [...without.slice(0, to), moved, ...without.slice(to)]
}
</script>
