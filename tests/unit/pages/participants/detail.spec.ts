/**
 * pages/participants/[id].vue (PR B2, task 17.4 — RED)
 *
 * Detail view: participant summary + lifecycle timeline + artifact
 * readiness (client-side mirror of the server's LifecycleReadGate — see
 * participant-lifecycle.ts docblock for why this is a display-only mirror,
 * not a live 409 fetch: full transcript/evaluation viewing is PR B3).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'

const tMock = (key: string) => key

function detailResponse(status: string) {
  return {
    data: {
      id: '42',
      candidate_ref: 'ref-042',
      display_name: 'Jane Doe',
      role_code: 'FLL',
      language: 'it',
      status,
      project_id: '1',
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
      vi.fn(() => ({ locale: ref('en') }))
    )
    vi.stubGlobal(
      'useRoute',
      vi.fn(() => ({ params: { id: '42' } }))
    )
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
})

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
