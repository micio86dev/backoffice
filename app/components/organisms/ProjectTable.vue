<template>
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>{{ $t('projects.table.name') }}</TableHead>
        <TableHead>{{ $t('projects.table.assessmentType') }}</TableHead>
        <TableHead>{{ $t('projects.table.avatarProvider') }}</TableHead>
        <TableHead>{{ $t('projects.table.avatarTemplate') }}</TableHead>
        <TableHead>{{ $t('projects.table.status') }}</TableHead>
        <TableHead>
          <span class="sr-only">{{ $t('projects.table.actions') }}</span>
        </TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableEmpty v-if="projects.length === 0" :colspan="6">
        {{ $t('projects.table.empty') }}
      </TableEmpty>
      <TableRow v-for="project in projects" :key="project.id">
        <TableCell>
          <span class="text-foreground font-medium">{{ project.name }}</span>
          <div class="text-muted-foreground text-xs">{{ project.slug }}</div>
          <div
            v-if="uncoveredCount(project) > 0"
            class="text-destructive text-xs"
            :data-testid="`project-row-uncovered-${project.id}`"
          >
            {{ $t('projects.table.uncoveredCompetencies', { count: uncoveredCount(project) }) }}
          </div>
        </TableCell>
        <TableCell>{{ $t(`projects.assessmentType.${project.assessment_type}`) }}</TableCell>
        <!--
          The avatar SERVICE, and the template that selects it. Together they
          are the one fact deciding how an interview actually runs, and the
          table used to make it readable only by opening each project.

          The provider goes through a translation key rather than being echoed
          raw: `heygen` is a machine value, `HeyGen` is how it is spelled to a
          person. A dash rather than an empty cell when the relation was not
          sent — blank reads as a project that runs on nothing.
        -->
        <TableCell :data-testid="`project-row-provider-${project.id}`">
          <template v-if="project.avatar_template">{{
            $t(`projects.avatarProvider.${project.avatar_template.provider}`)
          }}</template>
          <template v-else>–</template>
        </TableCell>
        <!--
          The template, and underneath it the MODEL the conversation runs on.
          The provider column says HeyGen or Tavus; it cannot say Gemini Flash,
          and that is the line deciding cost and behaviour — two projects on
          the same provider are otherwise indistinguishable here.

          One cell rather than a fourth column: the model is an attribute OF
          the template, not a peer of it, and a table that grows a column per
          attribute stops being scannable long before it stops being correct.
        -->
        <TableCell :data-testid="`project-row-template-${project.id}`">
          {{ project.avatar_template?.name ?? '–' }}
          <div v-if="project.avatar_template?.llm_model" class="text-muted-foreground text-xs">
            {{ project.avatar_template.llm_model }}
          </div>
        </TableCell>
        <TableCell>
          <ProjectStatusBadge :status="project.status" />
        </TableCell>
        <TableCell class="text-right">
          <div class="flex justify-end gap-2">
            <Button
              v-if="canInvite"
              variant="outline"
              size="sm"
              :disabled="!projectAccessibility(project).eligible"
              :data-testid="`project-row-invite-${project.id}`"
              @click="openInvite(project)"
            >
              {{ $t('entryLink.invite') }}
            </Button>
            <Button
              variant="outline"
              size="sm"
              :data-testid="`project-row-edit-${project.id}`"
              @click="$emit('edit', project.id)"
            >
              {{ $t('projects.action.edit') }}
            </Button>
          </div>
          <p
            v-if="canInvite && !projectAccessibility(project).eligible"
            class="text-muted-foreground mt-1 text-xs"
            :data-testid="`project-row-invite-disabled-reason-${project.id}`"
          >
            {{ $t(`entryLink.disabledReason.${projectAccessibility(project).reason}`) }}
          </p>
        </TableCell>
      </TableRow>
    </TableBody>
  </Table>

  <!--
    "Invite candidate" (design D4, surface B): opens a form for a candidate
    not yet in the system. On success the drawer body swaps to
    EntryLinkPanel — the SAME shared organism the participant-detail
    re-issue card renders, so the single-use/expiry disclosure never drifts
    between the two surfaces.

    A right-side drawer, not a centred dialog (feature/form-drawer): this is a
    create form launched from a table row. The two stages deliberately stay in
    ONE surface rather than becoming a drawer plus a separate reveal dialog —
    the minted link has to appear where the form was, or the operator loses
    the thread between what they submitted and the single-use link it
    produced. Only the FOOTER differs between the stages, which is exactly
    what FormDrawer's `footer` slot escape hatch is for.
  -->
  <FormDrawer
    :open="inviteTarget !== null"
    :title="$t('entryLink.invite')"
    @update:open="(open) => !open && closeInvite()"
  >
    <EntryLinkPanel
      v-if="mintedLink"
      :link="mintedLink"
      :locale="locale"
      @generate="onRequestAnotherLink"
    />
    <EntryLinkForm
      v-else-if="inviteTarget"
      :project-id="inviteTarget.id"
      @update:pending="(value) => (minting = value)"
      @success="onInviteSuccess"
    />

    <template #footer>
      <!--
        Once the link exists there is nothing left to submit, and a Save
        control pointing at a form no longer in the DOM would be inert.
      -->
      <Button
        v-if="mintedLink"
        variant="outline"
        data-testid="entry-link-close"
        @click="closeInvite"
      >
        {{ $t('common.action.close') }}
      </Button>
      <FormDrawerActions
        v-else
        form-id="entry-link-form"
        :pending="minting"
        :submit-label="$t('entryLink.form.submit')"
        @cancel="closeInvite"
      />
    </template>
  </FormDrawer>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import FormDrawer from '@/components/organisms/FormDrawer.vue'
