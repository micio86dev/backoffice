import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AvatarTemplateForm from '../../app/components/organisms/AvatarTemplateForm.vue'
import type { FieldSpec, ProviderName } from '../../app/types/avatar-template'

/**
 * The template form (C14 PR6).
 *
 * Built FROM the server's field specs rather than hand-written input by input,
 * so the form, the API's validation and the provider payload all come from one
 * definition. Three hand-maintained lists drift invisibly: a form offering a
 * control the payload never sends looks exactly like a control that does not
 * work.
 *
 * Most of what is asserted here is about ABSENCE — clearing a field must remove
 * the key, not blank it — because "unset" and "empty string" mean different
 * things to the provider and only one of them is what the operator meant.
 */

const SPECS: Record<ProviderName, FieldSpec[]> = {
  heygen: [
    {
      key: 'avatarId',
      type: 'text',
      label_key: 'avatar_templates.field.avatarId',
      hint_key: 'avatar_templates.hint.avatarId',
      required: true,
    },
    {
      key: 'voiceSpeed',
      type: 'number',
      label_key: 'avatar_templates.field.voiceSpeed',
      min: 0.8,
      max: 1.2,
      step: 0.01,
    },
    // A number field with NO step, mirroring the three the server actually
    // ships that way (maxSessionDurationSec, maxCallDurationSec,
    // participantAbsentTimeoutSec — whole seconds, ProviderFieldSpecs.php:92,
    // :120, :121). Without one in this fixture the step-omission case is
    // untestable, and a bug that emits step="1" everywhere looks identical to
    // correct behaviour.
    {
      key: 'maxSessionDurationSec',
      type: 'number',
      label_key: 'avatar_templates.field.maxSessionDurationSec',
      min: 30,
      max: 1200,
    },
    {
      key: 'videoQuality',
      type: 'select',
      label_key: 'avatar_templates.field.videoQuality',
      hint_key: 'avatar_templates.hint.videoQuality',
      options: ['high', 'low'],
    },
    {
      key: 'voiceUseSpeakerBoost',
      type: 'checkbox',
      label_key: 'avatar_templates.field.voiceUseSpeakerBoost',
    },
    // Non-required text field, appended deliberately: `avatarId` (the only
    // other text field in this fixture) became REQUIRED-validated by D3, so
    // it can no longer double as the "clearing drops the key, never blanks
    // it" demonstration field without also tripping the new required check.
    { key: 'voiceId', type: 'text', label_key: 'avatar_templates.field.voiceId' },
  ],
  tavus: [
    { key: 'faceId', type: 'text', label_key: 'avatar_templates.field.faceId', required: true },
  ],
}

function mountForm(template: Record<string, unknown> = {}) {
  return mount(AvatarTemplateForm, {
    props: {
      // A valid default name so tests that submit without caring about name
      // validation aren't incidentally blocked by it (D3 adds novalidate +
      // JS validation, including a required name).
      template: { name: 'Test template', ...template },
      fieldSpecs: SPECS,
      saving: false,
      submitError: null,
    },
    global: { mocks: { $t: (key: string) => key } },
  })
}

describe('the form is built from the spec', () => {
  it('renders one control per field of the chosen provider', () => {
    const wrapper = mountForm({ provider: 'heygen', config: {} })

    for (const field of SPECS.heygen) {
      expect(wrapper.find(`[data-testid="template-config-${field.key}"]`).exists()).toBe(true)
    }
  })

  it("renders the OTHER provider's fields for that provider", () => {
    const wrapper = mountForm({ provider: 'tavus', config: {} })

    // Showing a provider's knobs against the wrong provider is how an operator
    // fills in a form whose every value the API will reject as unknown.
    expect(wrapper.find('[data-testid="template-config-faceId"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="template-config-avatarId"]').exists()).toBe(false)
  })

  it('marks required fields', () => {
    const wrapper = mountForm({ provider: 'heygen', config: {} })

    expect(wrapper.find('abbr').exists()).toBe(true)
  })

  it('uses i18n keys for every label', () => {
    // $t echoes its key, so any literal in the template shows up as something
    // other than a key. The backoffice is mandatorily bilingual.
    const wrapper = mountForm({ provider: 'heygen', config: {} })

    expect(wrapper.text()).toContain('avatar_templates.field.avatarId')
  })
})

