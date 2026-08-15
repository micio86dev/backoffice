<template>
  <div class="flex flex-col gap-8">
    <PageHeader :title="$t('profile.title')" :subtitle="$t('profile.subtitle')" />

    <Alert
      v-if="loadError"
      :variant="loadError === 'not-ready' ? 'default' : 'destructive'"
      :data-state="loadError"
      data-testid="profile-error"
    >
      <AlertTitle>{{ $t(loadErrorTitleKey) }}</AlertTitle>
      <AlertDescription>{{ $t(loadErrorMessageKey) }}</AlertDescription>
    </Alert>

    <template v-else-if="profile">
      <!-- Read-only identity header: avatar, name, email — never editable
           here, only through the account form below. -->
      <div class="flex items-center gap-4">
        <Avatar size="lg" aria-hidden="true">
          <AvatarFallback>{{ initials(profile.name) }}</AvatarFallback>
        </Avatar>
        <div class="flex flex-col gap-1">
          <p class="text-lg font-semibold text-foreground" data-testid="profile-name">
            {{ profile.name }}
          </p>
          <p class="text-sm text-muted-foreground" data-testid="profile-email">
            {{ profile.email }}
          </p>
        </div>
      </div>

      <!-- Role and organization: READ-ONLY. Role changes remain exclusively
           an admin action on user-management — no control here can ever
           change it (admin-backoffice spec, "Profile Page"). -->
      <div class="flex flex-wrap items-center gap-6">
        <div class="flex flex-col gap-1">
          <span class="text-xs text-muted-foreground">{{ $t('profile.role') }}</span>
          <!--
            `role` is typed `unknown` in the generated client — Scramble
            cannot infer the return type of getRoleNames()->first()
            (Spatie), same as UserResource's `role` field. `String(...)`
            coerces it, mirroring UsersPanel.vue's precedent.
          -->
          <AccessLevelBadge
            :role="profile.role ? String(profile.role) : 'viewer'"
            data-testid="profile-role-badge"
          />
        </div>
        <div v-if="profile.organization" class="flex flex-col gap-1">
          <span class="text-xs text-muted-foreground">{{ $t('profile.organization') }}</span>
          <span class="text-sm text-foreground" data-testid="profile-organization">{{
            profile.organization.name
          }}</span>
        </div>
      </div>

      <div class="flex max-w-[65ch] flex-col gap-1">
        <h2 class="text-lg font-semibold text-foreground">{{ $t('profile.details.title') }}</h2>
      </div>
      <Separator />
      <ProfileDetailsForm :profile="profile" @saved="onSaved" />

      <div class="flex max-w-[65ch] flex-col gap-1">
        <h2 class="text-lg font-semibold text-foreground">{{ $t('profile.password.title') }}</h2>
      </div>
      <Separator />
      <ProfilePasswordForm :email="profile.email" @saved="onSaved" />
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * /profile (user-profile-self-service, design D8).
 *
 * PageHeader + Separator-divided stacked sections — NOT Tabs (unlike
 * settings/index.vue's four heterogeneous destinations, two short forms
 * stacked is less machinery for the same job). Loads its own
 * `GET /api/profile` (the editable resource) independently of
 * `useCurrentUser`'s `/auth/me` shell-identity cache — two different
 * contracts, never conflated into one source of truth (design D6).
 */
import { onMounted, ref, computed } from 'vue'
import PageHeader from '@/components/molecules/PageHeader.vue'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import AccessLevelBadge from '@/components/atoms/AccessLevelBadge.vue'
import ProfileDetailsForm from '@/components/organisms/ProfileDetailsForm.vue'
import ProfilePasswordForm from '@/components/organisms/ProfilePasswordForm.vue'
import { useProfile, type ProfileResponse } from '@/composables/useProfile'
import { useCurrentUser } from '@/composables/useCurrentUser'
import { initials } from '@/utils/initials'
import {
  resolveResourceErrorState,
  resourceErrorKey,
  type ResourceErrorState,
} from '@/utils/error-state'

definePageMeta({
  name: 'profile',
})

const { t } = useI18n()

useHead({
  title: () => t('head.title.profile'),
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})

const { fetchProfile } = useProfile()

const profile = ref<ProfileResponse['data'] | null>(null)
const loadError = ref<ResourceErrorState | null>(null)

const loadErrorTitleKey = computed(() => resourceErrorKey(loadError.value ?? 'error', 'title'))
const loadErrorMessageKey = computed(() => resourceErrorKey(loadError.value ?? 'error', 'message'))

async function load(): Promise<void> {
  try {
    const response = await fetchProfile()
    profile.value = response.data
    loadError.value = null
  } catch (error) {
    loadError.value = resolveResourceErrorState(error)
  }
}

async function onSaved(): Promise<void> {
  await load()
  await useCurrentUser().refresh()
}

onMounted(() => {
  void load()
})
</script>
