/**
 * ProfilePhotoForm.vue (user-avatar-image D6; reworked by
 * image-upload-crop-field D2/D3).
 *
 * The photo now goes through the SAME control as the organization logo. What
 * changed here is where the rectangle comes from: a file is framed in the
 * crop dialog first, and the form uploads the cropped result. What did not
 * change is everything else this spec has always asserted — immediate save on
 * selection, aria-busy, mapped 422s, and removal behind a confirmation.
 *
 * `ImageUploadField` is stubbed: it portals a Dialog to document.body and has
 * its own spec. What matters here is the CONTRACT between form and control.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { waitFor, waitForTestId } from '../../support/wait-for'

const tMock = (key: string) => key
const uploadPhotoMock = vi.fn()
const deletePhotoMock = vi.fn()

vi.mock('../../../../app/composables/useProfile', () => ({
  useProfile: () => ({ uploadPhoto: uploadPhotoMock, deletePhoto: deletePhotoMock }),
}))

const ProfilePhotoForm = (await import('../../../../app/components/organisms/ProfilePhotoForm.vue'))
  .default

const ImageUploadFieldStub = {
  name: 'ImageUploadField',
  props: [
    'aspect',
    'fit',
    'shape',
    'previewUrl',
    'fallbackText',
    'disabled',
    'invalid',
    'maxBytes',
    'outputWidth',
    'id',
    'testId',
    'describedBy',
  ],
  emits: ['cropped', 'reject', 'remove'],
  // `clear` is part of the contract the organism relies on. A stub without it
  // would make the call a silent no-op and the assertions below meaningless.
  methods: {
    clear() {
      this.cleared = (this.cleared ?? 0) + 1
    },
  },
  data() {
    return { cleared: 0 }
  },
  template:
    '<div data-testid="image-upload-field" :data-aspect="aspect" :data-fit="fit" :data-shape="shape" :data-preview="previewUrl" :data-fallback="fallbackText" :data-disabled="disabled" />',
}

const croppedFile = () => new File(['bytes'], 'image.jpg', { type: 'image/jpeg' })

function mountForm(photoUrl: string | null = null, attach = false) {
  return mount(ProfilePhotoForm, {
    props: { photoUrl, name: 'Ada Lovelace' },
    global: { mocks: { $t: tMock }, stubs: { ImageUploadField: ImageUploadFieldStub } },
    ...(attach ? { attachTo: document.body } : {}),
  })
}

function control(wrapper: ReturnType<typeof mountForm>) {
  return wrapper.findComponent(ImageUploadFieldStub)
}

describe('ProfilePhotoForm', () => {
  beforeEach(() => {
    uploadPhotoMock
      .mockReset()
      .mockResolvedValue({ data: { photo_url: 'https://example.test/new.jpg' } })
    deletePhotoMock.mockReset().mockResolvedValue({ data: { photo_url: null } })
  })

  it('uses the shared control, framed as a filled circle', () => {
    const field = mountForm().get('[data-testid="image-upload-field"]')

    expect(field.attributes('data-aspect')).toBe('1:1')
    // cover, not contain: a face has no edges worth preserving, and padding
    // inside a circular mask reads as a rendering fault.
    expect(field.attributes('data-fit')).toBe('cover')
    expect(field.attributes('data-shape')).toBe('circle')
  })

  it('hands the stored photo to the control as its preview', () => {
    const field = mountForm('https://example.test/current.jpg').get(
      '[data-testid="image-upload-field"]'
    )

    expect(field.attributes('data-preview')).toBe('https://example.test/current.jpg')
  })

  it('gives the control initials to fall back on when the photo URL expires', () => {
    // A signed photo URL 404s once its window closes; without this the
    // operator sees a broken-image glyph where their face was.
    const field = mountForm('https://example.test/current.jpg').get(
      '[data-testid="image-upload-field"]'
    )

    expect(field.attributes('data-fallback')).toBe('AL')
  })

  it('uploads the CROPPED file as soon as it is confirmed', async () => {
    const wrapper = mountForm()
    const file = croppedFile()

    await control(wrapper).vm.$emit('cropped', file)
    await flushPromises()

    expect(uploadPhotoMock).toHaveBeenCalledWith(file)
    expect(wrapper.emitted('saved')).toBeTruthy()
  })

  it('sets aria-busy and disables the control while uploading', async () => {
    let resolveUpload: (value: unknown) => void = () => {}
    uploadPhotoMock.mockReset().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpload = resolve
        })
    )

    const wrapper = mountForm('https://example.test/current.jpg')
    await control(wrapper).vm.$emit('cropped', croppedFile())
    await flushPromises()

    expect(wrapper.get('[data-testid="profile-photo-form"]').attributes('aria-busy')).toBe('true')
    expect(wrapper.get('[data-testid="image-upload-field"]').attributes('data-disabled')).toBe(
      'true'
    )

    resolveUpload({ data: { photo_url: 'https://example.test/new.jpg' } })
    await flushPromises()

    expect(wrapper.get('[data-testid="profile-photo-form"]').attributes('aria-busy')).toBe('false')
  })

  it('a file rejected by the control fails instantly, with no round trip', async () => {
    const wrapper = mountForm()

    await control(wrapper).vm.$emit('reject', 'tooLarge')
    await flushPromises()

    expect(uploadPhotoMock).not.toHaveBeenCalled()
    expect(wrapper.get('[data-testid="profile-photo-error"]').exists()).toBe(true)
  })

  it('a 422 on the photo field maps under the control via applyServerFieldErrors', async () => {
    uploadPhotoMock.mockReset().mockRejectedValueOnce(
      Object.assign(new Error('422'), {
        status: 422,
        data: { errors: { photo: ['photo_invalid_image'] } },
      })
    )

    const wrapper = mountForm()
    await control(wrapper).vm.$emit('cropped', croppedFile())
    await flushPromises()

    // The endpoint sends a CODE; this layer is the only one that knows the
    // operator's language, so the rendered text is the translation key, never
    // the wire value.
    expect(wrapper.get('[data-testid="profile-photo-error"]').text()).toContain(
      'profile.photo.serverError.photo_invalid_image'
    )
  })

  it('an unmapped upload failure surfaces in the banner', async () => {
    uploadPhotoMock.mockReset().mockRejectedValueOnce(new Error('network error'))

    const wrapper = mountForm()
    await control(wrapper).vm.$emit('cropped', croppedFile())
    await flushPromises()

    expect(wrapper.get('[data-testid="profile-photo-banner"]').attributes('role')).toBe('alert')
  })

  // ConfirmDialog (AlertDialog) content is teleported to document.body, not
  // a descendant of `wrapper` — same discipline as ApiKeysPanel.spec.ts's
  // revoke-confirmation test.
  it('Remove opens ConfirmDialog — nothing is deleted on the first click', async () => {
    const wrapper = mountForm('https://example.test/current.jpg', true)

    await control(wrapper).vm.$emit('remove')
    await waitForTestId('confirm-dialog-confirm')

    expect(deletePhotoMock).not.toHaveBeenCalled()
    expect(document.body.querySelector('[data-testid="confirm-dialog-confirm"]')).not.toBeNull()

    wrapper.unmount()
  })

  it('confirming Remove calls deletePhoto and emits saved', async () => {
    const wrapper = mountForm('https://example.test/current.jpg', true)

    await control(wrapper).vm.$emit('remove')
    await waitForTestId('confirm-dialog-confirm')

    const confirmButton = document.body.querySelector<HTMLButtonElement>(
      '[data-testid="confirm-dialog-confirm"]'
    )
    // A real click is preceded by pointerdown — ConfirmDialog.vue's
    // suppressNextCancel guard is armed on pointerdown, matching real
    // pointer-driven interaction (ApiKeysPanel.spec.ts precedent).
    confirmButton?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    confirmButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await waitFor(() => deletePhotoMock.mock.calls.length > 0)

    expect(deletePhotoMock).toHaveBeenCalledOnce()
    expect(wrapper.emitted('saved')).toBeTruthy()

    wrapper.unmount()
  })

  it('cancelling the confirm dialog never calls deletePhoto', async () => {
    const wrapper = mountForm('https://example.test/current.jpg', true)

    await control(wrapper).vm.$emit('remove')
    await waitForTestId('confirm-dialog-cancel')

    document.body
      .querySelector<HTMLButtonElement>('[data-testid="confirm-dialog-cancel"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(deletePhotoMock).not.toHaveBeenCalled()

    wrapper.unmount()
  })
})

describe('ProfilePhotoForm — the control is told when its crop is done with', () => {
  it('clears after a successful upload', async () => {
    const wrapper = mountForm()

    await control(wrapper).vm.$emit('cropped', croppedFile())
    await flushPromises()

    expect((control(wrapper).vm as unknown as { cleared: number }).cleared).toBe(1)
  })

  it('clears after a REJECTED upload — the crop must not shadow the stored photo', async () => {
    // ImageUploadField sets its preview BEFORE it emits, so leaving it would
    // put "here is your new photo" directly above "your photo was rejected" —
    // and keep the Remove button showing, so confirming "Remove profile
    // photo?" would delete the previously stored photo the operator can no
    // longer see.
    uploadPhotoMock.mockReset().mockRejectedValueOnce(new Error('network down'))

    const wrapper = mountForm('https://example.test/current.jpg')

    await control(wrapper).vm.$emit('cropped', croppedFile())
    await flushPromises()

    expect((control(wrapper).vm as unknown as { cleared: number }).cleared).toBe(1)
  })

  it('clears after a confirmed removal', async () => {
    // The control cannot infer this from photoUrl — it was already null for a
    // user who had no photo — so the deleted image would stay on screen and
    // the removal would read as a no-op.
    const wrapper = mountForm('https://example.test/current.jpg', true)

    await control(wrapper).vm.$emit('remove')
    await waitForTestId('confirm-dialog-confirm')

    const confirm = document.body.querySelector<HTMLButtonElement>(
      '[data-testid="confirm-dialog-confirm"]'
    )
    confirm?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    confirm?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await waitFor(() => deletePhotoMock.mock.calls.length > 0)

    expect((control(wrapper).vm as unknown as { cleared: number }).cleared).toBe(1)

    wrapper.unmount()
  })
})