describe('clearing a field removes it, never blanks it', () => {
  it('drops a text knob when emptied', async () => {
    // `voiceId`, not `avatarId`: `avatarId` is REQUIRED (D3), so clearing it
    // now correctly BLOCKS submit instead of vanishing the key — that
    // strengthened behaviour is covered separately in the "client-side
    // validation" describe block below.
    const wrapper = mountForm({
      provider: 'heygen',
      config: { avatarId: 'av_1', voiceId: 'vo_1' },
    })

    await wrapper.find('[data-testid="template-config-voiceId"]').setValue('')
    await wrapper.find('form').trigger('submit')

    // The API reads absent as "use the provider's default". An empty string is
    // a value, and on a number field it is a type error — so clearing has to
    // remove the key.
    const payload = wrapper.emitted('submit')?.[0]?.[0] as { config: Record<string, unknown> }
    expect(payload.config).not.toHaveProperty('voiceId')
  })

  it('drops a select knob when set back to default', async () => {
    const wrapper = mountForm({
      provider: 'heygen',
      config: { avatarId: 'av_1', videoQuality: 'high' },
    })

    await wrapper.find('[data-testid="template-config-videoQuality"]').setValue('')
    await wrapper.find('form').trigger('submit')

    // Without the empty option an operator who opens a select can never unset
    // it again — the default becomes unreachable after one click.
    const payload = wrapper.emitted('submit')?.[0]?.[0] as { config: Record<string, unknown> }
    expect(payload.config).not.toHaveProperty('videoQuality')
  })

  it('drops an unchecked checkbox rather than sending false', async () => {
    const wrapper = mountForm({
      provider: 'heygen',
      config: { avatarId: 'av_1', voiceUseSpeakerBoost: true },
    })

    await wrapper.find('[data-testid="template-config-voiceUseSpeakerBoost"]').setValue(false)
    await wrapper.find('form').trigger('submit')

    // false tells the provider "off"; absent tells it "your default". They are
    // different requests, and an operator unticking a box they never ticked
    // meant the second.
    const payload = wrapper.emitted('submit')?.[0]?.[0] as { config: Record<string, unknown> }
    expect(payload.config).not.toHaveProperty('voiceUseSpeakerBoost')
  })
})

