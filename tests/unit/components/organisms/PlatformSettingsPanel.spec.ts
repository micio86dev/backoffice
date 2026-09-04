/**
 * PlatformSettingsPanel — BEAI's own knobs, editable only by the superadmin.
 *
 * The overwrite case below is why this file exists. The review gate caught it:
 * when the initial read fails, the form still shows the product's compiled-in
 * defaults, and `onSubmit` sends BOTH caps — so one click would have replaced
 * the platform's real stored settings with numbers the operator never saw and
 * did not choose. Silent, and indistinguishable from a deliberate change
 * afterwards.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const tMock = (key: string) => key

const fetchPlatformSettings = vi.fn()
const updatePlatformSettings = vi.fn()

vi.mock('../../../../app/composables/usePlatformSettings', () => ({
  usePlatformSettings: () => ({ fetchPlatformSettings, updatePlatformSettings }),
}))

async function mountPanel() {
  const { default: PlatformSettingsPanel } =
    await import('../../../../app/components/organisms/PlatformSettingsPanel.vue')

  const wrapper = mount(PlatformSettingsPanel, { global: { mocks: { $t: tMock } } })

  await flushPromises()

  return wrapper
}

describe('PlatformSettingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal(
      'useI18n',
      vi.fn(() => ({ t: tMock }))
    )
    fetchPlatformSettings.mockResolvedValue({
      data: { max_questions_per_competency: { standard: 2, potential: 4 } },
    })
    updatePlatformSettings.mockResolvedValue({
      data: { max_questions_per_competency: { standard: 3, potential: 4 } },
    })
  })

  it('shows what the platform currently has, not what the component defaults to', async () => {
    const wrapper = await mountPanel()

    expect(
      (wrapper.get('[data-testid="platform-max-questions-standard"]').element as HTMLInputElement)
        .value
    ).toBe('2')
  })

  it('saves and re-seeds from the server answer', async () => {
    // The server merges a partial write over the stored map, so its response is
    // the only account of what the settings now are.
    const wrapper = await mountPanel()

    await wrapper.get('[data-testid="platform-max-questions-standard"]').setValue('3')
    await wrapper.get('[data-testid="platform-settings-form"]').trigger('submit')
    await flushPromises()

    expect(updatePlatformSettings).toHaveBeenCalledWith({ standard: 3, potential: 4 })
  })

  it('marks the field that is actually out of range, not its neighbour', async () => {
    // One shared error ref drove aria-invalid on the standard input alone, so
    // an out-of-range POTENTIAL announced `standard` as invalid — it wasn't —
    // and marked `potential` as nothing at all. WCAG 3.3.1 asks which field is
    // wrong; the answer has to be the field that is.
    const wrapper = await mountPanel()

    await wrapper.get('[data-testid="platform-max-questions-potential"]').setValue('99')
    await wrapper.get('[data-testid="platform-settings-form"]').trigger('submit')
    await flushPromises()

    expect(updatePlatformSettings).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="platform-potential-error"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="platform-standard-error"]').exists()).toBe(false)
    expect(
      wrapper.get('[data-testid="platform-max-questions-standard"]').attributes('aria-invalid')
    ).not.toBe('true')
  })

  it('names the error before the help text, so a returning operator hears why', async () => {
    // `aria-invalid` says the value is wrong; only `aria-describedby` says why.
    // It used to be a static string naming the help text alone, and the
    // FieldError had no id to point at — so an operator tabbing back to fix the
    // value heard the label and the hint and never the message. Error id FIRST,
    // matching every other form in this app.
    const wrapper = await mountPanel()

    await wrapper.get('[data-testid="platform-max-questions-standard"]').setValue('99')
    await wrapper.get('[data-testid="platform-settings-form"]').trigger('submit')
    await flushPromises()

    const described = wrapper
      .get('[data-testid="platform-max-questions-standard"]')
      .attributes('aria-describedby')

    expect(described).toBe(
      'platform-max-questions-standard-error platform-max-questions-standard-help'
    )
    // And the id it names actually exists, or the attribute points at nothing.
    expect(wrapper.find('#platform-max-questions-standard-error').exists()).toBe(true)
  })

  it('shows the server’s own message when it refuses the range', async () => {
    // The server validates the same min:1|max:10, and a 422 from it must land
    // ON the setting rather than in a generic 'could not save' — otherwise the
    // operator is told it failed with no idea which number was refused.
    updatePlatformSettings.mockRejectedValue(
      Object.assign(new Error('HTTP 422'), {
        status: 422,
        data: {
          errors: { 'max_questions_per_competency.standard': ['Serve un intero fra 1 e 10.'] },
        },
      })
    )

    const wrapper = await mountPanel()

    await wrapper.get('[data-testid="platform-max-questions-standard"]').setValue('3')
    await wrapper.get('[data-testid="platform-settings-form"]').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-testid="platform-standard-error"]').text()).toContain(
      'Serve un intero fra 1 e 10.'
    )
  })

  describe('when the current values could not be read', () => {
    beforeEach(() => {
      fetchPlatformSettings.mockRejectedValue(new Error('offline'))
    })

    it('refuses to save, so defaults nobody chose cannot overwrite real settings', async () => {
      const wrapper = await mountPanel()

      await wrapper.get('[data-testid="platform-settings-form"]').trigger('submit')
      await flushPromises()

      // Not merely a disabled button: a form submits on Enter with no button
      // involved, so the handler itself has to refuse.
      expect(updatePlatformSettings).not.toHaveBeenCalled()
    })

    it('disables the save control and says why', async () => {
      const wrapper = await mountPanel()

      expect(
        wrapper.get('[data-testid="platform-settings-submit"]').attributes('disabled')
      ).toBeDefined()
      expect(wrapper.find('[data-testid="platform-settings-banner"]').exists()).toBe(true)
    })
  })
})
