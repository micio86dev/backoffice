<template>
  <form data-testid="profile-details-form" novalidate @submit.prevent="onSubmit">
    <FormFieldset :disabled="saving">
      <FieldGroup>
        <Field :data-invalid="Boolean(errors.name)">
          <FieldLabel for="profile-details-name">{{ $t('profile.details.name') }}</FieldLabel>
          <Input
            id="profile-details-name"
            v-model="name"
            autocomplete="off"
            :aria-invalid="Boolean(errors.name)"
            :aria-describedby="errors.name ? 'profile-details-name-error' : undefined"
            data-testid="profile-details-name"
            @blur="validateName"
          />
          <FieldError
            v-if="errors.name"
            id="profile-details-name-error"
            data-testid="profile-details-name-error"
            >{{ errors.name }}</FieldError
          >
        </Field>

        <Field :data-invalid="Boolean(errors.email)">
          <FieldLabel for="profile-details-email">{{ $t('profile.details.email') }}</FieldLabel>
          <Input
            id="profile-details-email"
            v-model="email"
            type="email"
            autocomplete="off"
            :aria-invalid="Boolean(errors.email)"
            :aria-describedby="errors.email ? 'profile-details-email-error' : undefined"
            data-testid="profile-details-email"
            @blur="validateEmail"
          />
          <FieldError
            v-if="errors.email"
            id="profile-details-email-error"
            data-testid="profile-details-email-error"
          >
            {{ errors.email }}
          </FieldError>
        </Field>

        <Field>
          <FieldLabel for="profile-details-locale">{{ $t('profile.details.locale') }}</FieldLabel>
          <!-- eslint-disable-next-line vuejs-accessibility/form-control-has-label -->
          <Select v-model="locale">
            <SelectTrigger id="profile-details-locale" data-testid="profile-details-locale">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="en">EN</SelectItem>
                <SelectItem value="it">IT</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

        <FormMessage
          v-if="formMessage"
          :kind="formMessage.kind"
          :text="formMessage.text"
          test-id="profile-details-banner"
        />

        <Button type="submit" :loading="saving" data-testid="profile-details-submit">
          {{ $t('projects.action.save') }}
        </Button>
      </FieldGroup>
    </FormFieldset>
  </form>
</template>

<script setup lang="ts">
// Account details form (user-profile-self-service, design D8): name/email/
// locale, PATCH /api/profile only. Two-level feedback contract per
// OrganizationProfileForm.vue's precedent. `role` and `organization` are
// NEVER read or submitted here — this form has no control for either.
import { ref } from 'vue'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { FormFieldset } from '@/components/ui/form-fieldset'
import FormMessage, { type FormMessageKind } from '@/components/molecules/FormMessage.vue'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useProfile, type ProfileResponse } from '@/composables/useProfile'
import { applyServerFieldErrors } from '@/utils/http-error'

const props = defineProps<{
  profile: ProfileResponse['data']
}>()

const emit = defineEmits<{
  (e: 'saved'): void
}>()

const { updateProfile } = useProfile()
const { t } = useI18n()

const name = ref(props.profile.name)
const email = ref(props.profile.email)
const locale = ref<'it' | 'en'>((props.profile.locale as 'it' | 'en') ?? 'en')

const saving = ref(false)
const formMessage = ref<{ kind: FormMessageKind; text: string } | null>(null)
const errors = ref<{ name?: string; email?: string }>({})

// Same plain char-scan as UserForm.vue's isPlausibleEmail — avoids the
// `regexp/no-super-linear-backtracking` trip that login.vue's original
// pattern hits.
function isPlausibleEmail(value: string): boolean {
  if (/\s/.test(value)) return false
  const atIndex = value.indexOf('@')
  if (atIndex <= 0 || atIndex !== value.lastIndexOf('@')) return false
  const domain = value.slice(atIndex + 1)
  const dotIndex = domain.indexOf('.')
  return dotIndex > 0 && dotIndex < domain.length - 1
}

function validateName(): boolean {
  errors.value.name = name.value.trim() === '' ? t('profile.details.nameRequired') : undefined
  return !errors.value.name
}

function validateEmail(): boolean {
  const trimmed = email.value.trim()
  if (trimmed === '') {
    errors.value.email = t('profile.details.emailRequired')
  } else if (!isPlausibleEmail(trimmed)) {
    errors.value.email = t('profile.details.emailInvalid')
  } else {
    errors.value.email = undefined
  }
  return !errors.value.email
}

const SERVER_FIELD_TO_ERROR_KEY = {
  name: 'name',
  email: 'email',
} as const satisfies Record<string, keyof typeof errors.value>

async function onSubmit(): Promise<void> {
  formMessage.value = null
  const nameOk = validateName()
  const emailOk = validateEmail()
  if (!nameOk || !emailOk) return

  saving.value = true
  try {
    await updateProfile({ name: name.value, email: email.value, locale: locale.value })
    emit('saved')
  } catch (error) {
    const unmapped = applyServerFieldErrors(error, SERVER_FIELD_TO_ERROR_KEY, (key, message) => {
      errors.value[key] = message
    })
    formMessage.value = {
      kind: 'error',
      text: unmapped && unmapped.length > 0 ? unmapped.join(' ') : t('profile.details.saveError'),
    }
  } finally {
    saving.value = false
  }
}
</script>