describe('numbers', () => {
  it('submits a number, not a string', async () => {
    const wrapper = mountForm({ provider: 'heygen', config: { avatarId: 'av_1' } })

    await wrapper.find('[data-testid="template-config-voiceSpeed"]').setValue('1.05')
    await wrapper.find('form').trigger('submit')

    // The API validates types strictly: '1.05' is a type error on a number
    // field, and the operator would see a complaint about a field they can see
    // they filled in correctly.
    const payload = wrapper.emitted('submit')?.[0]?.[0] as { config: Record<string, number> }
    expect(payload.config.voiceSpeed).toBe(1.05)
  })

  it('drops an unparseable number rather than sending NaN', async () => {
    const wrapper = mountForm({ provider: 'heygen', config: { avatarId: 'av_1' } })

    await wrapper.find('[data-testid="template-config-voiceSpeed"]').setValue('abc')
    await wrapper.find('form').trigger('submit')

    const payload = wrapper.emitted('submit')?.[0]?.[0] as { config: Record<string, unknown> }
    expect(payload.config).not.toHaveProperty('voiceSpeed')
  })

  it('does not validate step client-side (D3 — server is authoritative)', async () => {
    // 1.005 is not a multiple of the 0.01 step, but it IS within min/max
    // (0.8-1.2) — float step-checking would produce false negatives, so D3
    // deliberately leaves `step` unvalidated client-side.
    const wrapper = mountForm({ provider: 'heygen', config: { avatarId: 'av_1' } })

    await wrapper.find('[data-testid="template-config-voiceSpeed"]').setValue('1.005')
    await wrapper.find('form').trigger('submit')

    expect(wrapper.emitted('submit')).toBeTruthy()
    expect(wrapper.find('[data-testid="template-config-voiceSpeed-error"]').exists()).toBe(false)
  })

  it('renders min, max and step from the spec on a number input', () => {
    // The API has serialised all three since FieldSpec.php:60, and this input
    // rendered none of them — so the browser fell back to step=1 and moved
    // voiceSpeed (0.8-1.2) a whole unit per arrow press, out of range on the
    // first click. Asserting the ATTRIBUTES, not validation: the test above
    // pins that step stays unvalidated client-side, and both are true at once.
    const wrapper = mountForm({ provider: 'heygen', config: { avatarId: 'av_1' } })
    const input = wrapper.find('[data-testid="template-config-voiceSpeed"]')

    expect(input.attributes('type')).toBe('number')
    expect(input.attributes('min')).toBe('0.8')
    expect(input.attributes('max')).toBe('1.2')
    expect(input.attributes('step')).toBe('0.01')
  })

  it('omits step on a number field whose spec declares none, rather than inventing one', () => {
    // maxSessionDurationSec is whole seconds: no step in the spec, and the
    // browser's default of 1 is the correct increment. Emitting step="1"
    // ourselves would be indistinguishable today but would silently outrank a
    // future spec change.
    const wrapper = mountForm({ provider: 'heygen', config: { avatarId: 'av_1' } })
    const input = wrapper.find('[data-testid="template-config-maxSessionDurationSec"]')

    expect(input.attributes('min')).toBe('30')
    expect(input.attributes('step')).toBeUndefined()
  })

  it('never puts min, max or step on a text input', () => {
    // On a text input min/max constrain LENGTH, not value — binding the spec's
    // numeric bounds there would quietly truncate an avatar id.
    const wrapper = mountForm({ provider: 'heygen', config: { avatarId: 'av_1' } })
    const input = wrapper.find('[data-testid="template-config-avatarId"]')

    expect(input.attributes('type')).toBe('text')
    expect(input.attributes('min')).toBeUndefined()
    expect(input.attributes('max')).toBeUndefined()
    expect(input.attributes('step')).toBeUndefined()
  })
})

describe('the provider', () => {
  it('is editable on a new template', () => {
    const wrapper = mountForm({ provider: 'heygen', config: {} })

    expect(
      wrapper.find('[data-testid="template-field-provider"]').attributes('disabled')
    ).toBeUndefined()
  })

  it('is locked on an existing one', () => {
    const wrapper = mountForm({ id: 7, provider: 'heygen', config: {} })

    // The API refuses the change: every knob belongs to one provider and none
    // overlap, so a switched provider validates as empty and falls back to
    // defaults. Offering an edit that always fails is worse than not offering it.
    expect(
      wrapper.find('[data-testid="template-field-provider"]').attributes('disabled')
    ).toBeDefined()
  })

  it('clears the config when switched on a NEW template', async () => {
    const wrapper = mountForm({ provider: 'heygen', config: { avatarId: 'av_1' } })

    await wrapper.find('[data-testid="template-field-provider"]').setValue('tavus')
    // tavus's `faceId` is required (D3): filling it is what proves the switch
    // actually DROPPED heygen's `avatarId` rather than merely not sending it
    // because the required check blocked the submit.
    await wrapper.find('[data-testid="template-config-faceId"]').setValue('face_1')
    await wrapper.find('form').trigger('submit')

    // Carrying values over would post knobs belonging to the other provider,
    // which the API rejects as unknown keys — a validation wall for an action
    // that felt like changing one dropdown.
    const payload = wrapper.emitted('submit')?.[0]?.[0] as { config: Record<string, unknown> }
    expect(payload.config).toEqual({ faceId: 'face_1' })
  })
})

