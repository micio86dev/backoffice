<template>
  <div class="flex flex-col gap-6">
    <NuxtLink to="/participants" class="text-muted-foreground w-fit text-sm hover:underline">
      {{ $t('participants.detail.backToList') }}
    </NuxtLink>

    <div v-if="participant" class="flex flex-col gap-6">
      <div>
        <h1 class="text-2xl font-semibold text-foreground">{{ participant.display_name }}</h1>
        <p class="text-muted-foreground text-sm">
          {{ participant.candidate_ref }} · {{ participant.role_code }} ·
          {{ $t('participants.detail.language') }}: {{ participant.language }}
        </p>
        <Badge :variant="statusBadgeVariant(participant.status)" class="mt-2">
          {{ $t(`participants.status.${participant.status}`) }}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{{ $t('participants.detail.timeline.title') }}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl class="grid grid-cols-3 gap-4 text-sm">
            <div>
              <dt class="text-muted-foreground">
                {{ $t('participants.detail.timeline.startedAt') }}
              </dt>
              <dd class="text-foreground">
                {{ formatDate(participant.timeline.started_at, locale) }}
              </dd>
            </div>
            <div>
              <dt class="text-muted-foreground">
                {{ $t('participants.detail.timeline.completedAt') }}
              </dt>
              <dd class="text-foreground">
                {{ formatDate(participant.timeline.completed_at, locale) }}
              </dd>
            </div>
            <div>
              <dt class="text-muted-foreground">
                {{ $t('participants.detail.timeline.sessionCount') }}
              </dt>
              <dd class="text-foreground">{{ participant.timeline.session_count }}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{{ $t('participants.detail.resources.title') }}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul class="flex flex-col gap-2 text-sm">
            <li data-testid="resource-transcript" class="flex items-center justify-between">
              <span>{{ $t('participants.detail.resources.transcript') }}</span>
              <Badge :variant="transcriptReady ? 'default' : 'outline'">
                {{
                  transcriptReady
                    ? $t('participants.detail.resources.ready')
                    : $t('participants.detail.resources.notReady')
                }}
              </Badge>
            </li>
            <li data-testid="resource-evaluation" class="flex items-center justify-between">
              <span>{{ $t('participants.detail.resources.evaluation') }}</span>
              <Badge :variant="evaluationReady ? 'default' : 'outline'">
                {{
                  evaluationReady
                    ? $t('participants.detail.resources.ready')
                    : $t('participants.detail.resources.notReady')
                }}
              </Badge>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useParticipants, type ParticipantDetailResponse } from '@/composables/useParticipants'
import { isParticipantResourceReady, statusBadgeVariant } from '@/utils/participant-lifecycle'
import { formatDate } from '@/utils/format'

definePageMeta({
  name: 'participant-detail',
})

useHead({
  title: 'Candidate detail',
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})

const route = useRoute()
const { locale } = useI18n()
const { fetchParticipant } = useParticipants()

const participant = ref<ParticipantDetailResponse['data'] | null>(null)

const transcriptReady = computed(() =>
  participant.value ? isParticipantResourceReady(participant.value.status, 'transcript') : false
)
const evaluationReady = computed(() =>
  participant.value ? isParticipantResourceReady(participant.value.status, 'evaluation') : false
)

onMounted(async () => {
  const id = Array.isArray(route.params['id']) ? route.params['id'][0] : route.params['id']
  const response = await fetchParticipant(id as string)
  participant.value = response.data
})
</script>
