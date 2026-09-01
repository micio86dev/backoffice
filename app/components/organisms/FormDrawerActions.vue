<template>
  <Button type="submit" :form="formId" data-testid="form-drawer-save" :loading="pending">
    {{ submitLabel ?? $t('common.action.save') }}
  </Button>
  <!--
    Deliberately NOT disabled while pending. Disabling the only way out of a
    drawer for the duration of a request traps an operator behind a slow or
    hung network call; the submit control is the one that must not fire twice.
  -->
  <Button type="button" variant="outline" data-testid="form-drawer-cancel" @click="emit('cancel')">
    {{ $t('common.action.cancel') }}
  </Button>
</template>

<script setup lang="ts">
/**
 * FormDrawerActions — the submit/cancel pair in a FormDrawer's footer.
 *
 * Rendered as FormDrawer's own footer fallback, so a new CRUD form costs a
 * `<FormDrawer :form-id="...">` and an `id` on its `<form>` — not another
 * hand-copied button pair with its own disabled-while-saving wiring, which is
 * exactly how the same three lines ended up in five different files before
 * this component existed.
 *
 * `form="{formId}"` is the load-bearing attribute. The submit control lives in
 * the drawer's NON-scrolling footer while the `<form>` markup lives in the
 * scrolling body; this native HTML association is what connects them, with no
 * ref plumbing and no event bus.
 *
 * Cancel carries no label override on purpose: "cancel" means the same thing
 * on every form in the product, and a per-call-site string is an invitation to
 * drift. The SUBMIT verb genuinely differs ("Create key", "Rotate key"), so
 * that one — and only that one — is overridable.
 */
import { Button } from '@/components/ui/button'

defineProps<{
  /** The `id` of the `<form>` this footer submits. */
  formId: string
  /** True while the submit request is in flight. */
  pending?: boolean
  /** Overrides the shared "Save" verb where it would be the wrong word. */
  submitLabel?: string
}>()

const emit = defineEmits<{
  (e: 'cancel'): void
}>()
</script>