// generated-client-truth-and-session-safety D6: the server now keys each
// invalid knob under its own `config.{knob}` field instead of flattening
// every knob's error into one `config` array of "{knob}: {code}" strings.
// The top-of-form `<ul>` KEEPS existing (form-clarity-and-console-warnings
// D4) as the banner fed by whatever `config.{knob}` key names a field this
// provider does not currently render, or by a genuinely unmappable
// top-level message.
describe('server 422s (D6 — per-field placement via config.{knob} keys, unmappable remainder in the banner)', () => {
  function submitErrorFor(errors: Record<string, string[]>) {
    return Object.assign(new Error('422'), {
      status: 422,
      data: { errors },
    })
  }

  it('places a config.{knob} error on its own control', () => {
    const wrapper = mount(AvatarTemplateForm, {
      props: {
        template: { name: 'Test template', provider: 'heygen', config: {} },
        fieldSpecs: SPECS,
        saving: false,
        submitError: submitErrorFor({
          'config.avatarId': ['required'],
          'config.voiceSpeed': ['range'],
        }),
      },
      global: { mocks: { $t: (key: string) => key } },
    })

    expect(wrapper.get('[data-testid="template-config-avatarId-error"]').text()).toContain(
      'avatar_templates.error.config.required'
    )
    expect(wrapper.get('[data-testid="template-config-voiceSpeed-error"]').text()).toContain(
      'avatar_templates.error.config.range'
    )
    // Mapped onto fields, so the summary carries nothing.
    expect(wrapper.find('[data-testid="template-form-errors"]').exists()).toBe(false)
  })

  it('a single invalid knob still routes correctly — placed under its own control, not the summary', () => {
    // spec.md's "A single invalid knob still routes correctly" scenario:
    // exactly one config.{knob} key in the error payload.
    const wrapper = mount(AvatarTemplateForm, {
      props: {
        template: { name: 'Test template', provider: 'heygen', config: {} },
        fieldSpecs: SPECS,
        saving: false,
        submitError: submitErrorFor({ 'config.voiceSpeed': ['range'] }),
      },
      global: { mocks: { $t: (key: string) => key } },
    })

    expect(wrapper.get('[data-testid="template-config-voiceSpeed-error"]').text()).toContain(
      'avatar_templates.error.config.range'
    )
    // Not a generic banner — the summary carries nothing.
    expect(wrapper.find('[data-testid="template-form-errors"]').exists()).toBe(false)
  })

  it('leaves a config.{knob} error naming a knob this provider does not expose in the summary', () => {
    const wrapper = mount(AvatarTemplateForm, {
      props: {
        template: { name: 'Test template', provider: 'heygen', config: {} },
        fieldSpecs: SPECS,
        saving: false,
        // `removedKnob` is not a key of ANY field in `activeFields` —
        // exactly a knob a since-changed provider spec no longer exposes.
        submitError: submitErrorFor({ 'config.removedKnob': ['unknown'] }),
      },
      global: { mocks: { $t: (key: string) => key } },
    })

    const banner = wrapper.get('[data-testid="template-form-errors"]')
    expect(banner.attributes('role')).toBe('alert')
    expect(banner.text()).toContain('unknown')
  })

  it('leaves a bare config error (non-array config) in the summary', () => {
    const wrapper = mount(AvatarTemplateForm, {
      props: {
        template: { name: 'Test template', provider: 'heygen', config: {} },
        fieldSpecs: SPECS,
        saving: false,
        submitError: submitErrorFor({ config: ['The config field must be an array.'] }),
      },
      global: { mocks: { $t: (key: string) => key } },
    })

    expect(wrapper.get('[data-testid="template-form-errors"]').text()).toContain(
      'The config field must be an array.'
    )
  })

  it('maps a top-level name 422 onto the name field', () => {
    const wrapper = mount(AvatarTemplateForm, {
      props: {
        template: { name: 'Test template', provider: 'heygen', config: {} },
        fieldSpecs: SPECS,
        saving: false,
        submitError: Object.assign(new Error('422'), {
          status: 422,
          data: { errors: { name: ['That name is already in use.'] } },
        }),
      },
      global: { mocks: { $t: (key: string) => key } },
    })

    expect(wrapper.get('[data-testid="template-name-error"]').text()).toContain(
      'That name is already in use.'
    )
  })
})

