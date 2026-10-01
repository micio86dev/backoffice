<template>
  <section
    aria-labelledby="reusable-links-title"
    data-testid="reusable-links-panel"
    class="flex flex-col gap-4"
  >
    <!--
      reusable-interview-links (DESIGN.md 16.18). The comments live INSIDE the
      root element on purpose: one beside it would make the component a
      fragment and drop the attributes a parent passes down.

      A LIST, not an editor. The api describes a link by its label, prefix and
      usage and never returns the URL again (it stores a hash, never the
      secret), so there is nothing here to copy and no field that could show
      one: the prefix is the only trace of the token the operator ever sees.
    -->
    <div>
      <h3 id="reusable-links-title" class="text-base font-semibold">
        {{ $t('reusableLinks.title') }}
      </h3>
      <p class="text-muted-foreground text-sm">{{ $t('reusableLinks.description') }}</p>
    </div>

    <FormMessage
      v-if="message"
      :kind="message.kind"
      :text="message.text"
      test-id="reusable-links-banner"
    />

    <!--
      Three states that are not the list, in the order they must be ruled out:
      the first answer has not arrived (so "no links" would be a guess), the
      load failed (so "no links" would be a lie), or there really are none.
    -->
    <p
      v-if="!loaded"
      role="status"
      class="text-muted-foreground text-sm"
      data-testid="reusable-links-loading"
    >
      {{ $t('reusableLinks.loading') }}
    </p>

    <div v-else-if="loadFailure" class="flex flex-col gap-2">
      <FormMessage
        :kind="loadFailure.kind"
        :text="loadFailure.text"
        test-id="reusable-links-error"
      />
      <div v-if="loadFailure.retryable">
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="reusable-links-retry"
          @click="load"
        >
          {{ $t('reusableLinks.retry') }}
        </Button>
      </div>
    </div>

    <p
      v-else-if="links.length === 0"
      class="text-muted-foreground text-sm"
      data-testid="reusable-links-empty"
    >
      {{ $t('reusableLinks.empty') }}
    </p>

    <ul
      v-else
      class="divide-border border-border divide-y overflow-hidden rounded-lg border"
      data-testid="reusable-links-list"
    >
      <li
        v-for="link in links"
        :key="link.id"
        class="flex items-start justify-between gap-4 px-3 py-3"
        :data-testid="`reusable-link-row-${link.id}`"
      >
        <div class="flex min-w-0 flex-col gap-1">
          <div class="flex flex-wrap items-center gap-2">
            <!-- Escaped text: a label is operator input and may look like markup. -->
            <span class="text-foreground font-medium break-words">{{ displayName(link) }}</span>
            <ReusableLinkStatusBadge :status="link.status" />
          </div>
          <p class="text-muted-foreground font-mono text-xs">
            <code>{{ link.token_prefix }}</code
            ><span aria-hidden="true">…</span>
          </p>
          <p class="text-muted-foreground text-xs">{{ createdLine(link) }}</p>
          <p class="text-muted-foreground text-xs">{{ usageLine(link) }}</p>
        </div>
        <!--
          Only an ACTIVE row offers it. A disabled link cannot be re-enabled, so a
          control on it would be one whose only outcome is nothing; the badge in
          the same row already says why it is absent. The accessible name carries
          the link's name, because a column of identical "Disable link" buttons is
          indistinguishable in a screen reader's controls list, and it still
          contains the visible text (WCAG 2.5.3).
        -->
        <Button
          v-if="link.status === 'active'"
          type="button"
          variant="outline"
          size="sm"
          :disabled="disablingId === link.id"
          :aria-label="$t('reusableLinks.disable.actionFor', { name: displayName(link) })"
          :data-testid="`reusable-link-disable-${link.id}`"
          @click="disableTarget = link"
        >
          {{ $t('reusableLinks.disable.action') }}
        </Button>
      </li>
    </ul>

    <!--
      Disabling is final and immediate, so it asks first (the destructive-action
      pattern): nothing is sent until the operator confirms, and Cancel, Escape
      and the backdrop all leave the link Active.
    -->
    <ConfirmDialog
      :open="disableTarget !== null"
      variant="destructive"
      :title="$t('reusableLinks.disable.confirmTitle')"
      :description="$t('reusableLinks.disable.confirmDescription')"
      :confirm-label="$t('reusableLinks.disable.confirm')"
      @confirm="onDisableConfirmed"
      @cancel="disableTarget = null"
    />
  </section>
