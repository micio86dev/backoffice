/**
 * pages/participants/[id].vue (PR B2, task 17.4 — RED)
 *
 * Detail view: participant summary + lifecycle timeline + artifact
 * readiness (client-side mirror of the server's LifecycleReadGate — see
 * participant-lifecycle.ts docblock for why this is a display-only mirror,
 * not a live 409 fetch: full transcript/evaluation viewing is PR B3).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

const tMock = (key: string) => key

function detailResponse(
  status: string,
  project?: Record<string, unknown>,
  interview?: {
    progress?: Record<string, unknown>
    elapsed?: Record<string, unknown>
    cost?: Record<string, unknown>
  }
) {
  return {
    data: {
      id: 42,
      candidate_ref: 'ref-042',
      display_name: 'Jane Doe',
      role_code: 'FLL',
      language: 'it',
      status,
      project_id: 1,
      // operator-interview-link, design D5: nested gate fields, defaulted to
      // an eligible project so the pre-existing tests above (which know
      // nothing about the entry-link card) are unaffected.
      project: project ?? {
        id: 1,
        name: 'Demo Project',
        status: 'active',
        goes_live_at: null,
        deadline_at: null,
      },
      timeline: { started_at: '2026-03-14T10:00:00Z', completed_at: null, session_count: 3 },
      // operator-participant-visibility, design D3/D4/D6: the five facts the
      // aggregator derives, always present on a real response (never
      // optional in ParticipantDetailResource — see types/api.ts).
      progress: interview?.progress ?? { done: 6, total: 15 },
      elapsed: interview?.elapsed ?? { seconds: 780, sessions_counted: 2, sessions_total: 3 },
      cost: interview?.cost ?? {
        amount: 4.5,
        currency: 'USD',
        is_estimate: true,
        sessions_estimated: 2,
        sessions_total: 3,
      },
      files: {
        transcript: { type: 'text/plain', ref: 'transcript', url: '/x' },
        evaluation_raw: { type: 'application/json', ref: 'evaluation', url: '/y' },
      },
      created_at: '2026-03-14T09:00:00Z',
    },
  }
}

/** ProfileResponse fixture — operator-interview-link's viewer-gate source. */
function profileResponse(role: string) {
  return {
    data: {
      id: 1,
      name: 'Test User',
      email: 'user@example.com',
      locale: 'en',
      role,
      organization: { id: 1, name: 'Acme' },
      photo_url: null,
    },
  }
}

