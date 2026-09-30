<template>
  <Alert
    :id="ACTING_CLIENT_NOTICE_ID"
    variant="warning"
    role="status"
    data-testid="acting-client-notice"
  >
    <AlertTitle>{{ $t('superadmin.actingClientRequired.title') }}</AlertTitle>
    <AlertDescription>{{ $t('superadmin.actingClientRequired.body') }}</AlertDescription>
  </Alert>
</template>

<script setup lang="ts">
/**
 * The non-blocking notice shown wherever a tenant-scoped write needs an acting
 * client (see `useActingClientRequired`). A polite `status` region rather than
 * the `alert` the vendored Alert defaults to: it describes a standing condition
 * the operator can fix, not a failure that just happened, so it must not
 * interrupt a screen reader.
 *
 * Its id is what the disabled controls reference via `aria-describedby`.
 */
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { ACTING_CLIENT_NOTICE_ID } from '@/composables/useActingClientRequired'
</script>
