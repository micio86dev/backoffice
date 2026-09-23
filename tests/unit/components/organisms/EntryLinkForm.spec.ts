/**
 * EntryLinkForm.vue (operator-interview-link, design D4)
 *
 * `candidate_ref` + `display_name` only — `project_id` is known from context
 * (the row the operator opened the dialog from), never a third field to
 * pick. Form contract: `<form novalidate>`, `Field`/`FieldLabel`/`FieldError`,
 * per-field `aria-invalid`/`aria-describedby`, JS validation before submit
 * (required + `max:255`), `applyServerFieldErrors` with unmapped messages
 * surfacing in the form-level `role="alert"` banner.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const tMock = (key: string, params?: Record<string, unknown>) =>
  params ? `${key}:${JSON.stringify(params)}` : key
const generateEntryLinkMock = vi.fn()

vi.mock('../../../../app/composables/useEntryLinks', () => ({
  useEntryLinks: () => ({ generateEntryLink: generateEntryLinkMock }),
}))

const EntryLinkForm = (await import('../../../../app/components/organisms/EntryLinkForm.vue'))
  .default

describe('EntryLinkForm', () => {
  beforeEach(() => {
    generateEntryLinkMock.mockReset().mockResolvedValue({
      entry_url: 'https://interview.example.com/interview/tok',
      expires_at: '2026-08-17T15:32:00.000000Z',
    })
  })

  function mountForm() {
    return mount(EntryLinkForm, {
      props: { projectId: 42 },
      global: { mocks: { $t: tMock } },
    })
  }

  it('sets novalidate on the form element', () => {
    const wrapper = mountForm()
    expect(wrapper.get('[data-testid="entry-link-form"]').attributes('novalidate')).toBeDefined()
  })

  it('rejects an empty candidate_ref on submit, with aria-invalid/aria-describedby wired', async () => {
    const wrapper = mountForm()

    await wrapper.get('[data-testid="entry-link-form"]').trigger('submit')
    await flushPromises()

    const input = wrapper.get('[data-testid="entry-link-form-candidate-ref"]')
    const error = wrapper.get('[data-testid="entry-link-form-candidate-ref-error"]')
    expect(input.attributes('aria-invalid')).toBe('true')
    expect((input.attributes('aria-describedby') ?? '').split(/\s+/)).toContain(
      error.attributes('id')
    )
    expect(generateEntryLinkMock).not.toHaveBeenCalled()
  })

  it('rejects an empty display_name on submit, with aria-invalid/aria-describedby wired', async () => {
    const wrapper = mountForm()

    await wrapper.get('[data-testid="entry-link-form-candidate-ref"]').setValue('cand-1')
    await wrapper.get('[data-testid="entry-link-form"]').trigger('submit')
    await flushPromises()

    const input = wrapper.get('[data-testid="entry-link-form-display-name"]')
    const error = wrapper.get('[data-testid="entry-link-form-display-name-error"]')
    expect(input.attributes('aria-invalid')).toBe('true')
    expect((input.attributes('aria-describedby') ?? '').split(/\s+/)).toContain(
      error.attributes('id')
    )
  })

  it('rejects a candidate_ref longer than 255 characters', async () => {
    const wrapper = mountForm()

    await wrapper.get('[data-testid="entry-link-form-candidate-ref"]').setValue('x'.repeat(256))
    await wrapper.get('[data-testid="entry-link-form-email"]').setValue('mario@example.test')
    await wrapper.get('[data-testid="entry-link-form-display-name"]').setValue('Someone')
    await wrapper.get('[data-testid="entry-link-form"]').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[data-testid="entry-link-form-candidate-ref-error"]').exists()).toBe(true)
    expect(generateEntryLinkMock).not.toHaveBeenCalled()
  })

  it('submits project_id + candidate_ref + email + display_name and emits success', async () => {
    const wrapper = mountForm()

    await wrapper.get('[data-testid="entry-link-form-candidate-ref"]').setValue('cand-1')
    await wrapper.get('[data-testid="entry-link-form-email"]').setValue('mario@example.test')
    await wrapper.get('[data-testid="entry-link-form-display-name"]').setValue('Mario Rossi')
    await wrapper.get('[data-testid="entry-link-form"]').trigger('submit')
    await flushPromises()

    expect(generateEntryLinkMock).toHaveBeenCalledWith({
      project_id: 42,
      candidate_ref: 'cand-1',
      display_name: 'Mario Rossi',
      email: 'mario@example.test',
      // Checked by default: the operator opened "invite a candidate", and
      // producing a link while quietly not sending it is the behaviour this
      // whole feature exists to end.
      send_email: true,
    })
    expect(wrapper.emitted('success')).toBeTruthy()
    expect(wrapper.emitted('success')?.[0]?.[0]).toEqual({
      entry_url: 'https://interview.example.com/interview/tok',
      expires_at: '2026-08-17T15:32:00.000000Z',
    })
  })

  it('surfaces a mapped 422 (candidate_ref) next to its own control', async () => {
    generateEntryLinkMock.mockRejectedValueOnce(
      Object.assign(new Error('422'), {
        status: 422,
        data: { errors: { candidate_ref: ['That candidate reference is already in use.'] } },
      })
    )

    const wrapper = mountForm()
    await wrapper.get('[data-testid="entry-link-form-candidate-ref"]').setValue('cand-1')
    await wrapper.get('[data-testid="entry-link-form-email"]').setValue('mario@example.test')
    await wrapper.get('[data-testid="entry-link-form-display-name"]').setValue('Mario Rossi')
    await wrapper.get('[data-testid="entry-link-form"]').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-testid="entry-link-form-candidate-ref-error"]').text()).toContain(
      'That candidate reference is already in use.'
    )
  })

  it('surfaces an unmapped 422 (e.g. role_code) in the form-level role="alert" banner', async () => {
    generateEntryLinkMock.mockRejectedValueOnce(
      Object.assign(new Error('422'), {
        status: 422,
        data: { errors: { role_code: ['role_code does not match the project role.'] } },
      })
    )

    const wrapper = mountForm()
    await wrapper.get('[data-testid="entry-link-form-candidate-ref"]').setValue('cand-1')
    await wrapper.get('[data-testid="entry-link-form-email"]').setValue('mario@example.test')
    await wrapper.get('[data-testid="entry-link-form-display-name"]').setValue('Mario Rossi')
    await wrapper.get('[data-testid="entry-link-form"]').trigger('submit')
    await flushPromises()

    const banner = wrapper.get('[data-testid="entry-link-form-banner"]')
    expect(banner.attributes('role')).toBe('alert')
    expect(banner.text()).toContain('role_code does not match the project role.')
  })
})

describe('EntryLinkForm — scheduled interview (interview-scheduling, design AD-2/AD-3, PR-F)', () => {
  beforeEach(() => {
    generateEntryLinkMock.mockReset().mockResolvedValue({
      entry_url: 'https://interview.example.com/interview/tok',
      expires_at: '2026-08-17T15:32:00.000000Z',
    })
  })

  function mountForm() {
    return mount(EntryLinkForm, {
      props: { projectId: 42 },
      global: { mocks: { $t: tMock } },
    })
  }

  async function fillRequiredFields(wrapper: ReturnType<typeof mountForm>) {
    await wrapper.get('[data-testid="entry-link-form-candidate-ref"]').setValue('cand-1')
    await wrapper.get('[data-testid="entry-link-form-email"]').setValue('mario@example.test')
    await wrapper.get('[data-testid="entry-link-form-display-name"]').setValue('Mario Rossi')
  }

  it('defaults to "send now": no timing toggle selection hides the scheduled-at field and shows send-email', () => {
    const wrapper = mountForm()

    expect(wrapper.find('[data-testid="entry-link-form-scheduled-at"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="entry-link-form-send-email"]').exists()).toBe(true)
  })

  it('selecting "schedule" reveals the scheduled-at field and hides send-email', async () => {
    const wrapper = mountForm()

    await wrapper.get('[data-testid="entry-link-form-timing-schedule"]').trigger('click')

    expect(wrapper.find('[data-testid="entry-link-form-scheduled-at"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="entry-link-form-send-email"]').exists()).toBe(false)
  })

  it('switching back to "now" hides the scheduled-at field again and restores send-email', async () => {
    const wrapper = mountForm()

    await wrapper.get('[data-testid="entry-link-form-timing-schedule"]').trigger('click')
    await wrapper.get('[data-testid="entry-link-form-timing-now"]').trigger('click')

    expect(wrapper.find('[data-testid="entry-link-form-scheduled-at"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="entry-link-form-send-email"]').exists()).toBe(true)
  })

  it('"send now" submits WITHOUT scheduled_at — byte-for-byte the pre-existing payload (regression)', async () => {
    const wrapper = mountForm()
    await fillRequiredFields(wrapper)
    await wrapper.get('[data-testid="entry-link-form"]').trigger('submit')
    await flushPromises()

    expect(generateEntryLinkMock).toHaveBeenCalledWith({
      project_id: 42,
      candidate_ref: 'cand-1',
      display_name: 'Mario Rossi',
      email: 'mario@example.test',
      send_email: true,
    })
  })

  it('rejects an empty scheduled_at when "schedule" is selected, without calling the API', async () => {
    const wrapper = mountForm()
    await fillRequiredFields(wrapper)
    await wrapper.get('[data-testid="entry-link-form-timing-schedule"]').trigger('click')
    await wrapper.get('[data-testid="entry-link-form"]').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[data-testid="entry-link-form-scheduled-at-error"]').exists()).toBe(true)
    expect(generateEntryLinkMock).not.toHaveBeenCalled()
  })

  it('rejects a scheduled_at less than 16 minutes from now, without calling the API', async () => {
    const wrapper = mountForm()
    await fillRequiredFields(wrapper)
    await wrapper.get('[data-testid="entry-link-form-timing-schedule"]').trigger('click')

    const tooSoon = new Date(Date.now() + 5 * 60_000)
    const localValue = new Date(tooSoon.getTime() - tooSoon.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16)
    await wrapper.get('[data-testid="entry-link-form-scheduled-at"]').setValue(localValue)
    await wrapper.get('[data-testid="entry-link-form"]').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[data-testid="entry-link-form-scheduled-at-error"]').exists()).toBe(true)
    expect(generateEntryLinkMock).not.toHaveBeenCalled()
  })

  it('rejects a past scheduled_at, without calling the API', async () => {
    const wrapper = mountForm()
    await fillRequiredFields(wrapper)
    await wrapper.get('[data-testid="entry-link-form-timing-schedule"]').trigger('click')
    await wrapper.get('[data-testid="entry-link-form-scheduled-at"]').setValue('2020-01-01T10:00')
    await wrapper.get('[data-testid="entry-link-form"]').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[data-testid="entry-link-form-scheduled-at-error"]').exists()).toBe(true)
    expect(generateEntryLinkMock).not.toHaveBeenCalled()
  })

  it('submits scheduled_at as an ISO-8601 string with an explicit UTC offset, and omits send_email', async () => {
    const wrapper = mountForm()
    await fillRequiredFields(wrapper)
    await wrapper.get('[data-testid="entry-link-form-timing-schedule"]').trigger('click')

    const future = new Date(Date.now() + 60 * 60_000)
    const localValue = new Date(future.getTime() - future.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16)
    await wrapper.get('[data-testid="entry-link-form-scheduled-at"]').setValue(localValue)
    await wrapper.get('[data-testid="entry-link-form"]').trigger('submit')
    await flushPromises()

    expect(generateEntryLinkMock).toHaveBeenCalledTimes(1)
    const payload = generateEntryLinkMock.mock.calls[0]?.[0]
    expect(payload).toEqual({
      project_id: 42,
      candidate_ref: 'cand-1',
      display_name: 'Mario Rossi',
      email: 'mario@example.test',
      scheduled_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/),
    })
    expect(payload.scheduled_at).toBe(future.toISOString().slice(0, 16) + ':00.000Z')
  })

  it('surfaces a mapped 422 (scheduled_at) next to its own control, not the banner', async () => {
    generateEntryLinkMock.mockRejectedValueOnce(
      Object.assign(new Error('422'), {
        status: 422,
        data: {
          errors: { scheduled_at: ['The scheduled_at must be at least 16 minutes from now.'] },
        },
      })
    )

    const wrapper = mountForm()
    await fillRequiredFields(wrapper)
    await wrapper.get('[data-testid="entry-link-form-timing-schedule"]').trigger('click')

    const future = new Date(Date.now() + 60 * 60_000)
    const localValue = new Date(future.getTime() - future.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16)
    await wrapper.get('[data-testid="entry-link-form-scheduled-at"]').setValue(localValue)
    await wrapper.get('[data-testid="entry-link-form"]').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-testid="entry-link-form-scheduled-at-error"]').text()).toContain(
      'The scheduled_at must be at least 16 minutes from now.'
    )
    expect(wrapper.find('[data-testid="entry-link-form-banner"]').exists()).toBe(false)
  })

  it('emits success with the scheduled ParticipantResource shape (no entry_url)', async () => {
    generateEntryLinkMock.mockResolvedValueOnce({
      id: 7,
      candidate_ref: 'cand-1',
      display_name: 'Mario Rossi',
      scheduled_at: '2026-10-01T12:00:00.000000Z',
      scheduling_status: 'pending',
    })

    const wrapper = mountForm()
    await fillRequiredFields(wrapper)
    await wrapper.get('[data-testid="entry-link-form-timing-schedule"]').trigger('click')

    const future = new Date(Date.now() + 60 * 60_000)
    const localValue = new Date(future.getTime() - future.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16)
    await wrapper.get('[data-testid="entry-link-form-scheduled-at"]').setValue(localValue)
    await wrapper.get('[data-testid="entry-link-form"]').trigger('submit')
    await flushPromises()

    expect(wrapper.emitted('success')?.[0]?.[0]).toEqual({
      id: 7,
      candidate_ref: 'cand-1',
      display_name: 'Mario Rossi',
      scheduled_at: '2026-10-01T12:00:00.000000Z',
      scheduling_status: 'pending',
    })
  })
})

describe('EntryLinkForm — the email is required, because it is the identity', () => {
  beforeEach(() => {
    generateEntryLinkMock.mockReset().mockResolvedValue({
      entry_url: 'https://interview.example.com/interview/tok',
      expires_at: '2026-08-17T15:32:00.000000Z',
    })
  })

  function mountForm() {
    return mount(EntryLinkForm, {
      props: { projectId: 42 },
      global: { mocks: { $t: tMock } },
    })
  }

  it('refuses a submit with no email, on the control rather than in the banner', async () => {
    // Required at the server too. Checked here so the operator is told WHICH
    // field is missing instead of receiving the form-level "could not save"
    // an unmapped 422 produces.
    const wrapper = mountForm()

    await wrapper.get('[data-testid="entry-link-form-candidate-ref"]').setValue('cand-1')
    await wrapper.get('[data-testid="entry-link-form-display-name"]').setValue('Mario Rossi')
    await wrapper.get('[data-testid="entry-link-form"]').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[data-testid="entry-link-form-email-error"]').exists()).toBe(true)
    expect(generateEntryLinkMock).not.toHaveBeenCalled()
  })

  it('catches the obvious typo and nothing cleverer', async () => {
    // Presence and a single `@`. A thorough client-side regex rejects
    // addresses that are perfectly valid — plus addressing, new TLDs, quoted
    // locals — and the person it turns away is a candidate who then never gets
    // invited at all. The server is the authority.
    const wrapper = mountForm()

    await wrapper.get('[data-testid="entry-link-form-candidate-ref"]').setValue('cand-1')
    await wrapper.get('[data-testid="entry-link-form-display-name"]').setValue('Mario Rossi')
    await wrapper.get('[data-testid="entry-link-form-email"]').setValue('not-an-address')
    await wrapper.get('[data-testid="entry-link-form"]').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[data-testid="entry-link-form-email-error"]').exists()).toBe(true)
    expect(generateEntryLinkMock).not.toHaveBeenCalled()
  })

  it('accepts an address a stricter regex would have rejected', async () => {
    const wrapper = mountForm()

    await wrapper.get('[data-testid="entry-link-form-candidate-ref"]').setValue('cand-1')
    await wrapper.get('[data-testid="entry-link-form-display-name"]').setValue('Mario Rossi')
    await wrapper
      .get('[data-testid="entry-link-form-email"]')
      .setValue('mario+recruiting@sub.example.engineering')
    await wrapper.get('[data-testid="entry-link-form"]').trigger('submit')
    await flushPromises()

    expect(generateEntryLinkMock).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'mario+recruiting@sub.example.engineering' })
    )
  })
})
