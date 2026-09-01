<template>
  <div class="bg-background flex min-h-screen items-center justify-center px-4">
    <Card class="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{{
          succeeded ? $t('resetPassword.successTitle') : $t('resetPassword.title')
        }}</CardTitle>
        <CardDescription v-if="!succeeded && hasToken">{{
          $t('resetPassword.subtitle')
        }}</CardDescription>
      </CardHeader>

      <CardContent>
        <!--
          Terminal success. The form is gone: the token is single-use and has
          just been spent, so leaving a submit control that can only fail from
          here would be a control that lies.
        -->
        <div v-if="succeeded" class="flex flex-col gap-4">
          <Alert
            variant="success"
            role="status"
            aria-live="polite"
            data-testid="reset-password-success"
          >
            <AlertDescription>{{ $t('resetPassword.success') }}</AlertDescription>
          </Alert>
          <Button as-child data-testid="reset-password-signin">
            <NuxtLink :to="localePath('/login')">{{ $t('resetPassword.signIn') }}</NuxtLink>
          </Button>
        </div>

        <!--
          No usable token in the URL. Someone typed /reset-password by hand, or
          their mail client wrapped and truncated the link. Not a crash, not an
          empty page, and not a form that could never succeed — the one action
          that helps from here is minting a new link.
        -->
        <div v-else-if="!hasToken" class="flex flex-col gap-4">
          <Alert variant="destructive" role="alert" data-testid="reset-password-invalid-link">
            <AlertTitle>{{ $t('resetPassword.invalidLinkTitle') }}</AlertTitle>
            <AlertDescription>{{ $t('resetPassword.invalidLink') }}</AlertDescription>
          </Alert>
          <Button as-child data-testid="reset-password-request-new">
            <NuxtLink :to="localePath('/forgot-password')">{{
              $t('resetPassword.requestNew')
            }}</NuxtLink>
          </Button>
          <FieldDescription class="text-center">
            <NuxtLink
              :to="localePath('/login')"
              data-testid="reset-password-back"
              class="hover:text-primary underline underline-offset-4"
            >
              {{ $t('resetPassword.back') }}
            </NuxtLink>
          </FieldDescription>
        </div>

        <form v-else data-testid="reset-password-form" novalidate @submit.prevent="onSubmit">
          <FormFieldset :disabled="submitting">
            <FieldGroup>
              <Field :data-invalid="Boolean(errors.email)">
                <FieldLabel for="reset-password-email">{{ $t('resetPassword.email') }}</FieldLabel>
                <Input
                  id="reset-password-email"
                  v-model="email"
                  type="email"
                  autocomplete="username"
                  :aria-invalid="Boolean(errors.email)"
                  :aria-describedby="errors.email ? 'reset-password-email-error' : undefined"
                  data-testid="reset-password-email"
                  @blur="validateEmail"
                />
                <!--
                Shown, and editable, rather than hidden. Shown because the
                operator has to be able to see WHICH account this link resets —
                a link forwarded to the wrong person is otherwise silent.
                Editable because a mail client that mangles the `?email=`
                parameter must not turn a valid token into a dead end.
              -->
                <FieldDescription>{{ $t('resetPassword.emailHint') }}</FieldDescription>
                <FieldError
                  v-if="errors.email"
                  id="reset-password-email-error"
                  data-testid="reset-password-email-error"
                >
                  {{ errors.email }}
                </FieldError>
              </Field>

              <Field :data-invalid="Boolean(errors.password)">
                <FieldLabel for="reset-password-password">{{
                  $t('resetPassword.password')
                }}</FieldLabel>
                <Input
                  id="reset-password-password"
                  v-model="password"
                  type="password"
                  autocomplete="new-password"
                  :aria-invalid="Boolean(errors.password)"
                  :aria-describedby="errors.password ? 'reset-password-password-error' : undefined"
                  data-testid="reset-password-password"
                  @blur="validatePassword"
                />
                <FieldError
                  v-if="errors.password"
                  id="reset-password-password-error"
                  data-testid="reset-password-password-error"
                >
                  {{ errors.password }}
                </FieldError>
              </Field>

              <Field :data-invalid="Boolean(errors.confirmation)">
                <FieldLabel for="reset-password-confirmation">{{
                  $t('resetPassword.confirmation')
                }}</FieldLabel>
                <Input
                  id="reset-password-confirmation"
                  v-model="confirmation"
                  type="password"
                  autocomplete="new-password"
                  :aria-invalid="Boolean(errors.confirmation)"
                  :aria-describedby="
                    errors.confirmation ? 'reset-password-confirmation-error' : undefined
                  "
                  data-testid="reset-password-confirmation"
                  @blur="validateConfirmation"
                />
                <FieldError
                  v-if="errors.confirmation"
                  id="reset-password-confirmation-error"
                  data-testid="reset-password-confirmation-error"
                >
                  {{ errors.confirmation }}
                </FieldError>
              </Field>

              <!--
              Form-level outcome adjacent to the CTA (DESIGN.md §16 rule 5).

              This is where the API's generic refusal lands.
              `ResetPasswordController::fail()` answers unknown user,
              deactivated user, invalid token and expired token with ONE 422
              keyed on `token` — a field this page renders no control for, on
              purpose, since distinguishing those four cases in the UI would
              be the enumeration oracle the endpoint refuses to be. The
              message can only reach the operator through the mapper's RETURN
              value.
            -->
              <Alert
                v-if="formMessage"
                ref="bannerRef"
                variant="destructive"
                role="alert"
                aria-live="polite"
                tabindex="-1"
                data-testid="reset-password-banner"
              >
                <AlertDescription>{{ formMessage }}</AlertDescription>
              </Alert>

              <Button type="submit" :loading="submitting" data-testid="reset-password-submit">
                {{ $t('resetPassword.submit') }}
              </Button>

              <FieldDescription class="text-center">
                <!--
                Only rendered once a submit has failed: an expired or spent
                link cannot be recovered from this form, and the way out is a
                new one. Offering it before anything has gone wrong would
                invite the user to abandon a link that still works.
              -->
                <NuxtLink
                  v-if="formMessage"
                  :to="localePath('/forgot-password')"
                  data-testid="reset-password-request-new"
                  class="hover:text-primary underline underline-offset-4"
                >
                  {{ $t('resetPassword.requestNew') }}
                </NuxtLink>
                <NuxtLink
                  v-else
                  :to="localePath('/login')"
                  data-testid="reset-password-back"
                  class="hover:text-primary underline underline-offset-4"
                >
                  {{ $t('resetPassword.back') }}
                </NuxtLink>
              </FieldDescription>
            </FieldGroup>
          </FormFieldset>
        </form>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
