/**
 * EvaluationAuditPanel.vue (scoring-audit-jev design D9/D12, admin-backoffice
 * spec "An Operator Can Trigger An Audit Run And See Its Status"). Asserts:
 *   - activating the trigger shows a CLIENT-LOCAL "in progress" indicator
 *     sourced from the request lifecycle, never presented as a value read
 *     from the persisted run `status`;
 *   - once `auditMeta` carries a terminal run, its persisted `status`
 *     (`completed`/`partial`/`failed`) renders;
 *   - each documented 409 reason renders its own refusal copy, and a 403
 *     renders its own "administrators only" copy;
 *   - re-triggering resets the client-local progress state.
 *
 * NO client-side visibility gate on the trigger button — see this
 * component's own docblock for why. `UserAbilities::for()` (api,
 * `app/Support/Authorization/UserAbilities.php`) was NOT extended with an
 * `evaluation.audit` key by any of the P1–P5 apply batches, so there is no
 * `can('evaluation.audit')` to read, unlike every other admin-gated control
 * in this codebase. The only OTHER way to answer "is this operator an
 * admin" client-side is `roles.includes('admin')` — which
 * `tests/unit/arch/cta-authorization.spec.ts` MECHANICALLY forbids in
 * `app/` (`no client-side authorization` — role-membership rule). This
 * component honours that guard: the trigger always renders, and the REAL,
 * server-enforced gate (`EvaluationPolicy::audit()`) is what a non-admin
 * actually hits — its 403 is caught and rendered as its own clear copy
 * below, never a silent failure.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import type { EvaluationAuditMeta } from '../../../../app/composables/useEvaluationReport'

const tMock = (key: string, params?: Record<string, unknown>) =>
  params ? `${key}:${JSON.stringify(params)}` : key
const triggerAuditMock = vi.fn()

vi.mock('../../../../app/composables/useEvaluationAudit', async () => {
  const actual = await vi.importActual<
    typeof import('../../../../app/composables/useEvaluationAudit')
  >('../../../../app/composables/useEvaluationAudit')
  return {
    ...actual,
    useEvaluationAudit: () => ({ triggerAudit: triggerAuditMock }),
  }
})

const EvaluationAuditPanel = (
  await import('../../../../app/components/organisms/EvaluationAuditPanel.vue')
).default

function meta(overrides: Partial<EvaluationAuditMeta> = {}): EvaluationAuditMeta {
  return {
    run_id: 1,
    status: 'completed',
    judge_model_version: 'jev-1',
    audit_prompt_version: '1.0.0',
    created_at: '2026-09-18T10:00:00+00:00',
    indicators_total: 10,
    indicators_judged: 10,
    indicators_skipped: 0,
    indicators_unavailable: 0,
    indicators_malformed: 0,
    ...overrides,
  }
}

beforeEach(() => {
  triggerAuditMock.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('EvaluationAuditPanel — the trigger control renders (no client-side visibility gate)', () => {
  it('renders an enabled trigger control', () => {
    const wrapper = mount(EvaluationAuditPanel, {
      props: { participantId: 1, auditMeta: null },
      global: { mocks: { $t: tMock } },
    })

    const trigger = wrapper.find('[data-testid="evaluation-audit-trigger"]')
    expect(trigger.exists()).toBe(true)
    expect(trigger.attributes('disabled')).toBeUndefined()
  })
})

describe('EvaluationAuditPanel — triggering and the client-local progress indicator', () => {
  it('shows a client-local in-progress indicator immediately after the 202 response, never as a value read from a persisted status', async () => {
    triggerAuditMock.mockResolvedValue({ status: 'queued', evaluation_id: 99 })
    const wrapper = mount(EvaluationAuditPanel, {
      props: { participantId: 1, auditMeta: null },
      global: { mocks: { $t: tMock } },
    })

    await wrapper.get('[data-testid="evaluation-audit-trigger"]').trigger('click')
    await flushPromises()

    expect(triggerAuditMock).toHaveBeenCalledWith(1)
    expect(wrapper.find('[data-testid="evaluation-audit-progress"]').exists()).toBe(true)
    // Never rendered as the persisted run status vocabulary.
    expect(wrapper.find('[data-testid="evaluation-audit-progress"]').text()).not.toMatch(
      /completed|partial|failed/
    )
  })

  it('clears the client-local in-progress indicator once the parent passes a fresh terminal auditMeta (e.g. after a re-fetch)', async () => {
    triggerAuditMock.mockResolvedValue({ status: 'queued', evaluation_id: 99 })
    const wrapper = mount(EvaluationAuditPanel, {
      props: { participantId: 1, auditMeta: null },
      global: { mocks: { $t: tMock } },
    })

    await wrapper.get('[data-testid="evaluation-audit-trigger"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="evaluation-audit-progress"]').exists()).toBe(true)

    await wrapper.setProps({ auditMeta: meta({ run_id: 2, status: 'completed' }) })

    expect(wrapper.find('[data-testid="evaluation-audit-progress"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="evaluation-audit-status"]').text()).toContain(
      'report.audit.panel.status.completed'
    )
  })

  // A re-trigger on an evaluation that already has a PRIOR completed run: the
  // best-effort re-fetch after the 202 will almost always still return that
  // SAME prior run (the new one has not finished yet). `inProgress` must stay
  // true until a GENUINELY NEWER run (a different run_id) arrives — clearing
  // on any non-null auditMeta would surface the stale OLD run's terminal
  // badge under the freshly triggered one.
  it('does NOT clear in-progress when the parent passes back the SAME prior run (not yet a newer one)', async () => {
    triggerAuditMock.mockResolvedValue({ status: 'queued', evaluation_id: 99 })
    const priorRun = meta({ run_id: 1, status: 'completed' })
    const wrapper = mount(EvaluationAuditPanel, {
      props: { participantId: 1, auditMeta: priorRun },
      global: { mocks: { $t: tMock } },
    })

    await wrapper.get('[data-testid="evaluation-audit-trigger"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="evaluation-audit-progress"]').exists()).toBe(true)

    // The best-effort re-fetch races back BEFORE the new run exists — same run_id.
    await wrapper.setProps({ auditMeta: { ...priorRun } })
    expect(wrapper.find('[data-testid="evaluation-audit-progress"]').exists()).toBe(true)

    // The NEW run finally lands.
    await wrapper.setProps({ auditMeta: meta({ run_id: 2, status: 'completed' }) })
    expect(wrapper.find('[data-testid="evaluation-audit-progress"]').exists()).toBe(false)
  })

  it('once auditMeta carries a terminal run, its persisted status renders', () => {
    const wrapper = mount(EvaluationAuditPanel, {
      props: { participantId: 1, auditMeta: meta({ status: 'partial' }) },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.find('[data-testid="evaluation-audit-status"]').text()).toContain(
      'report.audit.panel.status.partial'
    )
  })

  // spec: "Copy MUST name the judge's version where the UI already surfaces
  // provenance for comparable signals" — mirrors report.provenance.label.
  it('names the judge model and question-set version, mirroring the scoring provenance footnote', () => {
    const wrapper = mount(EvaluationAuditPanel, {
      props: {
        participantId: 1,
        auditMeta: meta({ judge_model_version: 'jev-1', audit_prompt_version: '1.0.0' }),
      },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.get('[data-testid="evaluation-audit-provenance"]').text()).toContain(
      'report.audit.panel.provenance'
    )
    expect(wrapper.get('[data-testid="evaluation-audit-provenance"]').text()).toContain('jev-1')
    expect(wrapper.get('[data-testid="evaluation-audit-provenance"]').text()).toContain('1.0.0')
  })
})

describe('EvaluationAuditPanel — each documented refusal renders its own copy, never a generic message', () => {
  it.each([
    ['audit_disabled', 'report.audit.refusal.audit_disabled'],
    ['audit_already_running', 'report.audit.refusal.audit_already_running'],
    ['audit_lock_unavailable', 'report.audit.refusal.audit_lock_unavailable'],
    ['lifecycle_not_ready', 'report.audit.refusal.lifecycle_not_ready'],
  ])('409 reason=%s renders %s', async (reason, expectedKey) => {
    triggerAuditMock.mockRejectedValue({ status: 409, data: { reason } })
    const wrapper = mount(EvaluationAuditPanel, {
      props: { participantId: 1, auditMeta: null },
      global: { mocks: { $t: tMock } },
    })

    await wrapper.get('[data-testid="evaluation-audit-trigger"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="evaluation-audit-error"]').text()).toBe(expectedKey)
  })

  it('a 403 (the real, server-enforced admin-only gate) renders its own "administrators only" copy, not a documented 409 reason', async () => {
    triggerAuditMock.mockRejectedValue({ status: 403, data: {} })
    const wrapper = mount(EvaluationAuditPanel, {
      props: { participantId: 1, auditMeta: null },
      global: { mocks: { $t: tMock } },
    })

    await wrapper.get('[data-testid="evaluation-audit-trigger"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="evaluation-audit-error"]').text()).toBe(
      'report.audit.refusal.forbidden'
    )
  })
})

// A 409 refusal is temporal and self-resolving (design D12's own kill-switch
// / in-flight-lock semantics); a 403 is a genuine permission denial. Mirrors
// `app/pages/participants/[id].vue`'s own established convention
// (`:variant="X === 'not-ready' ? 'default' : 'destructive'"`) — collapsing
// both into one `destructive` red discards the only reason the status was
// chosen.
describe('EvaluationAuditPanel — 409 and 403 refusals render with distinct Alert variants', () => {
  it.each([
    ['audit_disabled'],
    ['audit_already_running'],
    ['audit_lock_unavailable'],
    ['lifecycle_not_ready'],
  ])(
    'a 409 (%s) renders the NON-destructive variant — temporal, self-resolving',
    async (reason) => {
      triggerAuditMock.mockRejectedValue({ status: 409, data: { reason } })
      const wrapper = mount(EvaluationAuditPanel, {
        props: { participantId: 1, auditMeta: null },
        global: { mocks: { $t: tMock } },
      })

      await wrapper.get('[data-testid="evaluation-audit-trigger"]').trigger('click')
      await flushPromises()

      expect(wrapper.get('[data-testid="evaluation-audit-error"]').attributes('data-variant')).toBe(
        'default'
      )
    }
  )

  it('a 403 renders the destructive variant — a genuine permission denial', async () => {
    triggerAuditMock.mockRejectedValue({ status: 403, data: {} })
    const wrapper = mount(EvaluationAuditPanel, {
      props: { participantId: 1, auditMeta: null },
      global: { mocks: { $t: tMock } },
    })

    await wrapper.get('[data-testid="evaluation-audit-trigger"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="evaluation-audit-error"]').attributes('data-variant')).toBe(
      'destructive'
    )
  })
})

// v1 originally shipped with NO polling (design D6/D9) — the parent's own
// single best-effort re-fetch right after the 202 almost always raced the
// backend job and returned the SAME auditMeta, so the operator only ever saw
// the terminal status by reloading the page. This re-emits 'triggered' (the
// same event the parent already listens to and re-fetches on) on an
// interval, so the parent's existing re-fetch logic does the work — no new
// fetch path is introduced here.
describe('EvaluationAuditPanel — polls for the terminal status instead of waiting for a manual reload', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('re-emits triggered on an interval while in progress, and stops once a newer run lands', async () => {
    triggerAuditMock.mockResolvedValue({ status: 'queued', evaluation_id: 99 })
    const wrapper = mount(EvaluationAuditPanel, {
      props: { participantId: 1, auditMeta: null },
      global: { mocks: { $t: tMock } },
    })

    await wrapper.get('[data-testid="evaluation-audit-trigger"]').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('triggered')).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(3000)
    expect(wrapper.emitted('triggered')).toHaveLength(2)

    await vi.advanceTimersByTimeAsync(3000)
    expect(wrapper.emitted('triggered')).toHaveLength(3)

    // The newer run lands — polling must stop, no further emits.
    await wrapper.setProps({ auditMeta: meta({ run_id: 2, status: 'completed' }) })
    await vi.advanceTimersByTimeAsync(30000)
    expect(wrapper.emitted('triggered')).toHaveLength(3)
  })

  it('stops polling and shows a timeout fallback after the max wait, without emitting further', async () => {
    triggerAuditMock.mockResolvedValue({ status: 'queued', evaluation_id: 99 })
    const wrapper = mount(EvaluationAuditPanel, {
      props: { participantId: 1, auditMeta: null },
      global: { mocks: { $t: tMock } },
    })

    await wrapper.get('[data-testid="evaluation-audit-trigger"]').trigger('click')
    await flushPromises()

    // Well past the documented cap (~60s at a 3s interval) — no newer run ever lands.
    await vi.advanceTimersByTimeAsync(120000)
    await flushPromises()

    const emitCountAtCap = (wrapper.emitted('triggered') ?? []).length
    expect(emitCountAtCap).toBeGreaterThan(1)
    expect(wrapper.find('[data-testid="evaluation-audit-poll-timeout"]').exists()).toBe(true)
    // Still "in progress" — the outcome is genuinely unknown, not failed.
    expect(wrapper.find('[data-testid="evaluation-audit-progress"]').exists()).toBe(true)

    // No further emits past the cap.
    await vi.advanceTimersByTimeAsync(30000)
    expect(wrapper.emitted('triggered')).toHaveLength(emitCountAtCap)
  })

  it('a fresh trigger clears a prior timeout fallback', async () => {
    triggerAuditMock.mockResolvedValue({ status: 'queued', evaluation_id: 99 })
    const wrapper = mount(EvaluationAuditPanel, {
      props: { participantId: 1, auditMeta: null },
      global: { mocks: { $t: tMock } },
    })

    await wrapper.get('[data-testid="evaluation-audit-trigger"]').trigger('click')
    await flushPromises()
    await vi.advanceTimersByTimeAsync(120000)
    await flushPromises()
    expect(wrapper.find('[data-testid="evaluation-audit-poll-timeout"]').exists()).toBe(true)

    await wrapper.get('[data-testid="evaluation-audit-trigger"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="evaluation-audit-poll-timeout"]').exists()).toBe(false)
  })
})

describe('EvaluationAuditPanel — re-triggering resets client-local progress state', () => {
  it('a second trigger does not carry over a stale in-progress indicator from before it was clicked', async () => {
    triggerAuditMock.mockResolvedValueOnce({ status: 'queued', evaluation_id: 1 })
    const wrapper = mount(EvaluationAuditPanel, {
      props: { participantId: 1, auditMeta: null },
      global: { mocks: { $t: tMock } },
    })

    await wrapper.get('[data-testid="evaluation-audit-trigger"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="evaluation-audit-progress"]').exists()).toBe(true)

    // A second trigger refuses (409) — the stale "in progress" badge from the
    // FIRST click must not still be shown once the second one refuses.
    triggerAuditMock.mockRejectedValueOnce({
      status: 409,
      data: { reason: 'audit_already_running' },
    })
    await wrapper.get('[data-testid="evaluation-audit-trigger"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="evaluation-audit-progress"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="evaluation-audit-error"]').text()).toBe(
      'report.audit.refusal.audit_already_running'
    )
  })
})
