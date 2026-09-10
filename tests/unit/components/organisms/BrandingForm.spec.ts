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
import { realI18n } from '../../support/i18n'
import BrandingForm from '../../../../app/components/organisms/BrandingForm.vue'

// See ProfilePhotoForm.spec.ts: without this, `te` answers true to every
// key and a code with no copy renders its own name and passes.
vi.stubGlobal('useI18n', () => realI18n())

const updateOrganization = vi.fn()
const uploadLogo = vi.fn()
const removeLogo = vi.fn()

vi.mock('@/composables/useOrganization', () => ({
  useOrganization: () => ({ updateOrganization, uploadLogo, removeLogo }),
}))

// `applyServerFieldErrors` is NOT mocked. It is the shared mapper the Form
// Field Validation And Banner Contract mandates, and stubbing it to return
// null meant no test here could ever observe a 422 reaching a field — the
// suite was green and proved nothing about the one behaviour that contract
// exists to guarantee.
// `@/utils/server-message` is deliberately NOT mocked. It was, to the
// identity — so the one thing this form has to do with a server code, turn it
// into copy in the operator's language, was stubbed out of every test here.
// The suite was green and proved nothing about it, and `te` answering true to
// every key (see the stub above) meant even a code with no copy would have
// looked translated.

const stubs = {
  Field: { template: '<div><slot /></div>' },
  FieldGroup: { template: '<div><slot /></div>' },
  FieldLabel: { template: '<label><slot /></label>' },
  FieldDescription: { template: '<p><slot /></p>' },
  FieldError: { template: '<p><slot /></p>' },
  FormFieldset: { template: '<fieldset><slot /></fieldset>' },
  // `Alert` is NOT stubbed: the shared FormMessage puts the banner's testid
  // and its role/live-region on it, and a bare <div> stub drops all three.
  Button: { template: '<button><slot /></button>' },
  // TWO-WAY. The one-way stub this replaced never emitted
  // `update:modelValue`, so typing into the hex field changed nothing the
  // component could see — every assertion about a typed value passed for the
  // wrong reason, and a form that silently discarded input would have looked
  // identical here.
  Input: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template:
      '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
  // NOT stubbed away to an empty div: this dialog IS the protection on an
  // irreversible delete, and replacing it with <div /> removed the confirm
  // button and with it any coverage of the guarded path.
  ConfirmDialog: {
    props: ['open'],
    emits: ['confirm', 'cancel'],
    template:
      '<div v-if="open"><button data-testid="confirm-dialog-confirm" @click="$emit(\'confirm\')">ok</button><button data-testid="confirm-dialog-cancel" @click="$emit(\'cancel\')">no</button></div>',
  },
  // Stubbed rather than mounted: the real control portals a Dialog to
  // document.body, and what this spec is asserting is the CONTRACT between
  // the form and the control — which props it hands down, and what it does
  // with the file it gets back.
  ImageUploadField: {
    name: 'ImageUploadField',
    // `clear` is part of the contract the organism relies on, so the stub
    // exposes it — a stub without it would make the call a silent no-op and
    // the assertion below meaningless.
    methods: {
      clear() {
        this.cleared = (this.cleared ?? 0) + 1
      },
    },
    data() {
      return { cleared: 0 }
    },
    props: [
      'aspect',
      'fit',
      'shape',
      'previewUrl',
      'disabled',
      'invalid',
      'maxBytes',
      'outputWidth',
      'id',
      'testId',
      'describedBy',
    ],
    emits: ['cropped', 'reject', 'remove'],
    template:
      '<div data-testid="image-upload-field" :data-aspect="aspect" :data-fit="fit" :data-preview="previewUrl" :data-described="describedBy" :data-id="id" />',
  },
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
  // Reset ALL three: without this a call recorded by one test satisfies a
  // "was not called" assertion nowhere near it, and the failure surfaces in
  // whichever test happens to run second.
  uploadLogo.mockReset().mockResolvedValue({ data: { logo_url: null } })
  removeLogo.mockReset().mockResolvedValue({ data: { logo_url: null } })
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

describe('BrandingForm — the logo control', () => {
  it('frames the logo square, fitting the whole mark rather than filling', () => {
    const wrapper = mountForm(null)
    const field = wrapper.get('[data-testid="image-upload-field"]')

    expect(field.attributes('data-aspect')).toBe('1:1')
    // contain, not cover: a wide logotype cropped to fill a square loses its
    // ends, and most organizations have a wide logotype.
    expect(field.attributes('data-fit')).toBe('contain')
  })

  it('uploads the cropped file on SUBMIT, not on selection', async () => {
    uploadLogo.mockReset().mockResolvedValue({ data: { logo_url: 'https://api.test/new.png' } })

    const wrapper = mountForm('#123456')
    const file = new File(['bytes'], 'logo.png', { type: 'image/png' })

    await wrapper.findComponent({ name: 'ImageUploadField' }).vm.$emit('cropped', file)
    await flushPromises()

    // The colour and the logo are separate endpoints, so a logo that has not
    // been submitted yet must not have been sent yet either.
    expect(uploadLogo).not.toHaveBeenCalled()

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(uploadLogo).toHaveBeenCalledWith(file)
  })

  it('routes a rejected file to the field error, with no request', async () => {
    const wrapper = mountForm(null)

    await wrapper.findComponent({ name: 'ImageUploadField' }).vm.$emit('reject', 'tooLarge')
    await flushPromises()

    expect(uploadLogo).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="branding-logo-error"]').exists()).toBe(true)
  })

  it('puts removal behind the confirmation, never on the first click', async () => {
    removeLogo.mockReset().mockResolvedValue({ data: { logo_url: null } })

    const wrapper = mount(BrandingForm, {
      props: { organization: { primary_color: null, logo_url: 'https://api.test/logo.png' } },
      global: { stubs, mocks: { $t: (k: string) => k } },
    })

    await wrapper.findComponent({ name: 'ImageUploadField' }).vm.$emit('remove')
    await flushPromises()

    // Deleting the stored file is irreversible for an operator who no longer
    // has the original — which, months later, they very often do not.
    expect(removeLogo).not.toHaveBeenCalled()
  })

  it('shows the stored logo as the control preview', () => {
    const wrapper = mount(BrandingForm, {
      props: { organization: { primary_color: null, logo_url: 'https://api.test/logo.png' } },
      global: { stubs, mocks: { $t: (k: string) => k } },
    })

    expect(wrapper.get('[data-testid="image-upload-field"]').attributes('data-preview')).toBe(
      'https://api.test/logo.png'
    )
  })
})

