<template>
  <div class="bg-background flex min-h-screen items-center justify-center px-4">
    <Card class="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{{ $t('login.title') }}</CardTitle>
        <CardDescription>{{ $t('login.subtitle') }}</CardDescription>
      </CardHeader>
      <CardContent>
        <form data-testid="login-form" @submit.prevent="onSubmit">
          <FieldGroup>
            <Field :data-invalid="hasError">
              <FieldLabel for="login-email">{{ $t('login.email') }}</FieldLabel>
              <Input
                id="login-email"
                v-model="email"
                type="email"
                autocomplete="username"
                required
                :aria-invalid="hasError"
                data-testid="login-email"
              />
            </Field>
            <Field :data-invalid="hasError">
              <FieldLabel for="login-password">{{ $t('login.password') }}</FieldLabel>
              <Input
                id="login-password"
                v-model="password"
                type="password"
                autocomplete="current-password"
                required
                :aria-invalid="hasError"
                data-testid="login-password"
              />
              <FieldError v-if="hasError" data-testid="login-error">{{
                $t('login.error')
              }}</FieldError>
            </Field>
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
import { useAuth } from '@/composables/useAuth'

definePageMeta({
  name: 'login',
  // Pre-auth surface — never wrapped in the authenticated admin shell (D11/task 15.3).
  layout: false,
})

useHead({
  // WCAG 2.4.2 (Page Titled): non-empty <title> required.
  title: 'Login',
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})

interface LoginResponse {
  access_token: string
  refresh_token: string
  token_type: string
}

const email = ref('')
const password = ref('')
const submitting = ref(false)
const hasError = ref(false)

async function onSubmit(): Promise<void> {
  hasError.value = false
  submitting.value = true
  try {
    const apiBase = useRuntimeConfig().public.apiBase
    const response = await $fetch<LoginResponse>(`${apiBase}/auth/login`, {
      method: 'POST',
      body: { email: email.value, password: password.value },
    })
    useAuth().setSession(response.access_token)
    await navigateTo('/')
  } catch {
    hasError.value = true
  } finally {
    submitting.value = false
  }
}
</script>
