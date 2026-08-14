<template>
  <AlertDialog :open="open" @update:open="onOpenChange">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ title }}</AlertDialogTitle>
        <AlertDialogDescription>{{ description }}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <!--
          type="button" on BOTH buttons — required because dates-and-
          destructive-actions PR4 places this dialog inside ProjectForm's
          form element (archive confirmation). A native button with no
          explicit type defaults to "submit" inside a surrounding form, so
          without this, the confirm click would ALSO fire that form's submit
          handler — a second, unrelated network call racing the intended one.
        -->
        <AlertDialogCancel type="button" data-testid="confirm-dialog-cancel" @click="onCancel">
          {{ cancelLabel ?? $t('projects.action.cancel') }}
        </AlertDialogCancel>
        <AlertDialogAction
          type="button"
          data-testid="confirm-dialog-confirm"
          :variant="variant"
          @pointerdown="suppressNextCancel = true"
          @click="onConfirm"
        >
          {{ confirmLabel ?? $t('users.confirm.action') }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>

<script setup lang="ts">
// AlertDialog wrapper for deactivate/activate confirmations (D8). Nothing
// happens until the operator explicitly confirms — dismissing (cancel,
// backdrop, Escape) never triggers the destructive/state-changing action.
import { ref } from 'vue'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

// confirmLabel/cancelLabel/variant (design.md D4): every new prop is
// optional and defaults to today's exact string, so both existing call
// sites compile unchanged. The fallback is resolved in the TEMPLATE via
// `??`, never captured here as a string — `$t` is a template global, and a
// string captured at prop-default time would not re-render on a locale
// switch.
withDefaults(
  defineProps<{
    open: boolean
    title: string
    description: string
    confirmLabel?: string
    cancelLabel?: string
    variant?: 'default' | 'destructive'
  }>(),
  { confirmLabel: undefined, cancelLabel: undefined, variant: 'default' }
)

const emit = defineEmits<{
  (e: 'confirm' | 'cancel'): void
}>()

// reka-ui's AlertDialogAction ALSO closes the dialog on click (its own
// built-in behavior, same as Cancel), which fires `update:open(false)` —
// indistinguishable, at that point, from a genuine dismiss (Escape,
// backdrop, the Cancel button). Without this flag, confirming would emit
// BOTH 'confirm' (from onConfirm below) AND 'cancel' (from the resulting
// close), and a caller that clears its own confirmation state on 'cancel'
// (the expected, common pattern) would race: whichever emit's listener runs
// second sees state already wiped by the other.
const suppressNextCancel = ref(false)

function onConfirm(): void {
  suppressNextCancel.value = true
  emit('confirm')
}

function onCancel(): void {
  emit('cancel')
}

function onOpenChange(next: boolean): void {
  if (next) return
  if (suppressNextCancel.value) {
    suppressNextCancel.value = false
    return
  }
  emit('cancel')
}
</script>
