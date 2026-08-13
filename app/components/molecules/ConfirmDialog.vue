<template>
  <AlertDialog :open="open" @update:open="onOpenChange">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ title }}</AlertDialogTitle>
        <AlertDialogDescription>{{ description }}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel data-testid="confirm-dialog-cancel" @click="onCancel">
          {{ $t('projects.action.cancel') }}
        </AlertDialogCancel>
        <AlertDialogAction
          data-testid="confirm-dialog-confirm"
          @pointerdown="suppressNextCancel = true"
          @click="onConfirm"
        >
          {{ $t('users.confirm.action') }}
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

defineProps<{
  open: boolean
  title: string
  description: string
}>()

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
