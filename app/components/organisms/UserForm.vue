<template>
  <form data-testid="user-form" novalidate @submit.prevent="onSubmit">
    <FieldGroup>
      <Field :data-invalid="Boolean(errors.name)">
        <FieldLabel for="user-form-name">{{ $t('users.name') }}</FieldLabel>
        <Input
          id="user-form-name"
          v-model="name"
          autocomplete="off"
          :aria-invalid="Boolean(errors.name)"
          :aria-describedby="errors.name ? 'user-form-name-error' : undefined"
          data-testid="user-form-name"
          @blur="validateName"
        />
        <FieldError
          v-if="errors.name"
          id="user-form-name-error"
          data-testid="user-form-name-error"
          >{{ errors.name }}</FieldError
        >
      </Field>

      <Field :data-invalid="Boolean(errors.email)">
        <FieldLabel for="user-form-email">{{ $t('users.email') }}</FieldLabel>
        <Input
          id="user-form-email"
          v-model="email"
          type="email"
          autocomplete="off"
          :aria-invalid="Boolean(errors.email)"
          :aria-describedby="describedBy('user-form-email', Boolean(errors.email))"
          data-testid="user-form-email"
          @blur="validateEmail"
        />
        <FieldDescription id="user-form-email-help">{{
          $t('users.form.help.email')
        }}</FieldDescription>
        <FieldError
          v-if="errors.email"
          id="user-form-email-error"
          data-testid="user-form-email-error"
        >
          {{ errors.email }}
        </FieldError>
      </Field>

      <Field v-if="!isEditing" :data-invalid="Boolean(errors.password)">
        <FieldLabel for="user-form-password">{{ $t('users.password') }}</FieldLabel>
        <Input
          id="user-form-password"
          v-model="password"
          type="password"
          autocomplete="new-password"
          :aria-invalid="Boolean(errors.password)"
          :aria-describedby="describedBy('user-form-password', Boolean(errors.password))"
          data-testid="user-form-password"
          @blur="validatePassword"
        />
        <FieldDescription id="user-form-password-help">
          {{ $t('users.form.help.password') }}
        </FieldDescription>
        <FieldError
          v-if="errors.password"
          id="user-form-password-error"
          data-testid="user-form-password-error"
          >{{ errors.password }}</FieldError
        >
      </Field>

      <Field>
        <FieldLabel for="user-form-role">{{ $t('users.accessLevel') }}</FieldLabel>
        <!-- eslint-disable-next-line vuejs-accessibility/form-control-has-label -->
        <Select v-model="role">
          <SelectTrigger
            id="user-form-role"
            data-testid="user-form-role"
            aria-describedby="user-form-role-help"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem v-for="value in ACCESS_LEVELS" :key="value" :value="value">
                {{ $t(`users.role.${value}`) }}
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <FieldDescription id="user-form-role-help">{{
          $t('users.form.help.role')
        }}</FieldDescription>
      </Field>

      <Alert
        v-if="formMessage"
        variant="destructive"
        role="alert"
        aria-live="polite"
        data-testid="user-form-banner"
      >
        <AlertDescription>{{ formMessage }}</AlertDescription>
      </Alert>

      <Button type="submit" :disabled="saving" data-testid="user-form-submit">
        {{ $t('projects.action.save') }}
      </Button>
    </FieldGroup>
  </form>
</template>

<script setup lang="ts">
// User create/edit form (D4/D8): the role Select is constrained to EXACTLY
// admin/operator/viewer (the code-level allow-list, mirrored client-side —
// never free text, never a BEAI role_code value). Password is admin-set
// (D4 "New User Initial Password Set By Admin") and only offered at create.
import { ref } from 'vue'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useUsers, type UserResponse } from '@/composables/useUsers'
import { applyServerFieldErrors } from '@/utils/http-error'

const ACCESS_LEVELS = ['admin', 'operator', 'viewer'] as const

const props = defineProps<{
  user: UserResponse['data'] | null
}>()

const emit = defineEmits<{
  (e: 'saved'): void
}>()

