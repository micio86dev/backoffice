<template>
  <div class="bg-background flex min-h-screen items-center justify-center px-4">
    <Card class="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{{ $t('forgotPassword.title') }}</CardTitle>
        <CardDescription>{{ $t('forgotPassword.subtitle') }}</CardDescription>
      </CardHeader>
      <CardContent>
        <form data-testid="forgot-password-form" novalidate @submit.prevent="onSubmit">
          <FormFieldset :disabled="submitting">
            <FieldGroup>
              <Field :data-invalid="Boolean(emailError)">
                <FieldLabel for="forgot-password-email">{{
                  $t('forgotPassword.email')
                }}</FieldLabel>
                <Input
                  id="forgot-password-email"
                  v-model="email"
                  type="email"
                  autocomplete="username"
                  :aria-invalid="Boolean(emailError)"
                  :aria-describedby="emailError ? 'forgot-password-email-error' : undefined"
                  data-testid="forgot-password-email"
                  @blur="validateEmail"
                />
                <FieldError
                  v-if="emailError"
                  id="forgot-password-email-error"
                  data-testid="forgot-password-email-error"
                >
                  {{ emailError }}
                </FieldError>
              </Field>

              <!--
              Form-level outcome next to the CTA (DESIGN.md §16 rule 5).

              The SUCCESS case is the one that matters here, and it is
              deliberately uninformative: `POST /api/auth/forgot-password`
              answers 202 with one identical body for a real address, an
              unknown address and a deactivated account
              (`api/app/Http/Controllers/Auth/ForgotPasswordController.php` has
              no branch at all), so that the endpoint cannot be used to
              enumerate accounts.

              This banner must not undo that. It never names the submitted
              address, never says an inbox was reached, and reads identically
              whatever the address was — "if an account exists". A page that
              said "check your inbox" would confirm the account, in the UI,
              for an oracle the API refuses to be.
            -->
              <FormMessage
                v-if="formMessage"
                ref="bannerRef"
                :kind="formMessage.kind"
                :text="formMessage.text"
                test-id="forgot-password-banner"
                focusable
              />

              <Button type="submit" :loading="submitting" data-testid="forgot-password-submit">
                {{ $t('forgotPassword.submit') }}
              </Button>

              <FieldDescription class="text-center">
                <NuxtLink
                  :to="localePath('/login')"
                  data-testid="forgot-password-back"
                  class="hover:text-primary underline underline-offset-4"
                >
                  {{ $t('forgotPassword.back') }}
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
 * Self-service password recovery, step 1 — `POST /api/auth/forgot-password`.
 *
 * Reachable WITHOUT a session: exempted in `app/middleware/02.auth.global.ts`,
 * for the obvious reason that everyone who needs it is locked out. A full page
 * rather than a `FormDrawer` for the same reason `login.vue` is one — there is
 * no list and no launcher to open it from.
 *
 * Two properties this page exists to keep, both tested:
 *   1. The rendered outcome is identical for a real, an unknown and a
 *      deactivated address (see the banner comment in the template). There is
 *      also no client-side "does this address exist" probe anywhere here, and
 *      there must never be one.
 *   2. `throttle:6,1` on the route is low enough that a user who mistypes
 *      twice WILL meet it, so 429 gets copy of its own. A generic failure
 *      there reads as a broken product rather than "wait a minute".
 */
import { nextTick, ref, useTemplateRef } from 'vue'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { FormFieldset } from '@/components/ui/form-fieldset'
import FormMessage, { type FormMessageKind } from '@/components/molecules/FormMessage.vue'
import { applyServerFieldErrors, getErrorStatus } from '@/utils/http-error'

definePageMeta({
  name: 'forgot-password',
  // Pre-auth surface — never wrapped in the authenticated admin shell.
  layout: false,
})

const { t } = useI18n()
const localePath = useLocalePath()

useHead({
  title: () => t('head.title.forgotPassword'),
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})

const email = ref('')
const submitting = ref(false)
const emailError = ref('')
const formMessage = ref<{ kind: FormMessageKind; text: string } | null>(null)
const bannerRef = useTemplateRef<{ $el: HTMLElement } | HTMLElement>('bannerRef')

// Same expression as login.vue's, and deliberately the same: domain labels
// exclude the dot so the engine has exactly one way to split a long domain.
// An ambiguous regex over user input is a denial-of-service surface.
const EMAIL_PATTERN = /^[^@\s]+@[^@\s.]+(?:\.[^@\s.]+)+$/

function validateEmail(): boolean {
  const value = email.value.trim()

  if (value === '') {
    emailError.value = t('forgotPassword.emailRequired')
  } else if (!EMAIL_PATTERN.test(value)) {
    emailError.value = t('forgotPassword.emailInvalid')
  } else {
    emailError.value = ''
  }

  return emailError.value === ''
}

/**
 * Moves focus to the outcome banner.
 *
 * WCAG 2.1 AA: the banner is already announced (`role="alert"`), but an
 * outcome a sighted keyboard user has to go hunting for is not an outcome.
 * `tabindex="-1"` makes it a programmatic focus target without adding a stop
 * to the tab order.
 */
async function focusBanner(): Promise<void> {
  await nextTick()
  const target = bannerRef.value
  const element = target instanceof HTMLElement ? target : (target?.$el ?? null)
  if (element instanceof HTMLElement) element.focus()
}

// `email` is the only field this form renders, so it is the only key that can
// be mapped. Anything else the server names lands in the mapper's RETURN
// value and is rendered at form level below — never dropped.
const SERVER_FIELD_TO_ERROR_KEY = { email: 'email' } as const

async function onSubmit(): Promise<void> {
  if (submitting.value) return

  formMessage.value = null

  if (!validateEmail()) return

  submitting.value = true
  try {
    const apiBase = useRuntimeConfig().public.apiBase
    // No `credentials: 'include'`: this endpoint issues no cookie, and the
    // caller has no session to send.
    await $fetch(`${apiBase}/auth/forgot-password`, {
      method: 'POST',
      body: { email: email.value.trim() },
    })

    // Our OWN copy, not the 202 body. That body is English-only by design
    // ("deliberately not localized per recipient — there is no recipient to
    // localize for"), so rendering it would put untranslated server text into
    // an Italian UI.
    formMessage.value = { kind: 'success', text: t('forgotPassword.sent') }
  } catch (error) {
    if (getErrorStatus(error) === 429) {
      formMessage.value = { kind: 'error', text: t('forgotPassword.rateLimited') }
    } else {
      // The return value is CONSUMED, not discarded. A form that called this
      // for its side effect alone would silently swallow any 422 naming a
      // field it renders no control for — the exact defect
      // `tests/unit/arch/form-contract.spec.ts` (R3) exists to prevent.
      const unmapped = applyServerFieldErrors(error, SERVER_FIELD_TO_ERROR_KEY, (_key, message) => {
        emailError.value = message
      })

      if (unmapped === null) {
        // No `{data:{errors}}` body at all — a 5xx, a network failure.
        formMessage.value = { kind: 'error', text: t('forgotPassword.error') }
      } else if (unmapped.length > 0) {
        // A 422 naming fields this form has no control for. Verbatim, because
        // the server already wrote it in the caller's locale and inventing a
        // paraphrase would hide what actually failed.
        formMessage.value = { kind: 'error', text: unmapped.join(' ') }
      }
      // Otherwise every message landed on its field, which is where DESIGN.md
      // §16 wants it — a banner repeating it would make it ambiguous which of
      // the two is authoritative.
    }
  } finally {
    submitting.value = false
  }

  if (formMessage.value) await focusBanner()
}
</script>