describe('client-side validation (D3 — novalidate + JS, never native bubbles)', () => {
  it('sets novalidate, so native constraint bubbles can never be the only thing blocking submit', () => {
    const wrapper = mountForm({ provider: 'heygen', config: { avatarId: 'av_1' } })

    expect(wrapper.find('form').attributes('novalidate')).toBeDefined()
  })

  it('blocks an empty name from submitting', async () => {
    const wrapper = mountForm({ provider: 'heygen', config: { avatarId: 'av_1' } })

    await wrapper.find('[data-testid="template-field-name"]').setValue('')
    await wrapper.find('form').trigger('submit')

    expect(wrapper.emitted('submit')).toBeFalsy()
    expect(wrapper.get('[data-testid="template-name-error"]').text()).toContain(
      'avatar_templates.form.errors.nameRequired'
    )
  })

  it('blocks a name over 120 characters', async () => {
    const wrapper = mountForm({ provider: 'heygen', config: { avatarId: 'av_1' } })

    await wrapper.find('[data-testid="template-field-name"]').setValue('a'.repeat(121))
    await wrapper.find('form').trigger('submit')

    expect(wrapper.emitted('submit')).toBeFalsy()
    expect(wrapper.get('[data-testid="template-name-error"]').text()).toContain(
      'avatar_templates.form.errors.nameTooLong'
    )
  })

  it('blocks a description over 500 characters', async () => {
    const wrapper = mountForm({ provider: 'heygen', config: { avatarId: 'av_1' } })

    await wrapper.find('[data-testid="template-field-description"]').setValue('a'.repeat(501))
    await wrapper.find('form').trigger('submit')

    expect(wrapper.emitted('submit')).toBeFalsy()
    expect(wrapper.get('[data-testid="template-description-error"]').text()).toContain(
      'avatar_templates.form.errors.descriptionTooLong'
    )
  })

  it('blocks submit when a required spec field is missing', async () => {
    const wrapper = mountForm({ provider: 'heygen', config: {} })

    await wrapper.find('form').trigger('submit')

    expect(wrapper.emitted('submit')).toBeFalsy()
    expect(wrapper.get('[data-testid="template-config-avatarId-error"]').text()).toContain(
      'avatar_templates.form.errors.fieldRequired'
    )
  })

  it('blocks submit when a number field is out of range', async () => {
    const wrapper = mountForm({ provider: 'heygen', config: { avatarId: 'av_1' } })

    await wrapper.find('[data-testid="template-config-voiceSpeed"]').setValue('5')
    await wrapper.find('form').trigger('submit')

    expect(wrapper.emitted('submit')).toBeFalsy()
    expect(wrapper.get('[data-testid="template-config-voiceSpeed-error"]').text()).toContain(
      'avatar_templates.form.errors.numberOutOfRange'
    )
  })
})

// form-clarity-and-console-warnings, D6: `name` gains a new help text;
// `provider_hint` (already-existing copy) merely CONVERTS from a raw <span>
// to FieldDescription — no new string. `description` stays CUT (D6 —
// optional, self-evident, its only constraint is enforced at the moment it
// is exceeded).
describe('AvatarTemplateForm — field help (D6)', () => {
  it("renders the name help text and points the control's aria-describedby at it", () => {
    const wrapper = mountForm({ provider: 'heygen', config: { avatarId: 'av_1' } })

    expect(wrapper.text()).toContain('avatar_templates.form.help.name')

    const control = wrapper.get('[data-testid="template-field-name"]')
    const describedIds = (control.attributes('aria-describedby') ?? '').split(/\s+/).filter(Boolean)
    const matched = describedIds.some((id) => {
      const el = wrapper.find(`#${id}`)
      return el.exists() && el.text() === 'avatar_templates.form.help.name'
    })
    expect(matched).toBe(true)
  })

  it('renders the provider hint through FieldDescription, not a raw span (D5)', () => {
    const wrapper = mountForm({ provider: 'heygen', config: { avatarId: 'av_1' } })

    const description = wrapper
      .findAll('[data-slot="field-description"]')
      .find((el) => el.text() === 'avatar_templates.form.provider_hint')
    expect(description).toBeDefined()
  })
})