describe('BrandingForm — the server-error contract', () => {
  it('maps a 422 on primary_color under the FIELD, with no retry banner', async () => {
    // The mandated mapper runs for real here. A banner saying "Could not save.
    // Please try again." on top of an exact field reason invites a retry that
    // will fail identically.
    updateOrganization.mockReset().mockRejectedValue({
      status: 422,
      data: { errors: { primary_color: ['invalid_color'] } },
    })

    const wrapper = mountForm('#123456')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    const error = wrapper.get('[data-testid="branding-color-error"]')
    expect(error.exists()).toBe(true)
    expect(wrapper.find('[data-testid="branding-banner"]').exists()).toBe(false)

    // Announced, not merely rendered: aria-invalid alone tells a screen
    // reader THAT the field is wrong and never WHY. The logo field one
    // control above already wires this; the colour field did not.
    // BOTH controls. `FieldLabel for="branding-color"` names the PICKER, so a
    // screen-reader user who lands on the labelled control would otherwise
    // never learn it is invalid, while the control that does announce it is
    // the unlabelled one. They are two views of one value and both carry its
    // state.
    for (const testId of ['branding-color-text', 'branding-color-picker']) {
      const described = wrapper.get(`[data-testid="${testId}"]`).attributes('aria-describedby')
      // The error AND the help text. Announcing "invalid" without the sentence
      // that explains the format leaves the help text existing for nobody.
      expect(described).toContain(error.attributes('id'))
      expect(described).toContain('branding-color-help')
      expect(wrapper.get(`[data-testid="${testId}"]`).attributes('aria-invalid')).toBe('true')
    }
  })

  it('clearing an invalid colour clears the error it caused', async () => {
    // Clear produces the VALID empty state ("use the product palette"), but
    // it never revalidated — so `aria-invalid` and the FieldError survived,
    // and the Clear button is `v-if="color"`, so it had already disappeared.
    // The operator was left with a field announced as invalid and no control
    // left to fix it.
    const wrapper = mountForm('#123456')

    const text = wrapper.get('[data-testid="branding-color-text"]')
    await text.setValue('zzz')
    await text.trigger('blur')
    expect(wrapper.find('[data-testid="branding-color-error"]').exists()).toBe(true)

    await wrapper.get('[data-testid="branding-color-clear"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="branding-color-error"]').exists()).toBe(false)
    for (const testId of ['branding-color-text', 'branding-color-picker']) {
      expect(wrapper.get(`[data-testid="${testId}"]`).attributes('aria-invalid')).toBe('false')
    }
  })

  it('falls back to the banner when the failure carries no field payload', async () => {
    // A network error or a 500 has nothing to attribute to a control, and
    // that is exactly what the banner is for.
    updateOrganization.mockReset().mockRejectedValue(new Error('network down'))

    const wrapper = mountForm('#123456')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-testid="branding-banner"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="branding-color-error"]').exists()).toBe(false)
  })

  it('deletes the logo only AFTER the confirmation is accepted', async () => {
    const wrapper = mount(BrandingForm, {
      props: { organization: { primary_color: null, logo_url: 'https://api.test/logo.png' } },
      global: { stubs, mocks: { $t: (k: string) => k } },
    })

    await wrapper.findComponent({ name: 'ImageUploadField' }).vm.$emit('remove')
    await flushPromises()
    expect(removeLogo).not.toHaveBeenCalled()

    await wrapper.get('[data-testid="confirm-dialog-confirm"]').trigger('click')
    await flushPromises()

    expect(removeLogo).toHaveBeenCalledTimes(1)
  })

  it('drops a standing field error when the removal succeeds', async () => {
    // A rejected crop sets `logoError`. Removing the STORED logo then
    // succeeds and the field kept announcing a failure about a file that was
    // never uploaded. `onRemoveRequested` already clears it on the cheap
    // no-stored-logo branch; the destructive path was the door left open.
    const wrapper = mount(BrandingForm, {
      props: { organization: { primary_color: null, logo_url: 'https://api.test/logo.png' } },
      global: { stubs, mocks: { $t: (k: string) => k } },
    })

    await wrapper.findComponent({ name: 'ImageUploadField' }).vm.$emit('reject', 'tooLarge')
    await flushPromises()
    expect(wrapper.find('[data-testid="branding-logo-error"]').exists()).toBe(true)

    await wrapper.findComponent({ name: 'ImageUploadField' }).vm.$emit('remove')
    await flushPromises()
    await wrapper.get('[data-testid="confirm-dialog-confirm"]').trigger('click')
    await flushPromises()

    expect(removeLogo).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="branding-logo-error"]').exists()).toBe(false)
  })

  it('cancelling the confirmation never deletes', async () => {
    const wrapper = mount(BrandingForm, {
      props: { organization: { primary_color: null, logo_url: 'https://api.test/logo.png' } },
      global: { stubs, mocks: { $t: (k: string) => k } },
    })

    await wrapper.findComponent({ name: 'ImageUploadField' }).vm.$emit('remove')
    await flushPromises()
    await wrapper.get('[data-testid="confirm-dialog-cancel"]').trigger('click')
    await flushPromises()

    expect(removeLogo).not.toHaveBeenCalled()
  })
})

