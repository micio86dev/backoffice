/**
 * LlmModeExplainer.vue (pluggable-conversation-llm PR P8, task P8.3 — RED).
 *
 * Two facts an operator needs beside the picker (design D0/D9): `managed`
 * mode leaves ASR/TTS/turn-taking with the avatar provider — only the text
 * brain is swapped — and "actual cost" cannot appear here because the
 * provider calls Google directly; BEAI never receives a usage report to
 * measure. Static copy, no props: there is exactly one mode today.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LlmModeExplainer from '../../../../app/components/molecules/LlmModeExplainer.vue'

const tMock = (key: string) => key

describe('LlmModeExplainer', () => {
  it('explains what managed mode leaves untouched', () => {
    const wrapper = mount(LlmModeExplainer, { global: { mocks: { $t: tMock } } })

    expect(wrapper.text()).toContain('avatar_templates.llm.explainer.managedScope')
  })

  it('explains why actual cost is unavailable in managed mode', () => {
    const wrapper = mount(LlmModeExplainer, { global: { mocks: { $t: tMock } } })

    expect(wrapper.text()).toContain('avatar_templates.llm.explainer.costUnavailable')
  })
})