</template>

<script setup lang="ts">
/**
 * A project's reusable links, and the one place one is disabled.
 *
 * Self-fetching, like `ProjectQuestionsPanel`: it owns the network for the
 * saved-project drawer it sits in. It is rendered only for a SAVED project and
 * only for someone who may create participants (the page holds that gate: a
 * viewer neither sees this panel nor causes the list request).
 *
 * The list is never patched locally. After a disable the panel asks the api
 * again, because the api is the authority on what a link now is: the response is
 * a 204 whether this call disabled it or it already was, so "just disabled" and
 * "already disabled" are the same success and there is nothing to reconcile.
 */
import { ref, onMounted } from 'vue'
import { Button } from '@/components/ui/button'
import ConfirmDialog from '@/components/molecules/ConfirmDialog.vue'
import FormMessage, { type FormMessageKind } from '@/components/molecules/FormMessage.vue'
import ReusableLinkStatusBadge from '@/components/atoms/ReusableLinkStatusBadge.vue'
import { useReusableLinks, type ReusableLink } from '@/composables/useReusableLinks'
import { actionErrorMessage } from '@/utils/action-error-message'
import { resolveResourceErrorState, resourceErrorKey } from '@/utils/error-state'
import { formatDate } from '@/utils/format'

const props = defineProps<{
  projectId: number
  /** The operator's UI locale, for dates: not the project's language. */
  locale: string
}>()

const { listReusableLinks, disableReusableLink } = useReusableLinks()
const { t } = useI18n()

const links = ref<ReusableLink[]>([])
/** False until the FIRST answer (or failure) arrives: "no links" is not yet known. */
const loaded = ref(false)
const loadFailure = ref<{ kind: FormMessageKind; text: string; retryable: boolean } | null>(null)
/** The outcome of the last disable attempt, when it failed. */
const message = ref<{ kind: FormMessageKind; text: string } | null>(null)
/** The link the open confirmation is about; null when no confirmation is open. */
const disableTarget = ref<ReusableLink | null>(null)
/** The link whose DELETE is in flight, so it cannot be submitted twice. */
const disablingId = ref<string | null>(null)

function displayName(link: ReusableLink): string {
  return link.label !== null && link.label !== '' ? link.label : t('reusableLinks.unnamed')
}

function createdLine(link: ReusableLink): string {
  const date = formatDate(link.created_at, props.locale)

  // The creator is nullable (an account can be removed later); an absent name is
  // left out of the sentence rather than printed as a blank.
  return link.created_by === null
    ? t('reusableLinks.createdOn', { date })
    : t('reusableLinks.createdBy', { date, name: link.created_by.name })
}

function usageLine(link: ReusableLink): string {
  if (link.last_used_at === null) return t('reusableLinks.neverUsed')

  return t(
    'reusableLinks.used',
    { count: link.uses_count, date: formatDate(link.last_used_at, props.locale) },
    link.uses_count
  )
}

async function load(): Promise<void> {
  try {
    const response = await listReusableLinks(props.projectId)

    links.value = response.data
    loadFailure.value = null
  } catch (error) {
    // Through the shared mapper, like every other remote read here: a 403 is
    // permanent and a retry would fail identically, so it names itself and
    // offers none; a 409 or an unclassified failure may well clear.
    const state = resolveResourceErrorState(error)

    loadFailure.value = {
      kind: state === 'not-ready' ? 'waiting' : 'error',
      text: t(state === 'error' ? 'reusableLinks.loadError' : resourceErrorKey(state, 'message')),
      retryable: state === 'error' || state === 'not-ready',
    }
  } finally {
    loaded.value = true
  }
}

async function onDisableConfirmed(): Promise<void> {
  const target = disableTarget.value

  if (target === null) return

  disableTarget.value = null
  disablingId.value = target.id
  message.value = null

  try {
    await disableReusableLink(props.projectId, target.id)
    await load()
  } catch (error) {
    message.value = actionErrorMessage(error, t, 'reusableLinks.disable.error')
  } finally {
    disablingId.value = null
  }
}

onMounted(load)
</script>
