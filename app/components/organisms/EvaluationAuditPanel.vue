<template>
  <!--
    Every `data-testid` below is a VUE-TEST-UTILS-ONLY locator, consumed
    exclusively by `tests/unit/components/organisms/EvaluationAuditPanel.spec.ts`
    (`@vue/test-utils`, which has no ARIA-role query API — unlike Playwright's
    `getByRole`). `tests/e2e/evaluation-audit.spec.ts` — this component's ONLY
    Playwright coverage — queries EXCLUSIVELY by `getByRole`/`getByText`, zero
    `data-testid`/CSS selectors, confirmed by reading that file directly. The
    "E2E locators must be role-based" rule is satisfied at the E2E layer;
    these attributes never reach a Playwright selector. Same established
    pattern as every other organism in this codebase
    (ParticipantRecoveryPanel.vue, etc.).
  -->
  <div class="flex flex-col gap-2" data-testid="evaluation-audit-panel">
    <div class="flex items-center gap-2">
      <Button :disabled="triggering" data-testid="evaluation-audit-trigger" @click="onTrigger">
        {{ triggering ? $t('report.audit.panel.triggering') : $t('report.audit.panel.trigger') }}
      </Button>

      <Badge v-if="inProgress" variant="info" data-testid="evaluation-audit-progress">
        {{ $t('report.audit.panel.inProgress') }}
      </Badge>
    </div>

    <Alert
      v-if="refusalKey"
      :variant="refusalVariant"
      :data-variant="refusalVariant"
      data-testid="evaluation-audit-error"
    >
      <AlertDescription>{{ $t(refusalKey) }}</AlertDescription>
    </Alert>

    <Badge
      v-if="!inProgress && terminalStatus"
      :variant="terminalVariant"
      data-testid="evaluation-audit-status"
    >
      {{ $t(`report.audit.panel.status.${terminalStatus}`) }}
    </Badge>

    <p
      v-if="!inProgress && props.auditMeta"
      class="text-muted-foreground text-xs"
      data-testid="evaluation-audit-provenance"
    >
      {{
        $t('report.audit.panel.provenance', {
          model: props.auditMeta.judge_model_version,
          promptVersion: props.auditMeta.audit_prompt_version,
        })
      }}
    </p>

    <Badge
      v-if="inProgress && pollTimedOut"
      variant="default"
      data-testid="evaluation-audit-poll-timeout"
    >
      {{ $t('report.audit.panel.pollTimeout') }}
    </Badge>
  </div>
</template>

<script setup lang="ts">
// EvaluationAuditPanel — the operator's control for requesting a post-hoc
// audit run, and the surface that renders its outcome (scoring-audit-jev
// design D9/D12, admin-backoffice spec "An Operator Can Trigger An Audit
// Run And See Its Status").
//
// The run's own persisted `status` column is written EXACTLY ONCE, at
// completion (`completed`/`partial`/`failed`) — there is no persisted
// `pending`/`running` value to poll. Before a terminal result is available,
// this panel shows a CLIENT-LOCAL "in progress" indicator sourced from the
// request lifecycle (the 202 response), never presented as a value read
// from `auditMeta.status` — the two are visually and structurally distinct
// (`inProgress` vs. `terminalStatus`), and `inProgress` always wins the
// render when both would otherwise apply, so a stale terminal badge from a
// PRIOR run never lingers under a freshly triggered one.
//
// FLAGGED, DOCUMENTED DEVIATION FROM THE SPEC'S LITERAL WORDING — no
// client-side visibility gate on the trigger button, argued rather than an
// oversight. The spec's scenario reads "no enabled control... is presented"
// to an operator/viewer, which every OTHER admin-gated control in this
// codebase satisfies by reading a real ability from
// `useCurrentUser().can('group.action')` — resolved server-side by
// `UserAbilities::for()` (api, app/Support/Authorization/UserAbilities.php)
// from the SAME policy that guards the endpoint, and MECHANICALLY enforced
// here by `tests/unit/arch/cta-authorization.spec.ts` (`no client-side
// authorization`), which bans `roles.includes(...)` and any role-name
// comparison in `app/` outright.
//
// `EvaluationPolicy::audit()` (api, added in P4) was never added to
// `UserAbilities::for()`'s return array by any of the P1–P5 apply batches —
// confirmed by reading that file directly this batch — and design.md's own
// File Changes table never lists it either. There is therefore NO
// `can('evaluation.audit')` to read; `roles.includes('admin')` is the ONLY
// other way to answer "is this operator an admin", and it is exactly what
// the arch guard exists to forbid (a second, driftable copy of the
// authorization rule). Faking a hidden button on a role string this
// codebase has already decided is unsafe would trade one real gap for a
// silent one.
//
// The trigger is therefore always rendered, and the REAL, SERVER-ENFORCED
// gate (`EvaluationPolicy::audit()`, admin-only — never bypassable) answers
// with 403 for a non-admin. That 403 is caught here and rendered as its own
// clear, non-generic refusal ("administrators only"), never a silent
// failure or a raw error — the same "every endpoint keeps authorizing
// independently, a hidden button is not a closed door" doctrine this
// codebase's OWN `UserAbilities` docblock states for the ability map this
// component cannot yet use.
//
// REQUIRED API-SIDE FOLLOW-UP: add `'evaluation' => ['audit' =>
// $gate->allows('audit', Evaluation::class)]` to `UserAbilities::for()`'s
// return array, then swap this component to
// `v-if="useCurrentUser().can('evaluation.audit')"`, matching every other
// admin-gated control, and delete this note.
import { ref, computed, watch, onUnmounted } from 'vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  useEvaluationAudit,
  auditRefusalReasonKey,
  AUDIT_REFUSAL_REASONS,
} from '@/composables/useEvaluationAudit'
import { getErrorReason, getErrorStatus } from '@/utils/http-error'
import type { EvaluationAuditMeta } from '@/composables/useEvaluationReport'

