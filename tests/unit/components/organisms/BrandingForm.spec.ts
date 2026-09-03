/**
 * Saving a colour must SHOW the colour.
 *
 * `applyBrandColor` ran in one place only — `layouts/default.vue`, on mount —
 * so an admin who picked a colour saw the old one until they reloaded the
 * page. The value was stored correctly and the UI simply did not agree with
 * it, which reads as a save that did not work.
 *
 * Applied here rather than by making the layout re-fetch: the form already
 * knows the new colour, and a round trip to learn what it just sent would be
 * slower and no more correct.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import BrandingForm from '../../../../app/components/organisms/BrandingForm.vue'

const updateOrganization = vi.fn()
const uploadLogo = vi.fn()
const removeLogo = vi.fn()

vi.mock('@/composables/useOrganization', () => ({
  useOrganization: () => ({ updateOrganization, uploadLogo, removeLogo }),
}))

vi.mock('@/utils/http-error', () => ({ applyServerFieldErrors: () => null }))
vi.mock('@/utils/server-message', () => ({
  translateServerCodes: (_a: unknown, _b: unknown, c: string[]) => c,
}))

const stubs = {
  Field: { template: '<div><slot /></div>' },
  FieldGroup: { template: '<div><slot /></div>' },
  FieldLabel: { template: '<label><slot /></label>' },
  FieldDescription: { template: '<p><slot /></p>' },
  FieldError: { template: '<p><slot /></p>' },
  FormFieldset: { template: '<fieldset><slot /></fieldset>' },
  Alert: { template: '<div><slot /></div>' },
  AlertDescription: { template: '<div><slot /></div>' },
  Button: { template: '<button><slot /></button>' },
  Input: { props: ['modelValue'], template: '<input :value="modelValue" />' },
  ConfirmDialog: { template: '<div />' },
}

function mountForm(primary: string | null) {
  return mount(BrandingForm, {
    props: { organization: { primary_color: primary, logo_url: null } },
    global: {
      stubs,
      mocks: { $t: (k: string) => k },
      config: { globalProperties: { $t: (k: string) => k } },
    },
  })
}

beforeEach(() => {
  updateOrganization.mockReset().mockResolvedValue({ data: {} })
  document.documentElement.style.removeProperty('--color-primary')
})

afterEach(() => {
  document.documentElement.style.removeProperty('--color-primary')
})

describe('BrandingForm', () => {
  it('paints the new colour on save, with no reload', async () => {
    const wrapper = mountForm('#123456')

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(updateOrganization).toHaveBeenCalledWith({ primary_color: '#123456' })
    expect(document.documentElement.style.getPropertyValue('--color-primary')).toBe('#123456')
  })

  it('restores the product palette when the colour is cleared', async () => {
    // Removal, not a written default — the same rule applyBrandColor follows.
    document.documentElement.style.setProperty('--color-primary', '#123456')

    const wrapper = mountForm(null)

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(updateOrganization).toHaveBeenCalledWith({ primary_color: null })
    expect(document.documentElement.style.getPropertyValue('--color-primary')).toBe('')
  })
})
