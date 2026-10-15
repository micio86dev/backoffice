/**
 * AvatarTemplateForm — the optional interviewer display name (`persona.display_name`).
 *
 * The api owns the rule (max 60, no markup or control characters, no vendor
 * name) and answers a refusal with a literal sentence. The form limits the
 * length, trims nothing the operator did not ask to trim, and shows its OWN
 * i18n copy for a refusal so that no vendor word is ever echoed.
 *
 * The write contract is asymmetric on purpose: a cleared name on an UPDATE is
 * `persona: {}` (an absent key cannot clear anything, and an empty string is
 * refused), while a cleared name on a CREATE sends no `persona` at all.
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AvatarTemplateForm from '../../app/components/organisms/AvatarTemplateForm.vue'
import type { FieldSpec, ProviderName } from '../../app/types/avatar-template'
import en from '../../i18n/locales/en.json'
import it_ from '../../i18n/locales/it.json'

const SPECS: Record<ProviderName, FieldSpec[]> = {
  heygen: [{ key: 'voiceId', type: 'text', label_key: 'avatar_templates.field.voiceId' }],
  tavus: [],
}

const INPUT = '[data-testid="template-field-persona-display-name"]'
const ERROR = '[data-testid="template-persona-display-name-error"]'

function mountForm(template: Record<string, unknown> = {}, submitError: unknown = null) {
  return mount(AvatarTemplateForm, {
    props: {
      template: { name: 'Test template', provider: 'heygen', config: {}, ...template },
      fieldSpecs: SPECS,
      saving: false,
      submitError,
    },
    global: { mocks: { $t: (key: string) => key } },
  })
}

type Payload = { persona?: { display_name?: string } }

async function submitted(wrapper: ReturnType<typeof mountForm>): Promise<Payload> {
  await wrapper.find('form').trigger('submit')

  return wrapper.emitted('submit')?.[0]?.[0] as Payload
}

describe('the interviewer display name input', () => {
  it('is labelled, described and limited to 60 characters', () => {
    const input = mountForm().get(INPUT)

    const label = mountForm().get(`label[for="${input.attributes('id')}"]`)
    expect(label.text()).toContain('avatar_templates.form.persona_display_name')
    expect(input.attributes('maxlength')).toBe('60')

    const describedBy = input.attributes('aria-describedby') ?? ''
    expect(
      mountForm()
        .get(`#${describedBy.split(' ')[0]}`)
        .text()
    ).toContain('avatar_templates.form.persona_display_name_hint')
  })

  it('loads the stored value when editing', () => {
    const wrapper = mountForm({ id: 4, persona: { display_name: 'Giulia' } })

    expect((wrapper.get(INPUT).element as HTMLInputElement).value).toBe('Giulia')
  })
})

describe('the payload', () => {
  it('carries the typed name on create', async () => {
    const wrapper = mountForm()

    await wrapper.get(INPUT).setValue('Giulia')

    expect((await submitted(wrapper)).persona).toEqual({ display_name: 'Giulia' })
  })

  it('carries no persona on create when the input is empty', async () => {
    const payload = await submitted(mountForm())

    expect(payload).not.toHaveProperty('persona')
  })

  it('submits the same name when an unrelated field is edited', async () => {
    const wrapper = mountForm({ id: 4, persona: { display_name: 'Giulia' } })

    await wrapper.get('[data-testid="template-field-description"]').setValue('other')

    expect((await submitted(wrapper)).persona).toEqual({ display_name: 'Giulia' })
  })

  it('clears with an empty persona object on update, never an empty string', async () => {
    const wrapper = mountForm({ id: 4, persona: { display_name: 'Giulia' } })

    await wrapper.get(INPUT).setValue('')

    const payload = await submitted(wrapper)
    expect(payload.persona).toEqual({})
    expect(JSON.stringify(payload)).not.toContain('""')
  })

  it('treats a whitespace-only input as cleared', async () => {
    const wrapper = mountForm({ id: 4, persona: { display_name: 'Giulia' } })

    await wrapper.get(INPUT).setValue('   ')

    expect((await submitted(wrapper)).persona).toEqual({})
  })

  it('leaves an untouched update without a name as an empty persona', async () => {
    const payload = await submitted(mountForm({ id: 4, persona: { display_name: null } }))

    expect(payload.persona).toEqual({})
  })
})

describe('a server refusal on persona.display_name', () => {
  const refusal = Object.assign(new Error('422'), {
    status: 422,
    data: { errors: { 'persona.display_name': ['The name must not name a provider.'] } },
  })

  it('shows the i18n copy next to the input, linked to it, and keeps what was typed', () => {
    const wrapper = mountForm({ persona: { display_name: 'Giulia' } }, refusal)

    const error = wrapper.get(ERROR)
    expect(error.text()).toContain('avatar_templates.form.errors.personaDisplayNameInvalid')
    // The server sentence is never rendered: it is English-only copy.
    expect(wrapper.text()).not.toContain('must not name a provider')

    const input = wrapper.get(INPUT)
    expect(input.attributes('aria-invalid')).toBe('true')
    expect(input.attributes('aria-describedby')).toContain(error.attributes('id'))
    expect((input.element as HTMLInputElement).value).toBe('Giulia')
    // Mapped onto the field, so the summary carries nothing.
    expect(wrapper.find('[data-testid="template-form-errors"]').exists()).toBe(false)
  })
})

describe('copy', () => {
  const keys = [
    ['form', 'persona_display_name'],
    ['form', 'persona_display_name_hint'],
    ['form', 'errors', 'personaDisplayNameInvalid'],
  ]

  const lookup = (table: unknown, path: string[]): unknown =>
    path.reduce<unknown>(
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      (table as { avatar_templates: unknown }).avatar_templates
    )

  it.each(keys.map((path) => [path.join('.'), path] as const))(
    'has an it and an en entry for %s',
    (_label, path) => {
      for (const table of [en, it_]) {
        expect(typeof lookup(table, path)).toBe('string')
      }
    }
  )

  it('names no vendor in the new copy', () => {
    const vendors = /heygen|liveavatar|tavus|daily|livekit/i

    for (const table of [en, it_]) {
      for (const path of keys) {
        expect(String(lookup(table, path))).not.toMatch(vendors)
      }
    }
  })
})