import FormDrawerActions from '@/components/organisms/FormDrawerActions.vue'
import ProjectStatusBadge from '@/components/atoms/ProjectStatusBadge.vue'
import EntryLinkForm from '@/components/organisms/EntryLinkForm.vue'
import EntryLinkPanel, { type EntryLink } from '@/components/organisms/EntryLinkPanel.vue'
import { projectAccessibility } from '@/utils/project-accessibility'
import type { Project } from '@/composables/useProjects'

// bars-coverage-visibility Phase 4 (design D1): `coverage` maps role_code ->
// the IDS of that role's competencies with no BARS anchors, resolved by the
// PARENT via `useBarsCoverage()` (this molecule stays presentational and
// does not fetch). A role_code absent from the map — not yet resolved, or
// the fetch failed — renders NOTHING, never a zero.
//
// PROJECT-scoped, not role-scoped — verified fix for a real bug: the count
// MUST be the intersection of THIS project's own `competencies` with the
// role's uncovered-id set, never the role's raw uncovered count. Two
// projects can share a role and hold entirely different competency subsets;
// rendering the role's count unmodified made every project sharing a role
// report the identical number regardless of what it actually selected.
const props = withDefaults(
  defineProps<{
    projects: Project[]
    coverage?: Record<string, number[]>
    // "Invite candidate" (operator-interview-link, design D4): the PARENT
    // resolves the operator's role once (useProfile) and passes the result
    // down — minting starts an assessment, it is not a read, and a viewer
    // must see neither this row action nor the participant-detail
    // "Generate new link" card (admin-backoffice spec, "Viewer sees neither
    // action"). Defaults to false: fail-closed until the parent confirms.
    canInvite?: boolean
    locale?: string
  }>(),
  { coverage: () => ({}), canInvite: false, locale: 'it' }
)

defineEmits<{
  (e: 'edit', id: number): void
}>()

function uncoveredCount(project: Project): number {
  if (!project.role_code) return 0
  const uncoveredIds = props.coverage[project.role_code]
  if (!uncoveredIds || uncoveredIds.length === 0) return 0
  const uncoveredIdSet = new Set(uncoveredIds)
  return project.competencies.filter((competency) => uncoveredIdSet.has(competency.id)).length
}

const inviteTarget = ref<Project | null>(null)
const mintedLink = ref<EntryLink | null>(null)
// Mirrored from EntryLinkForm's own in-flight flag (feature/form-drawer): the
// form still owns the request, the drawer footer holds its submit control.
const minting = ref(false)

function openInvite(project: Project): void {
  inviteTarget.value = project
  mintedLink.value = null
}

function closeInvite(): void {
  inviteTarget.value = null
  mintedLink.value = null
}

function onInviteSuccess(link: EntryLink): void {
  mintedLink.value = link
}

// "Generate new link" from inside the invite dialog: EntryLinkForm's
// submitted candidate_ref/display_name are its own local state, not lifted
// to this parent, so a silent re-mint with "the same values" isn't
// available here without duplicating that state. Returning to the (still
// project-scoped) form lets the operator explicitly re-confirm who they are
// inviting — an honest behaviour, not a shortcut, since no revocation
// semantics exist that would make a silent re-mint meaningfully different
// from a fresh submission anyway.
function onRequestAnotherLink(): void {
  mintedLink.value = null
}
</script>