describe('pages/participants/[id].vue', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('definePageMeta', vi.fn())
    vi.stubGlobal('useHead', vi.fn())
    vi.stubGlobal(
      'useI18n',
      vi.fn(() => ({ t: (key: string) => key, locale: ref('en') }))
    )
    vi.stubGlobal(
      'useRoute',
      vi.fn(() => ({ params: { id: '42' } }))
    )
  })

  // --- BARS report section + downloads (PR B3, task 21.2 support) --------

  const EVALUATION_FIXTURE = {
    SLF: {
      score: 4,
      reliability: '67%',
      behaviors: [
        { indicator: 'a', score: 5, explanation: 'x', excerpts: ['ex1'] },
        { indicator: 'b', score: 3, explanation: 'y', excerpts: ['ex2'] },
        { indicator: 'c', score: null, explanation: 'z', excerpts: [] },
      ],
    },
  }

  // operator-participant-visibility PR4, D2/D7: fetched ONLY when the
  // client-side mirror (isParticipantResourceReady(status, 'transcript'))
  // already says the resource is reachable — this default fixture is what
  // every status >= in_corso (plus errore) receives unless a test overrides
  // it via `fetchTranscriptImpl`.
  const TRANSCRIPT_FIXTURE = {
    is_partial: false,
    sessions: [
      {
        session_id: 1,
        competency_code: 'COL',
        question_index: 0,
        utterances: [
          { speaker: 'avatar', text: 'Tell me about a time...', ts: '2026-03-14T10:00:00Z' },
          { speaker: 'candidate', text: 'Sure, once I...', ts: '2026-03-14T10:00:05Z' },
        ],
      },
    ],
  }

  async function mountDetailPage(options: {
    status?: string
    interview?: Parameters<typeof detailResponse>[2]
    fetchEvaluationImpl?: () => Promise<typeof EVALUATION_FIXTURE>
    fetchTranscriptImpl?: () => Promise<typeof TRANSCRIPT_FIXTURE>
    downloadTranscriptMock?: ReturnType<typeof vi.fn>
    downloadEvaluationMock?: ReturnType<typeof vi.fn>
  }) {
    const {
      status = 'completato',
      interview,
      fetchEvaluationImpl = () => Promise.resolve(EVALUATION_FIXTURE),
      fetchTranscriptImpl = () => Promise.resolve(TRANSCRIPT_FIXTURE),
      downloadTranscriptMock = vi.fn().mockResolvedValue(undefined),
      downloadEvaluationMock = vi.fn().mockResolvedValue(undefined),
    } = options

    const fetchParticipantMock = vi
      .fn()
      .mockResolvedValue(detailResponse(status, undefined, interview))
    vi.doMock('../../../../app/composables/useParticipants', () => ({
      useParticipants: () => ({ fetchParticipant: fetchParticipantMock }),
    }))
    const fetchEvaluationMock = vi.fn().mockImplementation(fetchEvaluationImpl)
    vi.doMock('../../../../app/composables/useEvaluationReport', () => ({
      useEvaluationReport: () => ({ fetchEvaluation: fetchEvaluationMock }),
    }))
    const fetchTranscriptMock = vi.fn().mockImplementation(fetchTranscriptImpl)
    vi.doMock('../../../../app/composables/useTranscript', () => ({
      useTranscript: () => ({ fetchTranscript: fetchTranscriptMock }),
    }))
    vi.doMock('../../../../app/composables/useDownloads', () => ({
      useDownloads: () => ({
        downloadTranscript: downloadTranscriptMock,
        downloadEvaluation: downloadEvaluationMock,
      }),
    }))

    const DetailPage = (await import('../../../../app/pages/participants/[id].vue')).default
    const wrapper = mount(DetailPage, {
      global: {
        mocks: { $t: tMock },
        stubs: { NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } },
      },
    })
    await flushPromises()

    return {
      wrapper,
      fetchEvaluationMock,
      fetchTranscriptMock,
      downloadTranscriptMock,
      downloadEvaluationMock,
    }
  }

  describe('BARS report section (D4 — three distinct, meaningful states, never a generic error toast)', () => {
    it('renders the evaluation report when the fetch succeeds', async () => {
      const { wrapper } = await mountDetailPage({ status: 'completato' })

      expect(wrapper.text()).toContain('SLF')
      expect(wrapper.text()).toContain('4.0')
    })

    it('renders a "not ready yet" state on 409 (temporal, self-resolving — distinct from 403/404)', async () => {
      const notReady = Object.assign(new Error('conflict'), { status: 409 })
      const { wrapper } = await mountDetailPage({
        status: 'in_valutazione',
        fetchEvaluationImpl: () => Promise.reject(notReady),
      })

      expect(wrapper.text()).toContain('report.states.notReady.title')
      expect(wrapper.text()).not.toContain('report.states.forbidden.title')
      expect(wrapper.text()).not.toContain('report.states.notFound.title')
    })

    it('renders a "forbidden" state on 403, DISTINCT from the 409 not-ready state', async () => {
      const forbidden = Object.assign(new Error('forbidden'), { status: 403 })
      const { wrapper } = await mountDetailPage({
        status: 'completato',
        fetchEvaluationImpl: () => Promise.reject(forbidden),
      })

      expect(wrapper.text()).toContain('report.states.forbidden.title')
      expect(wrapper.text()).not.toContain('report.states.notReady.title')
    })

    it('renders a "not found" state on 404, DISTINCT from 409/403', async () => {
      const notFound = Object.assign(new Error('not found'), { status: 404 })
      const { wrapper } = await mountDetailPage({
        status: 'completato',
        fetchEvaluationImpl: () => Promise.reject(notFound),
      })

      expect(wrapper.text()).toContain('report.states.notFound.title')
      expect(wrapper.text()).not.toContain('report.states.notReady.title')
      expect(wrapper.text()).not.toContain('report.states.forbidden.title')
    })

    it('renders a generic error state for anything else (network failure, 500, ...)', async () => {
      const serverError = Object.assign(new Error('boom'), { status: 500 })
      const { wrapper } = await mountDetailPage({
        status: 'completato',
        fetchEvaluationImpl: () => Promise.reject(serverError),
      })

      expect(wrapper.text()).toContain('report.states.error.title')
    })
  })

  describe('Downloads (D9 — fetch-then-blob, gated identically to the read endpoints)', () => {
    it('clicking the transcript download button calls downloadTranscript with the participant id', async () => {
      const { wrapper, downloadTranscriptMock } = await mountDetailPage({ status: 'completato' })

      await wrapper.get('[data-testid="download-transcript"]').trigger('click')
      await flushPromises()

      expect(downloadTranscriptMock).toHaveBeenCalledTimes(1)
      expect(downloadTranscriptMock.mock.calls[0]?.[0]).toBe(42)
    })

    it('clicking the evaluation download button calls downloadEvaluation with the participant id', async () => {
      const { wrapper, downloadEvaluationMock } = await mountDetailPage({ status: 'completato' })

      await wrapper.get('[data-testid="download-evaluation"]').trigger('click')
      await flushPromises()

      expect(downloadEvaluationMock).toHaveBeenCalledTimes(1)
      expect(downloadEvaluationMock.mock.calls[0]?.[0]).toBe(42)
    })

    it('disables the evaluation download button when the participant is not yet completato', async () => {
      const { wrapper } = await mountDetailPage({
        status: 'in_valutazione',
        fetchEvaluationImpl: () =>
          Promise.reject(Object.assign(new Error('conflict'), { status: 409 })),
      })

      const button = wrapper.get('[data-testid="download-evaluation"]')
      expect(button.attributes('disabled')).toBeDefined()
    })

    it('shows a distinct inline message when a download itself is rejected with 409 (race: status changed after page load)', async () => {
      const notReady = Object.assign(new Error('conflict'), { status: 409 })
      const { wrapper } = await mountDetailPage({
        status: 'completato',
        downloadTranscriptMock: vi.fn().mockRejectedValue(notReady),
      })

      await wrapper.get('[data-testid="download-transcript"]').trigger('click')
      await flushPromises()

      expect(wrapper.text()).toContain('report.states.notReady.title')
    })
  })

  it('fetches the participant by route id and renders their summary + timeline', async () => {
    const fetchParticipantMock = vi.fn().mockResolvedValue(detailResponse('in_valutazione'))
    vi.doMock('../../../../app/composables/useParticipants', () => ({
      useParticipants: () => ({ fetchParticipant: fetchParticipantMock }),
    }))

    const DetailPage = (await import('../../../../app/pages/participants/[id].vue')).default
    const wrapper = mount(DetailPage, {
      global: {
        mocks: { $t: tMock },
        stubs: { NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } },
      },
    })
    await flushPromises()

    expect(fetchParticipantMock).toHaveBeenCalledWith('42')
    expect(wrapper.text()).toContain('Jane Doe')
    // The raw session_count row is gone (D5: "stops being rendered" — it
    // counts session ROWS, not ended competencies, and the aggregator's
    // done/total below is the number an operator actually needs).
    expect(wrapper.text()).not.toContain('participants.detail.timeline.sessionCount')
  })

  it('shows the transcript as ready and the evaluation as not-ready at in_valutazione (mirrors the server gate, D2)', async () => {
    const fetchParticipantMock = vi.fn().mockResolvedValue(detailResponse('in_valutazione'))
    vi.doMock('../../../../app/composables/useParticipants', () => ({
      useParticipants: () => ({ fetchParticipant: fetchParticipantMock }),
    }))

    const DetailPage = (await import('../../../../app/pages/participants/[id].vue')).default
    const wrapper = mount(DetailPage, {
      global: {
        mocks: { $t: tMock },
        stubs: { NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } },
      },
    })
    await flushPromises()

    const transcript = wrapper.get('[data-testid="resource-transcript"]')
    expect(transcript.text()).toContain('participants.detail.resources.ready')
    const evaluation = wrapper.get('[data-testid="resource-evaluation"]')
    expect(evaluation.text()).toContain('participants.detail.resources.notReady')
  })

  it('shows BOTH artifacts as ready once the participant is completato (triangulation: a DIFFERENT status flips both)', async () => {
    const fetchParticipantMock = vi.fn().mockResolvedValue(detailResponse('completato'))
    vi.doMock('../../../../app/composables/useParticipants', () => ({
      useParticipants: () => ({ fetchParticipant: fetchParticipantMock }),
    }))

    const DetailPage = (await import('../../../../app/pages/participants/[id].vue')).default
    const wrapper = mount(DetailPage, {
      global: {
        mocks: { $t: tMock },
        stubs: { NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } },
      },
    })
    await flushPromises()

    expect(wrapper.get('[data-testid="resource-transcript"]').text()).toContain(
      'participants.detail.resources.ready'
    )
    expect(wrapper.get('[data-testid="resource-evaluation"]').text()).toContain(
      'participants.detail.resources.ready'
    )
  })

  it('routes the <title> through i18n instead of a hardcoded English literal', async () => {
    const useHeadMock = vi.fn()
    vi.stubGlobal('useHead', useHeadMock)
    vi.doMock('../../../../app/composables/useParticipants', () => ({
      useParticipants: () => ({
        fetchParticipant: vi.fn().mockResolvedValue(detailResponse('completato')),
      }),
    }))

    const DetailPage = (await import('../../../../app/pages/participants/[id].vue')).default
    mount(DetailPage, {
      global: {
        mocks: { $t: tMock },
        stubs: { NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } },
      },
    })

    const head = useHeadMock.mock.calls[0]?.[0] as { title?: () => string }
    expect(typeof head?.title).toBe('function')
    expect(head?.title?.()).toBe('head.title.participantDetail')
  })

  describe('failed PRIMARY participant fetch (D4 — a failure must never render as a blank page)', () => {
    async function mountWithParticipantStatus(status: number) {
      const fetchEvaluationMock = vi.fn().mockResolvedValue(EVALUATION_FIXTURE)
      vi.doMock('../../../../app/composables/useParticipants', () => ({
        useParticipants: () => ({
          fetchParticipant: vi
            .fn()
            .mockRejectedValue(Object.assign(new Error(`HTTP ${status}`), { status })),
        }),
      }))
      vi.doMock('../../../../app/composables/useEvaluationReport', () => ({
        useEvaluationReport: () => ({ fetchEvaluation: fetchEvaluationMock }),
      }))
      vi.doMock('../../../../app/composables/useDownloads', () => ({
        useDownloads: () => ({
          downloadTranscript: vi.fn(),
          downloadEvaluation: vi.fn(),
        }),
      }))

      const DetailPage = (await import('../../../../app/pages/participants/[id].vue')).default
      const wrapper = mount(DetailPage, {
        global: {
          mocks: { $t: tMock },
          stubs: { NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } },
        },
      })
      await flushPromises()
      return { wrapper, fetchEvaluationMock }
    }

    it.each([
      [403, 'errors.states.forbidden', ['errors.states.notFound', 'errors.states.notReady']],
      [404, 'errors.states.notFound', ['errors.states.forbidden', 'errors.states.notReady']],
      [409, 'errors.states.notReady', ['errors.states.forbidden', 'errors.states.notFound']],
      [500, 'errors.states.error', ['errors.states.forbidden', 'errors.states.notFound']],
    ])(
      'renders the %i state distinctly instead of a blank page with a back-link',
      async (status, expectedKey, otherKeys) => {
        const { wrapper } = await mountWithParticipantStatus(status as number)

        expect(wrapper.find('[data-testid="participant-error"]').exists()).toBe(true)
        expect(wrapper.text()).toContain(`${expectedKey}.title`)
        expect(wrapper.text()).toContain(`${expectedKey}.message`)
        // The blank-page symptom: the detail body never rendered and nothing
        // told the operator why.
        expect(wrapper.find('[data-testid="resource-transcript"]').exists()).toBe(false)
        for (const otherKey of otherKeys as string[]) {
          expect(wrapper.text()).not.toContain(`${otherKey}.title`)
        }
      }
    )

    it('keeps 409 and 403 distinct on the error element itself', async () => {
      const notReady = await mountWithParticipantStatus(409)
      vi.resetModules()
      const forbidden = await mountWithParticipantStatus(403)

      const notReadyState = notReady.wrapper
        .find('[data-testid="participant-error"]')
        .attributes('data-state')
      const forbiddenState = forbidden.wrapper
        .find('[data-testid="participant-error"]')
        .attributes('data-state')

      expect(notReadyState).toBe('not-ready')
      expect(forbiddenState).toBe('forbidden')
      expect(notReadyState).not.toBe(forbiddenState)
    })

    it('does NOT fetch the evaluation for a participant it could not read', async () => {
      const { fetchEvaluationMock } = await mountWithParticipantStatus(403)

      expect(fetchEvaluationMock).not.toHaveBeenCalled()
    })

    it('renders no participant error at all on the success path', async () => {
      const { wrapper } = await mountDetailPage({ status: 'completato' })

      expect(wrapper.find('[data-testid="participant-error"]').exists()).toBe(false)
      expect(wrapper.text()).toContain('Jane Doe')
    })
  })

  // ─────────────────────────────────────────────────────────────────────
  // "Generate new link" re-issue card (operator-interview-link, design
  // D4/D5) — the participant-detail half of the entry-link mint surface.
  // entry-link.spec.ts (e2e) and EntryLinkPanel.spec.ts/EntryLinkForm.spec.ts
  // cover the shared organisms in isolation; this describe block is what
  // proves THIS page wires them correctly: viewer gating, disabled-with-
  // reason rendering off the nested `project` gate fields, and the
  // success/error mint flow.
  // ─────────────────────────────────────────────────────────────────────
  describe('"Generate new link" card (operator-interview-link)', () => {
    async function mountEntryLinkCard(options: {
      role?: string
      project?: Record<string, unknown>
      generateEntryLinkMock?: ReturnType<typeof vi.fn>
    }) {
      const { role = 'operator', project, generateEntryLinkMock = vi.fn() } = options

      vi.doMock('../../../../app/composables/useParticipants', () => ({
        useParticipants: () => ({
          fetchParticipant: vi.fn().mockResolvedValue(detailResponse('in_attesa', project)),
        }),
      }))
      vi.doMock('../../../../app/composables/useProfile', () => ({
        useProfile: () => ({ fetchProfile: vi.fn().mockResolvedValue(profileResponse(role)) }),
      }))
      vi.doMock('../../../../app/composables/useEntryLinks', () => ({
        useEntryLinks: () => ({ generateEntryLink: generateEntryLinkMock }),
      }))
      // Secondary content on this page — mocked to resolved/rejected
      // no-ops so it never interferes with the entry-link assertions below.
      vi.doMock('../../../../app/composables/useEvaluationReport', () => ({
        useEvaluationReport: () => ({ fetchEvaluation: vi.fn().mockResolvedValue({}) }),
      }))
      vi.doMock('../../../../app/composables/useDownloads', () => ({
        useDownloads: () => ({ downloadTranscript: vi.fn(), downloadEvaluation: vi.fn() }),
      }))
      vi.doMock('../../../../app/composables/useSessionReview', () => ({
        useSessionReview: () => ({ listSessions: vi.fn().mockResolvedValue({ data: [] }) }),
      }))

      const DetailPage = (await import('../../../../app/pages/participants/[id].vue')).default
      const wrapper = mount(DetailPage, {
        global: {
          mocks: { $t: tMock },
          stubs: { NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } },
        },
      })
      await flushPromises()
      // The viewer-gate profile fetch (`loadViewerGate`) is a SEPARATE,
      // un-awaited (`void`) call in onMounted — a second flush lets its own
      // microtask queue drain after the first one already resolved the
      // primary participant fetch.
      await flushPromises()

      return wrapper
    }

    it('renders the card, enabled, for an operator viewing an eligible (active) project', async () => {
      const wrapper = await mountEntryLinkCard({ role: 'operator' })

      const button = wrapper.get('[data-testid="participant-generate-entry-link"]')
      expect(button.attributes('disabled')).toBeUndefined()
      expect(wrapper.find('[data-testid="participant-entry-link-disabled-reason"]').exists()).toBe(
        false
      )
    })

    it('renders the card, enabled, for an admin (both admin and operator may mint)', async () => {
      const wrapper = await mountEntryLinkCard({ role: 'admin' })

      expect(
        wrapper.get('[data-testid="participant-generate-entry-link"]').attributes('disabled')
      ).toBeUndefined()
    })

    it('hides the card entirely for a viewer — server-side 403 backed, but the control must not even render', async () => {
      const wrapper = await mountEntryLinkCard({ role: 'viewer' })

      expect(wrapper.find('[data-testid="participant-generate-entry-link"]').exists()).toBe(false)
    })

    it.each([
      ['draft', { status: 'draft', goes_live_at: null, deadline_at: null }, 'notActive'],
      [
        'not-yet-live',
        { status: 'active', goes_live_at: '2099-01-01T00:00:00Z', deadline_at: null },
        'notYetLive',
      ],
      [
        'expired',
        { status: 'active', goes_live_at: null, deadline_at: '2020-01-01T00:00:00Z' },
        'expired',
      ],
    ])(
      'disables the action with a stated reason for a %s project',
      async (_label, projectOverrides, expectedReasonKey) => {
        const project = {
          id: 1,
          name: 'Demo Project',
          ...projectOverrides,
        }
        const wrapper = await mountEntryLinkCard({ role: 'operator', project })

        expect(
          wrapper.get('[data-testid="participant-generate-entry-link"]').attributes('disabled')
        ).toBeDefined()
        expect(
          wrapper.get('[data-testid="participant-entry-link-disabled-reason"]').text()
        ).toContain(`entryLink.disabledReason.${expectedReasonKey}`)
      }
    )

    it('leaves the action enabled for an eligible project (active, past goes_live_at, before deadline_at)', async () => {
      const project = {
        id: 1,
        name: 'Demo Project',
        status: 'active',
        goes_live_at: '2020-01-01T00:00:00Z',
        deadline_at: '2099-01-01T00:00:00Z',
      }
      const wrapper = await mountEntryLinkCard({ role: 'operator', project })

      expect(
        wrapper.get('[data-testid="participant-generate-entry-link"]').attributes('disabled')
      ).toBeUndefined()
    })

    it("mints with the participant's own project_id/candidate_ref/display_name/role_code/language, and swaps to EntryLinkPanel on success", async () => {
      const generateEntryLinkMock = vi.fn().mockResolvedValue({
        entry_url: 'https://interview.example.com/interview/reissue-tok',
        expires_at: '2026-08-17T15:32:00.000000Z',
      })
      const wrapper = await mountEntryLinkCard({ role: 'operator', generateEntryLinkMock })

      await wrapper.get('[data-testid="participant-generate-entry-link"]').trigger('click')
      await flushPromises()

      expect(generateEntryLinkMock).toHaveBeenCalledWith({
        project_id: 1,
        candidate_ref: 'ref-042',
        display_name: 'Jane Doe',
        role_code: 'FLL',
        lang: 'it',
      })
      expect(wrapper.find('[data-testid="participant-generate-entry-link"]').exists()).toBe(false)
      expect(wrapper.get('[data-testid="entry-link-url"]').text()).toBe(
        'https://interview.example.com/interview/reissue-tok'
      )
    })

    it('shows an inline error and keeps the button available to retry when the mint rejects', async () => {
      const generateEntryLinkMock = vi.fn().mockRejectedValue(new Error('boom'))
      const wrapper = await mountEntryLinkCard({ role: 'operator', generateEntryLinkMock })

      await wrapper.get('[data-testid="participant-generate-entry-link"]').trigger('click')
      await flushPromises()

      expect(wrapper.get('[data-testid="participant-entry-link-error"]').text()).toContain(
        'entryLink.mintError'
      )
      // The button is still there — a failed mint must not strand the
      // operator on a page with no way to retry.
      expect(wrapper.find('[data-testid="participant-generate-entry-link"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="entry-link-url"]').exists()).toBe(false)
    })

    it('re-mints (via EntryLinkPanel\'s "generate" event) with the SAME participant payload', async () => {
      const generateEntryLinkMock = vi
        .fn()
        .mockResolvedValueOnce({
          entry_url: 'https://interview.example.com/interview/first-tok',
          expires_at: '2026-08-17T15:32:00.000000Z',
        })
        .mockResolvedValueOnce({
          entry_url: 'https://interview.example.com/interview/second-tok',
          expires_at: '2026-08-17T16:02:00.000000Z',
        })
      const wrapper = await mountEntryLinkCard({ role: 'operator', generateEntryLinkMock })

      await wrapper.get('[data-testid="participant-generate-entry-link"]').trigger('click')
      await flushPromises()
      expect(wrapper.get('[data-testid="entry-link-url"]').text()).toBe(
        'https://interview.example.com/interview/first-tok'
      )

      await wrapper.get('[data-testid="entry-link-generate"]').trigger('click')
      await flushPromises()

      expect(generateEntryLinkMock).toHaveBeenCalledTimes(2)
      expect(wrapper.get('[data-testid="entry-link-url"]').text()).toBe(
        'https://interview.example.com/interview/second-tok'
      )
    })
  })

  // ─────────────────────────────────────────────────────────────────────
  // Interview summary: status/progress/elapsed/cost (operator-participant-
  // visibility, design D3–D6). The operator's original complaint was that a
  // five-state lifecycle, and everything derived from it, rendered as one
  // flat "3" — these tests pin each of the five missing facts individually.
  // ─────────────────────────────────────────────────────────────────────
  describe('Interview summary (status/progress/elapsed/cost)', () => {
    it('renders the real lifecycle status value, never a boolean/reduction (errore case)', async () => {
      const { wrapper } = await mountDetailPage({ status: 'errore' })

      // StatusBadge already renders the literal value through
      // participants.status.<status> (participant-lifecycle.ts); this test
      // pins that the detail page still surfaces it — not "not completed",
      // not a boolean.
      expect(wrapper.text()).toContain('participants.status.errore')
      expect(wrapper.text()).not.toContain('participants.status.completato')
    })

    it('renders progress as done / total, not the bare session_count', async () => {
      const { wrapper } = await mountDetailPage({
        status: 'in_corso',
        interview: { progress: { done: 6, total: 15 } },
      })

      expect(wrapper.text()).toContain('6 / 15')
    })

    it('renders a DIFFERENT done/total for a different fixture (proves real data, not a fixed string)', async () => {
      const { wrapper } = await mountDetailPage({
        status: 'in_corso',
        interview: { progress: { done: 2, total: 18 } },
      })

      expect(wrapper.text()).toContain('2 / 18')
      expect(wrapper.text()).not.toContain('6 / 15')
    })

    it('labels the cost figure through the estimate copy key unconditionally', async () => {
      const { wrapper } = await mountDetailPage({
        status: 'in_corso',
        interview: {
          cost: {
            amount: 4.5,
            currency: 'USD',
            is_estimate: true,
            sessions_estimated: 3,
            sessions_total: 3,
          },
        },
      })

      expect(wrapper.text()).toContain('review.costEstimate')
    })

    it('states how many sessions contributed when the cost total is partial', async () => {
      const { wrapper } = await mountDetailPage({
        status: 'in_corso',
        interview: {
          cost: {
            amount: 4.5,
            currency: 'USD',
            is_estimate: true,
            sessions_estimated: 2,
            sessions_total: 3,
          },
        },
      })

      expect(wrapper.get('[data-testid="cost-coverage"]').text()).toBe(
        'participants.detail.interview.costCoverage'
      )
    })

    it('states nothing about coverage when the cost total is complete (full coverage)', async () => {
      const { wrapper } = await mountDetailPage({
        status: 'in_corso',
        interview: {
          cost: {
            amount: 6,
            currency: 'USD',
            is_estimate: true,
            sessions_estimated: 3,
            sessions_total: 3,
          },
        },
      })

      expect(wrapper.find('[data-testid="cost-coverage"]').exists()).toBe(false)
    })

    it('renders a dash rather than 0 when no session yields a cost estimate', async () => {
      const { wrapper } = await mountDetailPage({
        status: 'in_corso',
        interview: {
          cost: {
            amount: null,
            currency: 'USD',
            is_estimate: true,
            sessions_estimated: 0,
            sessions_total: 3,
          },
        },
      })

      expect(wrapper.get('[data-testid="interview-cost"]').text()).toContain('–')
      expect(wrapper.get('[data-testid="interview-cost"]').text()).not.toContain('0')
    })

    it('renders a dash rather than 0 elapsed time when no session has finished', async () => {
      const { wrapper } = await mountDetailPage({
        status: 'in_corso',
        interview: { elapsed: { seconds: null, sessions_counted: 0, sessions_total: 3 } },
      })

      expect(wrapper.get('[data-testid="interview-elapsed"]').text()).toContain('–')
    })

    it('states how many sessions contributed when elapsed time is partial', async () => {
      const { wrapper } = await mountDetailPage({
        status: 'in_corso',
        interview: { elapsed: { seconds: 780, sessions_counted: 2, sessions_total: 3 } },
      })

      expect(wrapper.get('[data-testid="elapsed-coverage"]').text()).toBe(
        'participants.detail.interview.elapsedCoverage'
      )
    })

    it('a viewer sees every interview-summary field — no restriction beyond RBAC', async () => {
      vi.doMock('../../../../app/composables/useProfile', () => ({
        useProfile: () => ({
          fetchProfile: vi.fn().mockResolvedValue(profileResponse('viewer')),
        }),
      }))

      const { wrapper } = await mountDetailPage({
        status: 'in_corso',
        interview: {
          progress: { done: 6, total: 15 },
          elapsed: { seconds: 780, sessions_counted: 2, sessions_total: 3 },
          cost: {
            amount: 4.5,
            currency: 'USD',
            is_estimate: true,
            sessions_estimated: 2,
            sessions_total: 3,
          },
        },
      })

      expect(wrapper.text()).toContain('6 / 15')
      expect(wrapper.get('[data-testid="interview-elapsed"]').exists()).toBe(true)
      expect(wrapper.text()).toContain('review.costEstimate')
    })
  })

  // ─────────────────────────────────────────────────────────────────────
  // Transcript panel (operator-participant-visibility PR4, D2/D7): what
  // finally puts INN's 27 stored turns on screen. Task 4.13's own contract —
  // panel visibility uses the SAME isParticipantResourceReady(status,
  // 'transcript') gate as the download button, so the two can never
  // disagree about in_attesa.
  // ─────────────────────────────────────────────────────────────────────
  describe('Transcript panel (D2/D7)', () => {
    it('is unreachable at in_attesa — the SAME gate the download button uses', async () => {
      const { wrapper, fetchTranscriptMock } = await mountDetailPage({ status: 'in_attesa' })

      // The mirror must be known BEFORE the request (D7): no fetch attempt
      // at all when the gate is closed.
      expect(fetchTranscriptMock).not.toHaveBeenCalled()
      expect(wrapper.find('[data-testid="transcript-panel"]').exists()).toBe(false)
      expect(
        wrapper.get('[data-testid="download-transcript"]').attributes('disabled')
      ).toBeDefined()
    })

    it.each(['in_corso', 'in_valutazione', 'completato', 'errore'])(
      'is reachable at %s — the D1 minimum plus the errore off-progression allowance',
      async (status) => {
        const { wrapper, fetchTranscriptMock } = await mountDetailPage({ status })

        expect(fetchTranscriptMock).toHaveBeenCalledWith('42')
        expect(wrapper.find('[data-testid="transcript-panel"]').exists()).toBe(true)
        expect(
          wrapper.get('[data-testid="download-transcript"]').attributes('disabled')
        ).toBeUndefined()
      }
    )

    it('renders turns from the fetched payload, grouped by question', async () => {
      const { wrapper } = await mountDetailPage({ status: 'in_corso' })

      expect(wrapper.text()).toContain('COL')
      expect(wrapper.text()).toContain('Tell me about a time...')
      expect(wrapper.text()).toContain('Sure, once I...')
    })

    it('shows the partial label transported from the payload, NOT recomputed from status', async () => {
      // completato is the status a client-recomputed rule would call
      // "complete" — the payload disagrees, and the payload must win.
      const { wrapper } = await mountDetailPage({
        status: 'completato',
        fetchTranscriptImpl: () =>
          Promise.resolve({ is_partial: true, sessions: TRANSCRIPT_FIXTURE.sessions }),
      })

      expect(wrapper.find('[data-testid="transcript-partial"]').exists()).toBe(true)
    })

    it('shows no partial label when the payload says complete, even at errore (varying only the payload)', async () => {
      const { wrapper } = await mountDetailPage({
        status: 'errore',
        fetchTranscriptImpl: () =>
          Promise.resolve({ is_partial: false, sessions: TRANSCRIPT_FIXTURE.sessions }),
      })

      expect(wrapper.find('[data-testid="transcript-partial"]').exists()).toBe(false)
    })

    it('surfaces a distinct error state if the transcript fetch fails despite the gate being open', async () => {
      const serverError = Object.assign(new Error('boom'), { status: 500 })
      const { wrapper } = await mountDetailPage({
        status: 'in_corso',
        fetchTranscriptImpl: () => Promise.reject(serverError),
      })

      expect(wrapper.find('[data-testid="transcript-load-error"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="transcript-panel"]').exists()).toBe(false)
    })
  })
})

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
