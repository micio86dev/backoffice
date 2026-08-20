<template>
  <div class="bg-background flex min-h-screen items-center justify-center px-4">
    <Card class="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{{ $t('login.title') }}</CardTitle>
        <CardDescription>{{ $t('login.subtitle') }}</CardDescription>
      </CardHeader>
      <CardContent>
        <form data-testid="login-form" novalidate @submit.prevent="onSubmit">
          <FieldGroup>
            <Field :data-invalid="Boolean(emailError)">
              <FieldLabel for="login-email">{{ $t('login.email') }}</FieldLabel>
              <Input
                id="login-email"
                v-model="email"
                type="email"
                autocomplete="username"
                :aria-invalid="Boolean(emailError)"
                :aria-describedby="emailError ? 'login-email-error' : undefined"
                data-testid="login-email"
                @blur="validateEmail"
              />
              <FieldError v-if="emailError" id="login-email-error" data-testid="login-email-error">
                {{ emailError }}
              </FieldError>
            </Field>
            <Field :data-invalid="Boolean(passwordError)">
              <FieldLabel for="login-password">{{ $t('login.password') }}</FieldLabel>
              <Input
                id="login-password"
                v-model="password"
                type="password"
                autocomplete="current-password"
                :aria-invalid="Boolean(passwordError)"
                :aria-describedby="passwordError ? 'login-password-error' : undefined"
                data-testid="login-password"
                @blur="validatePassword"
              />
              <FieldError
                v-if="passwordError"
                id="login-password-error"
                data-testid="login-password-error"
              >
                {{ passwordError }}
              </FieldError>
            </Field>
            <!--
              Form-level outcome, deliberately adjacent to the submit control
              rather than at the top of the card. "Invalid credentials" cannot be
              attributed to the email field or to the password field — saying
              which one was wrong is exactly the user enumeration an auth form
              must not leak — so it is not a field error and must not render as
              one. It sits where the eye already is after pressing the button.
            -->
            <Alert
              v-if="formMessage"
              :variant="formMessage.kind === 'error' ? 'destructive' : 'default'"
              role="alert"
              aria-live="polite"
              data-testid="login-error"
            >
              <AlertDescription>{{ formMessage.text }}</AlertDescription>
            </Alert>
            <Button type="submit" :disabled="submitting" data-testid="login-submit">
              {{ submitting ? $t('login.submitting') : $t('login.submit') }}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useAuth } from '@/composables/useAuth'

definePageMeta({
  name: 'login',
  // Pre-auth surface — never wrapped in the authenticated admin shell (D11/task 15.3).
  layout: false,
})

const { t } = useI18n()

useHead({
  // WCAG 2.4.2 (Page Titled): non-empty <title> required — and the title is
  // user-facing (browser tab, bookmark, window switcher, and the first thing a
  // screen reader announces on navigation), so it goes through i18n.
  title: () => t('head.title.login'),
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})

interface LoginResponse {
  access_token: string
  token_type: string
}

const email = ref('')
const password = ref('')
const submitting = ref(false)
const emailError = ref('')
const passwordError = ref('')
const formMessage = ref<{ kind: 'error' | 'success'; text: string } | null>(null)

// `novalidate` on the form hands validation to us on purpose: the browser's
// native bubble is unstyled, untranslated, and vanishes on the next click,
// which satisfies none of DESIGN.md §16 (message under the field, aria-invalid,
// aria-describedby pointing at it).
function validateEmail(): boolean {
  if (email.value.trim() === '') {
    emailError.value = t('login.emailRequired')
    // Domain labels exclude the dot, which is the whole point: the previous
    // `[^@\s]+\.[^@\s]+` let the separator also be matched by the surrounding
    // class, so the engine had exponentially many ways to split a long domain
    // and a crafted address could pin the main thread. Ambiguity in a regex on
    // user input is a denial-of-service surface, not a style preference.
  } else if (!/^[^@\s]+@[^@\s.]+(?:\.[^@\s.]+)+$/.test(email.value.trim())) {
    emailError.value = t('login.emailInvalid')
  } else {
    emailError.value = ''
  }

  return emailError.value === ''
}

function validatePassword(): boolean {
  passwordError.value = password.value === '' ? t('login.passwordRequired') : ''

  return passwordError.value === ''
}

async function onSubmit(): Promise<void> {
  formMessage.value = null

  // Both run before the short-circuit: `&&` would skip the password check the
  // moment the email failed, so a form submitted empty would flag one field,
  // then flag the next only after the first was fixed. Validate everything,
  // report everything.
  const emailOk = validateEmail()
  const passwordOk = validatePassword()

  if (!emailOk || !passwordOk) {
    return
  }

  submitting.value = true
  try {
    const apiBase = useRuntimeConfig().public.apiBase
    // credentials:'include' (backoffice-session-refresh-hardening D2/D4): api
    // and backoffice are different origins even on localhost, and a
    // cross-origin response's Set-Cookie header is silently DROPPED by the
    // browser unless the request itself opted into credentialed mode — this
    // is what makes the returned beai_refresh cookie actually get stored.
    const response = await $fetch<LoginResponse>(`${apiBase}/auth/login`, {
      method: 'POST',
      credentials: 'include',
      body: { email: email.value, password: password.value },
    })
    useAuth().setSession(response.access_token)
    formMessage.value = { kind: 'success', text: t('login.success') }
    await navigateTo('/')
  } catch {
    formMessage.value = { kind: 'error', text: t('login.error') }
  } finally {
    submitting.value = false
  }
}
</script>
