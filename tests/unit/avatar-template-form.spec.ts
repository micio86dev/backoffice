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
  ],
  tavus: [
    { key: 'faceId', type: 'text', label_key: 'avatar_templates.field.faceId', required: true },
  ],
}

function mountForm(template: Record<string, unknown> = {}) {
  return mount(AvatarTemplateForm, {
    props: { template, fieldSpecs: SPECS, saving: false, errors: [] },
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
    const wrapper = mountForm({ provider: 'heygen', config: { avatarId: 'av_1' } })

    await wrapper.find('[data-testid="template-config-avatarId"]').setValue('')
    await wrapper.find('form').trigger('submit')

    // The API reads absent as "use the provider's default". An empty string is
    // a value, and on a number field it is a type error — so clearing has to
    // remove the key.
    const payload = wrapper.emitted('submit')?.[0]?.[0] as { config: Record<string, unknown> }
    expect(payload.config).not.toHaveProperty('avatarId')
  })

  it('drops a select knob when set back to default', async () => {
    const wrapper = mountForm({ provider: 'heygen', config: { videoQuality: 'high' } })

    await wrapper.find('[data-testid="template-config-videoQuality"]').setValue('')
    await wrapper.find('form').trigger('submit')

    // Without the empty option an operator who opens a select can never unset
    // it again — the default becomes unreachable after one click.
    const payload = wrapper.emitted('submit')?.[0]?.[0] as { config: Record<string, unknown> }
    expect(payload.config).not.toHaveProperty('videoQuality')
  })

  it('drops an unchecked checkbox rather than sending false', async () => {
    const wrapper = mountForm({ provider: 'heygen', config: { voiceUseSpeakerBoost: true } })

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
    const wrapper = mountForm({ provider: 'heygen', config: {} })

    await wrapper.find('[data-testid="template-config-voiceSpeed"]').setValue('1.05')
    await wrapper.find('form').trigger('submit')

    // The API validates types strictly: '1.05' is a type error on a number
    // field, and the operator would see a complaint about a field they can see
    // they filled in correctly.
    const payload = wrapper.emitted('submit')?.[0]?.[0] as { config: Record<string, number> }
    expect(payload.config.voiceSpeed).toBe(1.05)
  })

  it('drops an unparseable number rather than sending NaN', async () => {
    const wrapper = mountForm({ provider: 'heygen', config: {} })

    await wrapper.find('[data-testid="template-config-voiceSpeed"]').setValue('abc')
    await wrapper.find('form').trigger('submit')

    const payload = wrapper.emitted('submit')?.[0]?.[0] as { config: Record<string, unknown> }
    expect(payload.config).not.toHaveProperty('voiceSpeed')
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
    await wrapper.find('form').trigger('submit')

    // Carrying values over would post knobs belonging to the other provider,
    // which the API rejects as unknown keys — a validation wall for an action
    // that felt like changing one dropdown.
    const payload = wrapper.emitted('submit')?.[0]?.[0] as { config: Record<string, unknown> }
    expect(payload.config).toEqual({})
  })
})

describe('errors', () => {
  it('shows every validation error at once', () => {
    const wrapper = mount(AvatarTemplateForm, {
      props: {
        template: { provider: 'heygen', config: {} },
        fieldSpecs: SPECS,
        saving: false,
        errors: ['avatarId: required', 'voiceSpeed: range'],
      },
      global: { mocks: { $t: (key: string) => key } },
    })

    // One error per round trip turns a seventeen-field form into a guessing
    // game, so the API returns them all and the form shows them all.
    expect(wrapper.findAll('[data-testid="template-form-errors"] li')).toHaveLength(2)
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