/**
 * Self-service password recovery, step 2 — `POST /api/auth/reset-password`.
 *
 * THE LINK SHAPE, which is the one thing here that cannot be guessed. The
 * email is minted at `api/app/Jobs/SendPasswordResetLinkJob.php:135` as:
 *
 *   {BACKOFFICE_ORIGIN}/reset-password/{token}?email={urlencoded email}
 *
 * — token in a PATH SEGMENT, email as the only query parameter. A page that
 * read `?token=` would render perfectly and fail on every real link, so the
 * routing is an optional-parameter file (`[[token]].vue`, matching both
 * `/reset-password` and `/reset-password/:token`) rather than `[token].vue`:
 * a truncated link has to reach an explanation, not a 404.
 *
 * Reachable WITHOUT a session — exempted in `app/middleware/02.auth.global.ts`
 * by first path segment, since `endsWith` cannot express a route whose path
 * ends with the token.
 *
 * TOKEN HANDLING. It is never logged, never rendered, and never sent to an
 * analytics sink: `app/utils/analytics-path.ts` collapses
 * `/reset-password/{token}` to `/reset-password/:token` for GA4's page_path
 * and — through `redactUrl` — for Sentry's `request.url` and navigation
 * breadcrumbs. On success it is also cleared out of the address bar, so it
 * does not survive in history or in a screen share.
 */
import { nextTick, ref, useTemplateRef } from 'vue'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { FormFieldset } from '@/components/ui/form-fieldset'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { applyServerFieldErrors, getErrorStatus } from '@/utils/http-error'
import { translateServerCodes } from '@/utils/server-message'

definePageMeta({
  name: 'reset-password',
  // Pre-auth surface — never wrapped in the authenticated admin shell.
  layout: false,
})

const { t, te } = useI18n()
const localePath = useLocalePath()

useHead({
  title: () => t('head.title.resetPassword'),
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})

/**
 * Reads a single route value, tolerating the array form.
 *
 * Vue Router types both params and query as `string | string[]`, and a
 * `.trim()` straight off that union throws during setup — which blanks the
 * page rather than showing the invalid-link state this file is careful to
 * provide.
 */
function firstValue(value: unknown): string {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : ''
  return typeof value === 'string' ? value : ''
}

const route = useRoute()

// Captured ONCE, not read reactively. The success path rewrites the address
// bar to drop the token, and a reactive read would then re-evaluate
// `hasToken` and replace the success state with the invalid-link state.
const token = firstValue(route.params['token']).trim()
const hasToken = token !== ''

const email = ref(firstValue(route.query['email']).trim())
const password = ref('')
const confirmation = ref('')

const submitting = ref(false)
const succeeded = ref(false)
const formMessage = ref<string | null>(null)
const errors = ref<{ email?: string; password?: string; confirmation?: string }>({})
const bannerRef = useTemplateRef<{ $el: HTMLElement } | HTMLElement>('bannerRef')

