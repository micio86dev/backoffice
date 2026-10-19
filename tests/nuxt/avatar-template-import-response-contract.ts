/**
 * COMPILE-TIME contract — enforced by `bun run typecheck`, not by Vitest.
 *
 * `importTemplates` answers with the generated 201 body, not a hand-written
 * copy of it: the page reads only `data.length`, and Scramble types `data` as
 * `unknown[]` because the controller maps records without a resource.
 *
 * The write payloads and the platform list are generated too: `config` is the
 * only member re-narrowed (a string-keyed map), see
 * avatar-template-config-contract.ts.
 */
import type { paths } from '../../types/api'
import type {
  PlatformTemplate,
  PlatformTemplateListResponse,
  TemplateCreatePayload,
  TemplateUpdatePayload,
} from '../../app/types/avatar-template'
import type { useAvatarTemplates } from '../../app/composables/useAvatarTemplates'

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false

type Api = ReturnType<typeof useAvatarTemplates>
type Generated =
  paths['/avatar-templates/import']['post']['responses']['201']['content']['application/json']
type StoreBody = paths['/avatar-templates']['post']['requestBody']['content']['application/json']
type UpdateBody = NonNullable<
  paths['/avatar-templates/{id}']['patch']['requestBody']
>['content']['application/json']
type PlatformList =
  paths['/admin/avatar-templates']['get']['responses']['200']['content']['application/json']

export const importResponseIsGenerated: Equal<
  Awaited<ReturnType<Api['importTemplates']>>,
  Generated
> = true
export const createPayloadKeys: Equal<keyof TemplateCreatePayload, keyof StoreBody> = true
export const updatePayloadKeys: Equal<keyof TemplateUpdatePayload, keyof UpdateBody> = true
export const createUsesIt: Equal<Parameters<Api['createTemplate']>[0], TemplateCreatePayload> = true
export const updateUsesIt: Equal<Parameters<Api['updateTemplate']>[1], TemplateUpdatePayload> = true
export const platformListKeys: Equal<keyof PlatformTemplateListResponse, keyof PlatformList> = true
export const platformListData: Equal<PlatformTemplateListResponse['data'], PlatformTemplate[]> =
  true