describe('BrandingForm — removing a logo that was only just cropped', () => {
  it('drops the pending crop, so the next save does not re-upload it', async () => {
    // The confirmation promises "the file will be permanently deleted". A
    // queued crop surviving that meant a server DELETE followed by a silent
    // re-upload of the exact file the operator had removed.
    removeLogo.mockReset().mockResolvedValue({ data: { logo_url: null } })

    const wrapper = mount(BrandingForm, {
      props: { organization: { primary_color: null, logo_url: 'https://api.test/logo.png' } },
      global: { stubs, mocks: { $t: (k: string) => k } },
    })

    const file = new File(['bytes'], 'logo.png', { type: 'image/png' })
    await wrapper.findComponent({ name: 'ImageUploadField' }).vm.$emit('cropped', file)
    await wrapper.findComponent({ name: 'ImageUploadField' }).vm.$emit('remove')
    await flushPromises()
    await wrapper.get('[data-testid="confirm-dialog-confirm"]').trigger('click')
    await flushPromises()

    expect(removeLogo).toHaveBeenCalledTimes(1)

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(uploadLogo).not.toHaveBeenCalled()
  })
})

describe('BrandingForm — the labelled control', () => {
  it('points its label at the control the operator actually uses', () => {
    // `for` must name the dropzone BUTTON, which is the operable element and
    // takes the control's `id`. Pointing it at the hidden input gave the field
    // two controls with one name.
    const wrapper = mountForm(null)

    expect(wrapper.get('label').attributes('for')).toBe('branding-logo')
    expect(wrapper.get('[data-testid="image-upload-field"]').attributes('data-id')).toBe(
      'branding-logo'
    )
  })

  it('references the help text even with no error to report', () => {
    const wrapper = mountForm(null)

    expect(wrapper.get('[data-testid="image-upload-field"]').attributes('data-described')).toBe(
      'branding-logo-help'
    )
  })
})

