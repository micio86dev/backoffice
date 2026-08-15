<template>
  <form data-testid="profile-password-form" novalidate @submit.prevent="onSubmit">
    <FieldGroup>
      <!--
        Hidden `username` field carrying the email (design D8): without it,
        password managers routinely file the rotated credential under no
        account at all. `sr-only` (visually hidden, still in the accessibility
        tree) + `readonly` + `tabindex="-1"` — it is never an interactive
        control for a sighted or keyboard user, only metadata for the manager.
      -->
      <!--
        A distinct label, deliberately NOT reusing profile.details.email — an
        identical accessible name on this hidden field and the visible email
        input in ProfileDetailsForm would make every `getByRole/getByLabel`
        query for "Email" ambiguous (strict-mode violation) the moment both
        forms are on screen together, as they are on /profile.
      -->
      <FieldLabel for="profile-password-username" class="sr-only">{{
        $t('profile.password.usernameHint')
      }}</FieldLabel>
      <input
        id="profile-password-username"
        :value="props.email"
        type="text"
        readonly
        tabindex="-1"
        autocomplete="username"
        class="sr-only"
        data-testid="profile-password-username"
      />

      <Field :data-invalid="Boolean(errors.current)">
        <FieldLabel for="profile-password-current">{{ $t('profile.password.current') }}</FieldLabel>
        <Input
          id="profile-password-current"
          v-model="currentPassword"
          type="password"
          autocomplete="current-password"
          :aria-invalid="Boolean(errors.current)"
          :aria-describedby="errors.current ? 'profile-password-current-error' : undefined"
          data-testid="profile-password-current"
          @blur="validateCurrent"
        />
        <FieldError
          v-if="errors.current"
          id="profile-password-current-error"
          data-testid="profile-password-current-error"
          >{{ errors.current }}</FieldError
        >
      </Field>

      <Field :data-invalid="Boolean(errors.next)">
        <FieldLabel for="profile-password-new">{{ $t('profile.password.new') }}</FieldLabel>
        <Input
          id="profile-password-new"
          v-model="newPassword"
          type="password"
          autocomplete="new-password"
          :aria-invalid="Boolean(errors.next)"
          :aria-describedby="errors.next ? 'profile-password-new-error' : undefined"
          data-testid="profile-password-new"
          @blur="validateNew"
        />
        <FieldError
          v-if="errors.next"
          id="profile-password-new-error"
          data-testid="profile-password-new-error"
          >{{ errors.next }}</FieldError
        >
      </Field>

      <Field :data-invalid="Boolean(errors.confirmation)">
        <FieldLabel for="profile-password-confirmation">{{
          $t('profile.password.confirm')
        }}</FieldLabel>
        <Input
          id="profile-password-confirmation"
          v-model="confirmation"
          type="password"
          autocomplete="new-password"
          :aria-invalid="Boolean(errors.confirmation)"
          :aria-describedby="
            errors.confirmation ? 'profile-password-confirmation-error' : undefined
          "
          data-testid="profile-password-confirmation"
          @blur="validateConfirmation"
        />
        <FieldError
          v-if="errors.confirmation"
          id="profile-password-confirmation-error"
          data-testid="profile-password-confirmation-error"
          >{{ errors.confirmation }}</FieldError
        >
      </Field>

      <Alert
        v-if="formMessage"
        :variant="formMessage.kind === 'error' ? 'destructive' : 'default'"
        role="alert"
        aria-live="polite"
        data-testid="profile-password-banner"
      >
        <AlertDescription>{{ formMessage.text }}</AlertDescription>
      </Alert>

      <Button type="submit" :disabled="saving" data-testid="profile-password-submit">
        {{ $t('profile.password.title') }}
      </Button>
    </FieldGroup>
  </form>
</template>

<script setup lang="ts">
// Password-change form (user-profile-self-service, design D3/D4/D8): PUT
// /api/profile/password only. On success, the acting session is re-minted
// (design D3) — the response's brand-new access_token is handed to
// useAuth().setSession(), and useCurrentUser() is refreshed so no stale
// identity is cached against the new session.
import { ref } from 'vue'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useProfile } from '@/composables/useProfile'
import { useAuth } from '@/composables/useAuth'
import { useCurrentUser } from '@/composables/useCurrentUser'
import { applyServerFieldErrors } from '@/utils/http-error'

const props = defineProps<{
  email: string
}>()

const emit = defineEmits<{
  (e: 'saved'): void
}>()

const { updatePassword } = useProfile()
const { t } = useI18n()

const currentPassword = ref('')
const newPassword = ref('')
const confirmation = ref('')

const saving = ref(false)
const formMessage = ref<{ kind: 'error' | 'success'; text: string } | null>(null)
const errors = ref<{ current?: string; next?: string; confirmation?: string }>({})

function validateCurrent(): boolean {
  errors.value.current =
    currentPassword.value === '' ? t('profile.password.currentRequired') : undefined
  return !errors.value.current
}

function validateNew(): boolean {
  if (newPassword.value === '') {
    errors.value.next = t('profile.password.newRequired')
  } else if (newPassword.value.length < 8) {
    errors.value.next = t('profile.password.newTooShort')
  } else {
    errors.value.next = undefined
  }
  return !errors.value.next
}

function validateConfirmation(): boolean {
  errors.value.confirmation =
    confirmation.value !== newPassword.value ? t('profile.password.confirmMismatch') : undefined
  return !errors.value.confirmation
}

const SERVER_FIELD_TO_ERROR_KEY = {
  current_password: 'current',
  password: 'next',
  password_confirmation: 'confirmation',
} as const satisfies Record<string, keyof typeof errors.value>

async function onSubmit(): Promise<void> {
  formMessage.value = null
  const currentOk = validateCurrent()
  const newOk = validateNew()
  const confirmationOk = validateConfirmation()
  if (!currentOk || !newOk || !confirmationOk) return

  saving.value = true
  try {
    const response = await updatePassword({
      current_password: currentPassword.value,
      password: newPassword.value,
      password_confirmation: confirmation.value,
    })
    useAuth().setSession(response.access_token)
    await useCurrentUser().refresh()
    currentPassword.value = ''
    newPassword.value = ''
    confirmation.value = ''
    emit('saved')
  } catch (error) {
    const unmapped = applyServerFieldErrors(error, SERVER_FIELD_TO_ERROR_KEY, (key, message) => {
      errors.value[key] = message
    })
    formMessage.value = {
      kind: 'error',
      text: unmapped && unmapped.length > 0 ? unmapped.join(' ') : t('profile.password.saveError'),
    }
  } finally {
    saving.value = false
  }
}
</script>
