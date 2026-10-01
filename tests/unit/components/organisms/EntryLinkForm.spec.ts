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
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

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

describe('EntryLinkForm — external reference (candidate-external-reference, design AD-8)', () => {
  beforeEach(() => {
    generateEntryLinkMock.mockReset().mockResolvedValue({
      entry_url: 'https://interview.example.com/interview/tok',
      expires_at: '2026-08-17T15:32:00.000000Z',
    })
    // The validation messages are produced by the script's `t` (from `useI18n`),
    // not by the template's `$t`. The suite-wide stub is the identity on the key
    // and drops the params, so the `{max}` the two limits interpolate would be
    // unobservable; this one renders them exactly like `$t` does above.
    vi.stubGlobal(
      'useI18n',
      vi.fn(() => ({ t: tMock, te: () => true, locale: ref('en') }))
    )
  })

  afterEach(() => {
    vi.stubGlobal(
      'useI18n',
      vi.fn(() => ({ t: (key: string) => key, te: () => true, locale: ref('it') }))
    )
  })

  const BASE_PAYLOAD = {
    project_id: 42,
    candidate_ref: 'cand-1',
    display_name: 'Mario Rossi',
    email: 'mario@example.test',
    send_email: true,
  }

  function mountForm() {
    return mount(EntryLinkForm, {
      props: { projectId: 42 },
      global: { mocks: { $t: tMock } },
    })
  }

  type Wrapper = ReturnType<typeof mountForm>

  async function fillRequiredFields(wrapper: Wrapper) {
    await wrapper.get('[data-testid="entry-link-form-candidate-ref"]').setValue('cand-1')
    await wrapper.get('[data-testid="entry-link-form-email"]').setValue('mario@example.test')
    await wrapper.get('[data-testid="entry-link-form-display-name"]').setValue('Mario Rossi')
  }

  async function submit(wrapper: Wrapper) {
    await wrapper.get('[data-testid="entry-link-form"]').trigger('submit')
    await flushPromises()
  }

  const externalIdInput = (wrapper: Wrapper) =>
    wrapper.get('[data-testid="entry-link-form-external-id"]')
  const sourceInput = (wrapper: Wrapper) => wrapper.get('[data-testid="entry-link-form-source"]')

  /** The single payload `generateEntryLink` received. */
  function sentPayload(): Record<string, unknown> {
    expect(generateEntryLinkMock).toHaveBeenCalledTimes(1)

    return generateEntryLinkMock.mock.calls[0]?.[0] as Record<string, unknown>
  }

  describe('the fieldset', () => {
    it('renders an optional External reference fieldset with both inputs and ONE help line', () => {
      const wrapper = mountForm()
      const fieldset = wrapper.get('[data-testid="entry-link-form-external-reference"]')

      expect(fieldset.element.tagName).toBe('FIELDSET')
      expect(fieldset.get('legend').text()).toBe('externalReference.label')
      expect(fieldset.find('[data-testid="entry-link-form-external-id"]').exists()).toBe(true)
      expect(fieldset.find('[data-testid="entry-link-form-source"]').exists()).toBe(true)
      expect(fieldset.findAll('[data-slot="field-description"]')).toHaveLength(1)
      expect(fieldset.get('#entry-link-form-external-reference-help').text()).toBe(
        'externalReference.help'
      )
    })

    it('labels each input through its own <label for>', () => {
      const wrapper = mountForm()

      expect(wrapper.get('label[for="entry-link-form-external-id"]').text()).toBe(
        'externalReference.externalId'
      )
      expect(wrapper.get('label[for="entry-link-form-source"]').text()).toBe(
        'externalReference.source'
      )
    })

    it('makes External ID a text input with a numeric keypad hint, not type=number', () => {
      const wrapper = mountForm()
      const input = externalIdInput(wrapper)

      // `type="number"` wheel-scrolls, accepts `e` notation and hands back a
      // float: an identifier above 2^53 silently loses digits before validation.
      expect(input.attributes('type')).toBe('text')
      expect(input.attributes('inputmode')).toBe('numeric')
      expect(input.attributes('autocomplete')).toBe('off')
    })

    it('nests the help line in the fieldset it describes, never as a loose sibling in the FieldGroup', () => {
      const wrapper = mountForm()
      const help = wrapper.get('#entry-link-form-external-reference-help')

      expect(help.element.parentElement?.tagName).toBe('FIELDSET')
      expect(help.element.closest('[data-slot="field-group"]')).not.toBe(help.element.parentElement)
    })

    it('points both inputs at the help line while they are valid', () => {
      const wrapper = mountForm()

      for (const input of [externalIdInput(wrapper), sourceInput(wrapper)]) {
        expect((input.attributes('aria-describedby') ?? '').split(/\s+/)).toEqual([
          'entry-link-form-external-reference-help',
        ])
        expect(input.attributes('aria-invalid')).toBe('false')
      }
    })

    it('keeps the component contract: one prop, the same two emits', () => {
      const component = EntryLinkForm as unknown as { props?: unknown; emits?: unknown }

      expect(Object.keys(component.props as object)).toEqual(['projectId'])
      expect([...(component.emits as string[])].sort()).toEqual(['success', 'update:pending'])
    })
  })

  describe('payload', () => {
    it('is byte-for-byte the pre-existing payload when both inputs are empty', async () => {
      const wrapper = mountForm()
      await fillRequiredFields(wrapper)
      await submit(wrapper)

      expect(sentPayload()).toStrictEqual(BASE_PAYLOAD)
      expect(Object.keys(sentPayload())).not.toContain('external_id')
      expect(Object.keys(sentPayload())).not.toContain('source')
    })

    it('treats whitespace-only inputs as empty: no key, not a blank string', async () => {
      const wrapper = mountForm()
      await fillRequiredFields(wrapper)
      await externalIdInput(wrapper).setValue('   ')
      await sourceInput(wrapper).setValue('   ')
      await submit(wrapper)

      expect(sentPayload()).toStrictEqual(BASE_PAYLOAD)
    })

    it('sends external_id as a NUMBER and source trimmed when both are filled', async () => {
      const wrapper = mountForm()
      await fillRequiredFields(wrapper)
      await externalIdInput(wrapper).setValue(' 4471 ')
      await sourceInput(wrapper).setValue('  Acme ATS  ')
      await submit(wrapper)

      const payload = sentPayload()
      expect(payload).toStrictEqual({ ...BASE_PAYLOAD, external_id: 4471, source: 'Acme ATS' })
      expect(typeof payload['external_id']).toBe('number')
    })

    it('omits source when only External ID is entered', async () => {
      const wrapper = mountForm()
      await fillRequiredFields(wrapper)
      await externalIdInput(wrapper).setValue('4471')
      await submit(wrapper)

      expect(sentPayload()).toStrictEqual({ ...BASE_PAYLOAD, external_id: 4471 })
    })

    it('omits external_id when only Source is entered', async () => {
      const wrapper = mountForm()
      await fillRequiredFields(wrapper)
      await sourceInput(wrapper).setValue('Acme ATS')
      await submit(wrapper)

      expect(sentPayload()).toStrictEqual({ ...BASE_PAYLOAD, source: 'Acme ATS' })
    })

    it('sends both values on the scheduled path too, next to scheduled_at', async () => {
      const wrapper = mountForm()
      await fillRequiredFields(wrapper)
      await externalIdInput(wrapper).setValue('4471')
      await sourceInput(wrapper).setValue('Acme ATS')
      await wrapper.get('[data-testid="entry-link-form-timing-schedule"]').trigger('click')

      const future = new Date(Date.now() + 60 * 60_000)
      const localValue = new Date(future.getTime() - future.getTimezoneOffset() * 60_000)
        .toISOString()
        .slice(0, 16)
      await wrapper.get('[data-testid="entry-link-form-scheduled-at"]').setValue(localValue)
      await submit(wrapper)

      expect(sentPayload()).toEqual({
        project_id: 42,
        candidate_ref: 'cand-1',
        display_name: 'Mario Rossi',
        email: 'mario@example.test',
        scheduled_at: expect.any(String),
        external_id: 4471,
        source: 'Acme ATS',
      })
    })
  })

  describe('client validation (a hint: the server is the authority)', () => {
    const INVALID_EXTERNAL_IDS = ['0', '-3', '1.5', 'abc', '9007199254740992', '1e3', '12 34']

    it.each(INVALID_EXTERNAL_IDS)(
      'blocks submit for External ID "%s" with a wired FieldError',
      async (value) => {
        const wrapper = mountForm()
        await fillRequiredFields(wrapper)
        await externalIdInput(wrapper).setValue(value)
        await submit(wrapper)

        const input = externalIdInput(wrapper)
        const error = wrapper.get('[data-testid="entry-link-form-external-id-error"]')

        expect(error.text()).toBe('externalReference.externalIdInvalid:{"max":9007199254740991}')
        expect(input.attributes('aria-invalid')).toBe('true')
        expect((input.attributes('aria-describedby') ?? '').split(/\s+/)).toContain(
          error.attributes('id')
        )
        expect(generateEntryLinkMock).not.toHaveBeenCalled()
      }
    )

    it.each(['1', '4471', '9007199254740991'])('accepts External ID "%s"', async (value) => {
      const wrapper = mountForm()
      await fillRequiredFields(wrapper)
      await externalIdInput(wrapper).setValue(value)
      await submit(wrapper)

      expect(wrapper.find('[data-testid="entry-link-form-external-id-error"]').exists()).toBe(false)
      expect(sentPayload()['external_id']).toBe(Number(value))
    })

    it('blocks a 181-character Source with a wired FieldError, and sends nothing', async () => {
      const wrapper = mountForm()
      await fillRequiredFields(wrapper)
      await sourceInput(wrapper).setValue('a'.repeat(181))
      await submit(wrapper)

      const error = wrapper.get('[data-testid="entry-link-form-source-error"]')
      expect(error.text()).toBe('entryLink.form.tooLong:{"max":180}')
      expect(sourceInput(wrapper).attributes('aria-invalid')).toBe('true')
      expect((sourceInput(wrapper).attributes('aria-describedby') ?? '').split(/\s+/)).toContain(
        error.attributes('id')
      )
      expect(generateEntryLinkMock).not.toHaveBeenCalled()
    })

    it.each([
      ['180 ASCII characters', 'a'.repeat(180)],
      ['180 multibyte characters', 'è'.repeat(180)],
      [
        '180 characters padded with spaces (length is measured after trimming)',
        `  ${'a'.repeat(180)}  `,
      ],
    ])('accepts a Source of %s', async (_label, value) => {
      const wrapper = mountForm()
      await fillRequiredFields(wrapper)
      await sourceInput(wrapper).setValue(value)
      await submit(wrapper)

      expect(wrapper.find('[data-testid="entry-link-form-source-error"]').exists()).toBe(false)
      expect(sentPayload()['source']).toBe(value.trim())
    })

    it('flags every invalid field at once on submit, never one at a time', async () => {
      const wrapper = mountForm()
      await externalIdInput(wrapper).setValue('abc')
      await sourceInput(wrapper).setValue('a'.repeat(181))
      await submit(wrapper)

      expect(wrapper.find('[data-testid="entry-link-form-candidate-ref-error"]').exists()).toBe(
        true
      )
      expect(wrapper.find('[data-testid="entry-link-form-external-id-error"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="entry-link-form-source-error"]').exists()).toBe(true)
    })

    it('shows the External ID error after blur, before any submit, and clears it once valid', async () => {
      const wrapper = mountForm()

      await externalIdInput(wrapper).setValue('abc')
      await externalIdInput(wrapper).trigger('blur')
      expect(wrapper.find('[data-testid="entry-link-form-external-id-error"]').exists()).toBe(true)

      await externalIdInput(wrapper).setValue('4471')
      await externalIdInput(wrapper).trigger('blur')
      expect(wrapper.find('[data-testid="entry-link-form-external-id-error"]').exists()).toBe(false)
      expect(externalIdInput(wrapper).attributes('aria-invalid')).toBe('false')
    })

    it('shows the Source error after blur, before any submit', async () => {
      const wrapper = mountForm()

      await sourceInput(wrapper).setValue('a'.repeat(181))
      await sourceInput(wrapper).trigger('blur')

      expect(wrapper.find('[data-testid="entry-link-form-source-error"]').exists()).toBe(true)
    })

    it('does not flag an empty, untouched fieldset on blur: the fields are optional', async () => {
      const wrapper = mountForm()

      await externalIdInput(wrapper).trigger('blur')
      await sourceInput(wrapper).trigger('blur')

      expect(wrapper.find('[data-testid="entry-link-form-external-id-error"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="entry-link-form-source-error"]').exists()).toBe(false)
    })
  })

  describe('server 422 mapping', () => {
    function reject422(errors: Record<string, string[]>) {
      generateEntryLinkMock.mockRejectedValueOnce(
        Object.assign(new Error('422'), { status: 422, data: { errors } })
      )
    }

    it('maps an external_id error onto the External ID field, not the banner', async () => {
      reject422({ external_id: ['The external id must be an integer.'] })
      const wrapper = mountForm()
      await fillRequiredFields(wrapper)
      await externalIdInput(wrapper).setValue('4471')
      await submit(wrapper)

      const error = wrapper.get('[data-testid="entry-link-form-external-id-error"]')
      expect(error.text()).toBe('The external id must be an integer.')
      expect(externalIdInput(wrapper).attributes('aria-invalid')).toBe('true')
      expect(
        (externalIdInput(wrapper).attributes('aria-describedby') ?? '').split(/\s+/)
      ).toContain(error.attributes('id'))
      // A mapped field error is its own explanation: no generic banner on top.
      expect(wrapper.find('[data-testid="entry-link-form-banner"]').exists()).toBe(false)
    })

    it('maps a source error onto the Source field, not the banner', async () => {
      reject422({ source: ['The source may not be greater than 180 characters.'] })
      const wrapper = mountForm()
      await fillRequiredFields(wrapper)
      await sourceInput(wrapper).setValue('Acme ATS')
      await submit(wrapper)

      const error = wrapper.get('[data-testid="entry-link-form-source-error"]')
      expect(error.text()).toBe('The source may not be greater than 180 characters.')
      expect(sourceInput(wrapper).attributes('aria-invalid')).toBe('true')
      expect(wrapper.find('[data-testid="entry-link-form-banner"]').exists()).toBe(false)
    })
  })
})