// A form of provider settings with labels alone is a form filled by copying the
// previous value or by guessing: the names are the provider's vocabulary, not
// the operator's.
describe('field help', () => {
  it('renders the hint for every field that declares one', () => {
    const wrapper = mountForm({ provider: 'heygen', config: {} })

    for (const field of SPECS.heygen.filter((f) => f.hint_key)) {
      expect(wrapper.text()).toContain(field.hint_key)
    }
  })

  it('still renders the control for a field carrying no hint', () => {
    const wrapper = mountForm({ provider: 'heygen', config: {} })
    const noHint = SPECS.heygen.find((f) => !f.hint_key)

    // Explanation is an aid; losing it must never cost the ability to configure.
    expect(noHint).toBeDefined()
    expect(wrapper.find(`[data-testid="template-config-${noHint!.key}"]`).exists()).toBe(true)
    expect(wrapper.text()).not.toContain(`avatar_templates.hint.${noHint!.key}`)
  })
})

/**
 * A checkbox must not stretch to the container.
 *
 * `fieldVariants`' vertical orientation carries `*:w-full`, a child combinator
 * that outranks the `size-4` class on the input itself — so a checkbox wrapped
 * in a default Field rendered as a box the full width of the page. This asserts
 * the orientation, not the computed width, because jsdom does not apply
 * Tailwind: the orientation IS the mechanism, and it is what a regression would
 * change.
 */
// feature/form-drawer: the drawer is wide enough for two columns, and the
// GENERATED provider fields (up to 15 for tavus, 11 for heygen) are the ones
// that benefit from it — but two columns for a handful of fields reads worse
// than one, so the layout degrades to a single column below a threshold.
describe('two-column layout for generated provider fields (feature/form-drawer)', () => {
  it('lays out the generated fields in two columns once there are enough of them', () => {
    // heygen's fixture carries 5 fields — above the threshold.
    const wrapper = mountForm({ provider: 'heygen', config: {} })

    const container = wrapper.get('[data-testid="template-config-fields"]')
    expect(container.classes()).toContain('grid')
  })

  it('degrades to a single column when there are few generated fields', () => {
    // tavus's fixture carries exactly 1 field — two columns for one field is
    // strictly worse than one, so this must stay single-column.
    const wrapper = mountForm({ provider: 'tavus', config: {} })

    const container = wrapper.get('[data-testid="template-config-fields"]')
    expect(container.classes()).not.toContain('grid')
  })

  it("does not change a Field's own orientation when arranging it into the grid", () => {
    // The checkbox-vs-text orientation assertion above (D3) must survive the
    // grid wrapper unchanged — a two-column ARRANGEMENT of fields is not the
    // same thing as a field's own internal label/control orientation.
    const wrapper = mountForm({ provider: 'heygen', config: {} })

    const checkbox = wrapper.find('input[type="checkbox"]')
    const field = checkbox.element.closest('[data-slot="field"]')
    expect(field?.getAttribute('data-orientation')).toBe('horizontal')
  })
})

it('lays a checkbox field out horizontally so it cannot stretch to the container', () => {
  const wrapper = mountForm()

  const checkbox = wrapper.find('input[type="checkbox"]')
  expect(checkbox.exists()).toBe(true)

  const field = checkbox.element.closest('[data-slot="field"]')
  expect(field?.getAttribute('data-orientation')).toBe('horizontal')

  // A non-checkbox control keeps the vertical stacking it needs.
  const text = wrapper.find('input[type="text"], input[type="number"], select')
  const textField = text.element.closest('[data-slot="field"]')
  expect(textField?.getAttribute('data-orientation')).toBe('vertical')
})