const props = defineProps<{
  participantId: number
  auditMeta: EvaluationAuditMeta | null
}>()

const emit = defineEmits<{
  (e: 'triggered', evaluationId: number): void
}>()

const { triggerAudit } = useEvaluationAudit()

const triggering = ref(false)
const inProgress = ref(false)
// `null` (no refusal), one of the four documented 409 `reason` codes, the
// 403 RBAC case (`forbidden`, handled separately from the 409 set — see the
// docblock above), or `unknown`.
const refusalReason = ref<string | null>(null)

const refusalKey = computed(() =>
  refusalReason.value === null
    ? null
    : refusalReason.value === 'forbidden'
      ? 'report.audit.refusal.forbidden'
      : auditRefusalReasonKey(refusalReason.value)
)

// A 409 is temporal and self-resolving (design D12: the kill switch, the
// in-flight lock, the completato gate — all conditions that change on their
// own), never a permission failure — it must not wear the same red as a
// genuine 403. Mirrors `app/pages/participants/[id].vue`'s own established
// convention (`:variant="X === 'not-ready' ? 'default' : 'destructive'"`).
// `forbidden` (403) and `unknown` (an unexpected failure, safest treated as
// destructive) are the only two reasons that get the destructive variant;
// every documented 409 reason gets the calmer `default` one.
const refusalVariant = computed(() =>
  refusalReason.value !== null &&
  (AUDIT_REFUSAL_REASONS as readonly string[]).includes(refusalReason.value)
    ? 'default'
    : 'destructive'
)

// v1 originally shipped with NO polling (design D6/D9): a caller that
// triggered a run learned it completed only by RE-FETCHING the evaluation
// and passing a fresh `auditMeta` prop (this page's own `onAuditTriggered`
// handler does exactly that). Its own single best-effort re-fetch right
// after the 202 almost always raced the backend job and returned the SAME
// `auditMeta` — the operator only ever saw the terminal status by reloading
// the page later, even though the backend job itself finishes in about a
// second (scoring-audit-jev-prod-recovery). Re-emitting `triggered` on an
// interval below reuses that SAME parent re-fetch path — no new fetch logic
// is introduced here, only its cadence.
//
// Once a GENUINELY NEWER `auditMeta` arrives (a different `run_id`), the
// terminal badge below takes over from the client-local "in progress" one —
// otherwise a run that finished quickly would still show "in progress"
// forever, since `inProgress` is set once, from the 202 response, and
// nothing else would ever clear it.
//
// Comparing `run_id`, not just non-null, matters for a RE-TRIGGER on an
// evaluation that already has a prior completed run: the best-effort
// re-fetch dispatched right after the 202 will almost always still return
// that SAME prior run (the new one has not finished yet). Clearing on any
// non-null value would surface the stale OLD run's terminal badge under the
// freshly triggered one — `knownRunIdBeforeTrigger` is captured at the
// moment `onTrigger()` starts specifically to make that distinction.
const knownRunIdBeforeTrigger = ref<number | null>(props.auditMeta?.run_id ?? null)

// 3s interval, ~60s cap (20 attempts): generous now that a real vendor call
// fails or succeeds in seconds, not the minutes the pre-fix wire contract
// made it look like. Past the cap the outcome is genuinely unknown — never
// presented as failed — so polling stops politely and the fallback copy
// below tells the operator to check back later, rather than polling forever.
const POLL_INTERVAL_MS = 3000
const MAX_POLL_ATTEMPTS = 20

let pollTimer: ReturnType<typeof setInterval> | null = null
let pollAttempts = 0
const pollTimedOut = ref(false)

function stopPolling(): void {
  if (pollTimer !== null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function startPolling(evaluationId: number): void {
  stopPolling()
  pollAttempts = 0
  pollTimer = setInterval(() => {
    pollAttempts++
    if (pollAttempts >= MAX_POLL_ATTEMPTS) {
      stopPolling()
      pollTimedOut.value = true
      return
    }
    emit('triggered', evaluationId)
  }, POLL_INTERVAL_MS)
}

onUnmounted(stopPolling)

watch(
  () => props.auditMeta,
  (newMeta) => {
    if (newMeta !== null && newMeta.run_id !== knownRunIdBeforeTrigger.value) {
      inProgress.value = false
      stopPolling()
    }
  }
)

const terminalStatus = computed(() => props.auditMeta?.status ?? null)

const terminalVariant = computed(() => {
  switch (terminalStatus.value) {
    case 'completed':
      return 'success'
    case 'partial':
      return 'warning'
    case 'failed':
      return 'destructive'
    default:
      return 'neutral'
  }
})

async function onTrigger(): Promise<void> {
  // Reset FIRST, unconditionally — so a second click never inherits the
  // previous click's in-progress badge or refusal copy while its own
  // request is still settling.
  triggering.value = true
  inProgress.value = false
  refusalReason.value = null
  pollTimedOut.value = false
  stopPolling()
  // Whatever run `auditMeta` carries RIGHT NOW is the "known prior" this
  // trigger must not be cleared by — see the watcher's own docblock.
  knownRunIdBeforeTrigger.value = props.auditMeta?.run_id ?? null

  try {
    const response = await triggerAudit(props.participantId)
    inProgress.value = true
    emit('triggered', response.evaluation_id)
    startPolling(response.evaluation_id)
  } catch (error) {
    refusalReason.value =
      getErrorStatus(error) === 403 ? 'forbidden' : (getErrorReason(error) ?? 'unknown')
  } finally {
    triggering.value = false
  }
}
</script>
