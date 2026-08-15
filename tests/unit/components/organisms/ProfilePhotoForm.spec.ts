/**
 * ProfilePhotoForm.vue (user-avatar-image, design D6, task 6.3 — RED)
 *
 * States: idle (avatar + Change/Remove), uploading (submit and remove
 * disabled, aria-busy), success (emit('saved')), error (mapped 422 under
 * the control, banner otherwise). Remove goes through ConfirmDialog —
 * nothing is deleted on the first click.
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

function selectFile(input: ReturnType<typeof mount>['element'], file: File) {
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
}

describe('ProfilePhotoForm', () => {
  beforeEach(() => {
    uploadPhotoMock
      .mockReset()
      .mockResolvedValue({ data: { photo_url: 'https://example.test/new.jpg' } })
    deletePhotoMock.mockReset().mockResolvedValue({ data: { photo_url: null } })
  })

  function mountForm(photoUrl: string | null = null) {
    return mount(ProfilePhotoForm, {
      props: { photoUrl, name: 'Ada Lovelace' },
      global: { mocks: { $t: tMock } },
    })
  }

  it('renders a hidden-but-focusable file input, never display:none', () => {
    const wrapper = mountForm()
    const input = wrapper.get('[data-testid="profile-photo-input"]')

    expect(input.attributes('type')).toBe('file')
    expect(input.attributes('accept')).toBe('image/jpeg,image/png')
    expect(input.classes()).not.toContain('hidden')
    const style = (input.element as HTMLInputElement).style
    expect(style.display).not.toBe('none')
  })

  it('shows Remove only when a photo already exists', () => {
    expect(mountForm(null).find('[data-testid="profile-photo-remove"]').exists()).toBe(false)
    expect(
      mountForm('https://example.test/current.jpg')
        .find('[data-testid="profile-photo-remove"]')
        .exists()
    ).toBe(true)
  })

  it('selecting a valid file uploads it via useProfile', async () => {
    const wrapper = mountForm()
    const input = wrapper.get('[data-testid="profile-photo-input"]')
    const file = new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' })
    selectFile(input.element, file)

    await input.trigger('change')
    await flushPromises()

    expect(uploadPhotoMock).toHaveBeenCalledWith(file)
    expect(wrapper.emitted('saved')).toBeTruthy()
  })

  it('sets aria-busy and disables Change/Remove while uploading', async () => {
    let resolveUpload: (value: unknown) => void = () => {}
    uploadPhotoMock.mockReset().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpload = resolve
        })
    )

    const wrapper = mountForm('https://example.test/current.jpg')
    const input = wrapper.get('[data-testid="profile-photo-input"]')
    const file = new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' })
    selectFile(input.element, file)
    await input.trigger('change')

    expect(wrapper.get('[data-testid="profile-photo-form"]').attributes('aria-busy')).toBe('true')
    expect(wrapper.get('[data-testid="profile-photo-change"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="profile-photo-remove"]').attributes('disabled')).toBeDefined()

    resolveUpload({ data: { photo_url: 'https://example.test/new.jpg' } })
    await flushPromises()

    expect(wrapper.get('[data-testid="profile-photo-form"]').attributes('aria-busy')).toBe('false')
  })

  it('a client-side oversized file fails instantly, with no round trip', async () => {
    const wrapper = mountForm()
    const input = wrapper.get('[data-testid="profile-photo-input"]')
    const tooLarge = new File([new Uint8Array(2_097_153)], 'huge.jpg', { type: 'image/jpeg' })
    selectFile(input.element, tooLarge)

    await input.trigger('change')
    await flushPromises()

    expect(uploadPhotoMock).not.toHaveBeenCalled()
    expect(wrapper.get('[data-testid="profile-photo-error"]').exists()).toBe(true)
  })

  it('a 422 on the photo field maps under the control via applyServerFieldErrors', async () => {
    uploadPhotoMock.mockReset().mockRejectedValueOnce(
      Object.assign(new Error('422'), {
        status: 422,
        data: { errors: { photo: ['The photo must be a valid JPEG or PNG image.'] } },
      })
    )

    const wrapper = mountForm()
    const input = wrapper.get('[data-testid="profile-photo-input"]')
    const file = new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' })
    selectFile(input.element, file)
    await input.trigger('change')
    await flushPromises()

    const error = wrapper.get('[data-testid="profile-photo-error"]')
    expect(error.text()).toContain('The photo must be a valid JPEG or PNG image.')
  })

  it('an unmapped upload failure surfaces in the banner', async () => {
    uploadPhotoMock.mockReset().mockRejectedValueOnce(new Error('network error'))

    const wrapper = mountForm()
    const input = wrapper.get('[data-testid="profile-photo-input"]')
    const file = new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' })
    selectFile(input.element, file)
    await input.trigger('change')
    await flushPromises()

    expect(wrapper.get('[data-testid="profile-photo-banner"]').attributes('role')).toBe('alert')
  })

  // ConfirmDialog (AlertDialog) content is teleported to document.body, not
  // a descendant of `wrapper` — same discipline as ApiKeysPanel.spec.ts's
  // revoke-confirmation test.
  it('Remove opens ConfirmDialog — nothing is deleted on the first click', async () => {
    const wrapper = mount(ProfilePhotoForm, {
      props: { photoUrl: 'https://example.test/current.jpg', name: 'Ada Lovelace' },
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })

    await wrapper.get('[data-testid="profile-photo-remove"]').trigger('click')
    await waitForTestId('confirm-dialog-confirm')

    expect(deletePhotoMock).not.toHaveBeenCalled()
    expect(document.body.querySelector('[data-testid="confirm-dialog-confirm"]')).not.toBeNull()

    wrapper.unmount()
  })

  it('confirming Remove calls deletePhoto and emits saved', async () => {
    const wrapper = mount(ProfilePhotoForm, {
      props: { photoUrl: 'https://example.test/current.jpg', name: 'Ada Lovelace' },
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })

    await wrapper.get('[data-testid="profile-photo-remove"]').trigger('click')
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
    const wrapper = mount(ProfilePhotoForm, {
      props: { photoUrl: 'https://example.test/current.jpg', name: 'Ada Lovelace' },
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })

    await wrapper.get('[data-testid="profile-photo-remove"]').trigger('click')
    await waitForTestId('confirm-dialog-cancel')

    const cancelButton = document.body.querySelector<HTMLButtonElement>(
      '[data-testid="confirm-dialog-cancel"]'
    )
    cancelButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(deletePhotoMock).not.toHaveBeenCalled()

    wrapper.unmount()
  })
})
