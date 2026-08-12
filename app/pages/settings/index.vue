<template>
  <div class="flex flex-col gap-6">
    <h1 class="text-2xl font-semibold text-foreground">{{ $t('settings.title') }}</h1>

    <Alert
      v-if="loadError"
      :variant="loadError === 'not-ready' ? 'default' : 'destructive'"
      :data-state="loadError"
      data-testid="settings-error"
    >
      <AlertTitle>{{ $t(loadErrorTitleKey) }}</AlertTitle>
      <AlertDescription>{{ $t(loadErrorMessageKey) }}</AlertDescription>
    </Alert>

    <Tabs v-else default-value="organization">
      <TabsList>
        <TabsTrigger value="organization">{{ $t('settings.tabs.organization') }}</TabsTrigger>
        <TabsTrigger value="apiKeys">{{ $t('settings.tabs.apiKeys') }}</TabsTrigger>
        <TabsTrigger value="webhooks">{{ $t('settings.tabs.webhooks') }}</TabsTrigger>
        <TabsTrigger value="users">{{ $t('settings.tabs.users') }}</TabsTrigger>
      </TabsList>

      <!--
        Each panel is a defineAsyncComponent (D10 code-split) AND a
        reka-ui TabsContent, which only mounts the active panel by default
        (no force-mount) — only the panel the operator is looking at is
        ever in the DOM.
      -->
      <TabsContent value="organization">
        <OrganizationProfileForm
          v-if="organization"
          :organization="organization"
          @saved="onSaved"
        />
      </TabsContent>
      <TabsContent value="apiKeys">
        <ApiKeysPanel />
      </TabsContent>
      <TabsContent value="webhooks">
        <WebhookDefaultsForm v-if="organization" :organization="organization" @saved="onSaved" />
      </TabsContent>
      <TabsContent value="users">
        <UsersPanel />
      </TabsContent>
    </Tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, defineAsyncComponent } from 'vue'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useOrganization, type OrganizationResponse } from '@/composables/useOrganization'
import {
  resolveResourceErrorState,
  resourceErrorKey,
  type ResourceErrorState,
} from '@/utils/error-state'

const OrganizationProfileForm = defineAsyncComponent(
  () => import('@/components/organisms/OrganizationProfileForm.vue')
)
const WebhookDefaultsForm = defineAsyncComponent(
  () => import('@/components/organisms/WebhookDefaultsForm.vue')
)
const ApiKeysPanel = defineAsyncComponent(() => import('@/components/organisms/ApiKeysPanel.vue'))
const UsersPanel = defineAsyncComponent(() => import('@/components/organisms/UsersPanel.vue'))

definePageMeta({
  name: 'settings',
})

const { t } = useI18n()

useHead({
  title: () => t('head.title.settings'),
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})

const { fetchOrganization } = useOrganization()

const organization = ref<OrganizationResponse['data'] | null>(null)
const loadError = ref<ResourceErrorState | null>(null)

const loadErrorTitleKey = computed(() => resourceErrorKey(loadError.value ?? 'error', 'title'))
const loadErrorMessageKey = computed(() => resourceErrorKey(loadError.value ?? 'error', 'message'))

async function load(): Promise<void> {
  try {
    const response = await fetchOrganization()
    organization.value = response.data
    loadError.value = null
  } catch (error) {
    loadError.value = resolveResourceErrorState(error)
  }
}

async function onSaved(): Promise<void> {
  await load()
}

onMounted(() => {
  void load()
})
</script>