describe('BrandingForm — the server codes it renders', () => {
  it('translates a colour code rather than printing it', async () => {
    // The endpoint answers `primary_color_invalid`, and nothing asserted that
    // this namespace could translate anything at all — it carried three logo
    // codes and no colour code, so a 422 on the colour rendered the raw wire
    // value.
    updateOrganization.mockReset().mockRejectedValueOnce(
      Object.assign(new Error('422'), {
        status: 422,
        data: { errors: { primary_color: ['primary_color_invalid'] } },
      })
    )

    const wrapper = mountForm('#123456')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-testid="branding-color-error"]').text()).toContain(
      'settings.branding.serverError.primary_color_invalid'
    )
  })

  // EVERY code the endpoint can emit under `logo`, not just the convenient
  // one. `translateServerCode` falls back to the raw code by design, so a
  // namespace missing a case renders snake_case at the operator instead of
  // failing — and asserting only `logo_too_large` left `logo_required` and
  // `logo_upload_failed` (the aborted-transfer branch, which a flaky
  // connection reaches) with no copy and a green suite.
  it.each([
    'logo_required',
    'logo_invalid_image',
    'logo_too_large',
    'logo_dimensions_invalid',
    'logo_upload_failed',
  ])('translates the logo code %s rather than printing it', async (code) => {
    uploadLogo.mockReset().mockRejectedValueOnce(
      Object.assign(new Error('422'), {
        status: 422,
        data: { errors: { logo: [code] } },
      })
    )

    const wrapper = mountForm('#123456')
    const control = wrapper.findComponent({ name: 'ImageUploadField' }) as unknown as {
      vm: { $emit: (e: string, p?: unknown) => void }
    }

    await control.vm.$emit('cropped', new File(['bytes'], 'logo.png', { type: 'image/png' }))
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-testid="branding-logo-error"]').text()).toBe(
      `settings.branding.serverError.${code}`
    )
  })
})

describe('BrandingForm — a rejected upload', () => {
  it('clears the control, so Remove cannot target the unseen stored logo', async () => {
    // The control previews the crop BEFORE it emits, and `logoUrl` still
    // points at the STORED logo. Leaving the refused crop on screen means the
    // Remove confirmation says "the file will be permanently deleted" about
    // the image on screen while deleting the one behind it.
    uploadLogo.mockReset().mockRejectedValueOnce(
      Object.assign(new Error('422'), {
        status: 422,
        data: { errors: { logo: ['logo_too_large'] } },
      })
    )

    const wrapper = mountForm('#123456')
    const control = wrapper.findComponent({ name: 'ImageUploadField' }) as unknown as {
      vm: { $emit: (e: string, p?: unknown) => void; cleared: number }
    }

    await control.vm.$emit('cropped', new File(['bytes'], 'logo.png', { type: 'image/png' }))
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(uploadLogo).toHaveBeenCalledTimes(1)
    expect(control.vm.cleared).toBe(1)

    // And the FILE goes with the preview. Clearing only the control leaves it
    // queued with nothing on screen referring to it, so this second save —
    // of the colour alone — silently re-uploads the image that was just
    // refused. `cleared === 1` alone cannot see that.
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(uploadLogo).toHaveBeenCalledTimes(1)
  })
})

describe('BrandingForm — removing when nothing is stored', () => {
  it('discards the crop locally, with no confirmation and no DELETE', async () => {
    // There is no file to delete. Firing the confirmation would promise "the
    // file will be permanently deleted... you will not be able to restore it"
    // about a blob the operator can re-pick in a second, and spend a DELETE on
    // a row that does not exist.
    const wrapper = mountForm(null)
    const control = wrapper.findComponent({ name: 'ImageUploadField' }) as unknown as {
      vm: { $emit: (e: string, p?: unknown) => void; cleared: number }
    }

    await control.vm.$emit('cropped', new File(['bytes'], 'logo.png', { type: 'image/png' }))
    await control.vm.$emit('remove')
    await flushPromises()

    expect(wrapper.find('[data-testid="confirm-dialog-confirm"]').exists()).toBe(false)
    expect(removeLogo).not.toHaveBeenCalled()
    expect(control.vm.cleared).toBe(1)

    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(uploadLogo).not.toHaveBeenCalled()
  })

  it('still confirms when a logo IS stored', async () => {
    const wrapper = mount(BrandingForm, {
      props: { organization: { primary_color: null, logo_url: 'https://api.test/logo.png' } },
      global: { stubs, mocks: { $t: (k: string) => k } },
    })

    await wrapper.findComponent({ name: 'ImageUploadField' }).vm.$emit('remove')
    await flushPromises()

    expect(wrapper.find('[data-testid="confirm-dialog-confirm"]').exists()).toBe(true)
    expect(removeLogo).not.toHaveBeenCalled()
  })
})