const { createUser, updateUser } = useUsers()
const { t } = useI18n()

const isEditing = props.user !== null

const name = ref(props.user?.name ?? '')
const email = ref(props.user?.email ?? '')
const password = ref('')
// ACCESS_LEVELS equals App\Enums\OrgRole::values() (admin/operator/viewer) —
// the generated client's `role` type is that exact union plus null, so no
// cast is needed to narrow it (design.md D3, task 4.5).
const role = ref<(typeof ACCESS_LEVELS)[number]>(props.user?.role ?? 'operator')

const saving = ref(false)
const formMessage = ref<string | null>(null)
const errors = ref<{ name?: string; email?: string; password?: string }>({})

// A plain char-scan rather than `login.vue`'s regex: the same
// `/^[^@\s]+@[^@\s]+\.[^@\s]+$/` pattern trips
// `regexp/no-super-linear-backtracking` here (login.vue predates this rule
// being enforced and is out of this batch's scope to touch). Same accepted
// bound as that pattern — exactly one `@`, at least one `.` after it, no
// whitespace — without the backtracking shape.
function isPlausibleEmail(value: string): boolean {
  if (/\s/.test(value)) return false
  const atIndex = value.indexOf('@')
  if (atIndex <= 0 || atIndex !== value.lastIndexOf('@')) return false
  const domain = value.slice(atIndex + 1)
  const dotIndex = domain.indexOf('.')
  return dotIndex > 0 && dotIndex < domain.length - 1
}

function validateName(): boolean {
  errors.value.name = name.value.trim() === '' ? t('users.form.nameRequired') : undefined
  return !errors.value.name
}

function validateEmail(): boolean {
  const trimmed = email.value.trim()
  if (trimmed === '') {
    errors.value.email = t('users.form.emailRequired')
  } else if (!isPlausibleEmail(trimmed)) {
    errors.value.email = t('users.form.emailInvalid')
  } else {
    errors.value.email = undefined
  }
  return !errors.value.email
}

/**
 * Joins a field's error id (when invalid) with its help-text id
 * (form-clarity-and-console-warnings, D6).
 */
function describedBy(baseId: string, hasError: boolean): string {
  const ids = [hasError ? `${baseId}-error` : null, `${baseId}-help`].filter(
    (id): id is string => id !== null
  )

  return ids.join(' ')
}

function validatePassword(): boolean {
  if (isEditing) {
    errors.value.password = undefined
    return true
  }
  errors.value.password = password.value.length < 8 ? t('users.form.passwordTooShort') : undefined
  return !errors.value.password
}

/**
 * Server field name -> local error key.
 *
 * `role` deliberately has no entry: the Select is constrained client-side to
 * exactly admin/operator/viewer, so a server 422 on it is unexpected rather
 * than a normal validation failure — it reaches the form-level banner like
 * any other field this form renders no control-specific handling for.
 */
const SERVER_FIELD_TO_ERROR_KEY = {
  name: 'name',
  email: 'email',
  password: 'password',
} as const satisfies Record<string, keyof typeof errors.value>

async function onSubmit(): Promise<void> {
  formMessage.value = null
  const nameOk = validateName()
  const emailOk = validateEmail()
  const passwordOk = validatePassword()
  if (!nameOk || !emailOk || !passwordOk) return

  saving.value = true
  try {
    if (isEditing && props.user) {
      await updateUser(props.user.id, { name: name.value, email: email.value, role: role.value })
    } else {
      await createUser({
        name: name.value,
        email: email.value,
        password: password.value,
        role: role.value,
      })
    }
    emit('saved')
  } catch (error) {
    const unmapped = applyServerFieldErrors(error, SERVER_FIELD_TO_ERROR_KEY, (key, message) => {
      errors.value[key] = message
    })
    // A field with no control of its own (`role`, constrained client-side to
    // admin/operator/viewer) still has to reach the operator — the server's
    // own message beats a generic banner that hides it.
    formMessage.value =
      unmapped && unmapped.length > 0 ? unmapped.join(' ') : t('users.form.saveError')
  } finally {
    saving.value = false
  }
}
</script>
