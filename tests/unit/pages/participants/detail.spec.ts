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

function detailResponse(status: string) {
  return {
    data: {
      id: 42,
      candidate_ref: 'ref-042',
      display_name: 'Jane Doe',
      role_code: 'FLL',
      language: 'it',
      status,
      project_id: 1,
      timeline: { started_at: '2026-03-14T10:00:00Z', completed_at: null, session_count: 3 },
      files: {
        transcript: { type: 'text/plain', ref: 'transcript', url: '/x' },
        evaluation_raw: { type: 'application/json', ref: 'evaluation', url: '/y' },
      },
      created_at: '2026-03-14T09:00:00Z',
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

  async function mountDetailPage(options: {
    status?: string
    fetchEvaluationImpl?: () => Promise<typeof EVALUATION_FIXTURE>
    downloadTranscriptMock?: ReturnType<typeof vi.fn>
    downloadEvaluationMock?: ReturnType<typeof vi.fn>
  }) {
    const {
      status = 'completato',
      fetchEvaluationImpl = () => Promise.resolve(EVALUATION_FIXTURE),
      downloadTranscriptMock = vi.fn().mockResolvedValue(undefined),
      downloadEvaluationMock = vi.fn().mockResolvedValue(undefined),
    } = options

    const fetchParticipantMock = vi.fn().mockResolvedValue(detailResponse(status))
    vi.doMock('../../../../app/composables/useParticipants', () => ({
      useParticipants: () => ({ fetchParticipant: fetchParticipantMock }),
    }))
    const fetchEvaluationMock = vi.fn().mockImplementation(fetchEvaluationImpl)
    vi.doMock('../../../../app/composables/useEvaluationReport', () => ({
      useEvaluationReport: () => ({ fetchEvaluation: fetchEvaluationMock }),
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

    return { wrapper, fetchEvaluationMock, downloadTranscriptMock, downloadEvaluationMock }
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
    expect(wrapper.text()).toContain('3')
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
})

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