// Identical to login.vue's, deliberately — see the note there on why domain
// labels exclude the dot.
const EMAIL_PATTERN = /^[^@\s]+@[^@\s.]+(?:\.[^@\s.]+)+$/

// `min:8` in `ResetPasswordRequest`. Mirrored client-side so a typo does not
// spend the single-use token: a locked-out user gets ONE link, and burning it
// on a short password sends them back to the start.
const MINIMUM_PASSWORD_LENGTH = 8

function validateEmail(): boolean {
  const value = email.value.trim()

  if (value === '') {
    errors.value.email = t('resetPassword.emailRequired')
  } else if (!EMAIL_PATTERN.test(value)) {
    errors.value.email = t('resetPassword.emailInvalid')
  } else {
    errors.value.email = undefined
  }

  return errors.value.email === undefined
}

function validatePassword(): boolean {
  if (password.value === '') {
    errors.value.password = t('resetPassword.passwordRequired')
  } else if (password.value.length < MINIMUM_PASSWORD_LENGTH) {
    errors.value.password = t('resetPassword.passwordTooShort')
  } else {
    errors.value.password = undefined
  }

  return errors.value.password === undefined
}

function validateConfirmation(): boolean {
  if (confirmation.value === '') {
    errors.value.confirmation = t('resetPassword.confirmationRequired')
  } else if (confirmation.value !== password.value) {
    errors.value.confirmation = t('resetPassword.confirmMismatch')
  } else {
    errors.value.confirmation = undefined
  }

  return errors.value.confirmation === undefined
}

async function focusBanner(): Promise<void> {
  await nextTick()
  const target = bannerRef.value
  const element = target instanceof HTMLElement ? target : (target?.$el ?? null)
  if (element instanceof HTMLElement) element.focus()
}

/**
 * Drops the spent token out of the address bar.
 *
 * `history.replaceState` rather than a router navigation: a router navigation
 * would re-render this page from a URL with no token, and the success state
 * would be replaced by the invalid-link state the moment it appeared. The
 * component holds no reactive dependency on the URL (see `token` above), so
 * rewriting it here is safe and purely cosmetic.
 */
function stripTokenFromAddressBar(): void {
  if (typeof window === 'undefined' || typeof window.history?.replaceState !== 'function') return

  const url = new URL(window.location.href)
  url.pathname = url.pathname.replace(/\/[^/]+\/?$/, '')
  url.search = ''
  window.history.replaceState(window.history.state, '', url.toString())
}

// `token` is intentionally NOT in this map: the page renders no control for
// it, so `ResetPasswordController::fail()`'s generic message falls through to
// the mapper's return value and reaches the form-level banner.
const SERVER_FIELD_TO_ERROR_KEY = {
  email: 'email',
  password: 'password',
  password_confirmation: 'confirmation',
} as const satisfies Record<string, keyof typeof errors.value>

async function onSubmit(): Promise<void> {
  if (submitting.value) return

  formMessage.value = null

  // All three run before the short-circuit: `&&` would report one problem at
  // a time and make the user submit three times to see three of them.
  const emailOk = validateEmail()
  const passwordOk = validatePassword()
  const confirmationOk = validateConfirmation()

  if (!emailOk || !passwordOk || !confirmationOk) return

  submitting.value = true
  try {
    const apiBase = useRuntimeConfig().public.apiBase
    await $fetch(`${apiBase}/auth/reset-password`, {
      method: 'POST',
      body: {
        token,
        email: email.value.trim(),
        password: password.value,
        password_confirmation: confirmation.value,
      },
    })

    succeeded.value = true
    password.value = ''
    confirmation.value = ''
    stripTokenFromAddressBar()
  } catch (error) {
    if (getErrorStatus(error) === 429) {
      formMessage.value = t('resetPassword.rateLimited')
    } else {
      // Return value CONSUMED — the `token` 422 has nowhere else to go.
      const unmapped = applyServerFieldErrors(error, SERVER_FIELD_TO_ERROR_KEY, (key, message) => {
        errors.value[key] = message
      })

      if (unmapped === null) {
        formMessage.value = t('resetPassword.error')
      } else if (unmapped.length > 0) {
        // Translated, not joined raw. The server sends a CODE
        // (`reset_link_invalid`) precisely so this layer — the only one that
        // knows the operator's locale — can render it in their language.
        // Joining the raw values is what put an English sentence in front of
        // an Italian operator.
        formMessage.value = translateServerCodes(
          { t, te },
          'resetPassword.serverError',
          unmapped
        ).join(' ')
      }
    }
  } finally {
    submitting.value = false
  }

  if (formMessage.value !== null) await focusBanner()
}
</script>
