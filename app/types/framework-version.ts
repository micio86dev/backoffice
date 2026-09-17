/**
 * Framework version shapes (C4).
 *
 * DERIVED from the generated client, not hand-written — `FrameworkVersionResource`
 * needs no narrowing (every field maps cleanly), unlike `avatar-template.ts`'s
 * `config`/`provider`.
 */

import type { paths } from '../../types/api'

export type FrameworkVersion =
  paths['/framework/versions']['get']['responses']['200']['content']['application/json']['data'][number]

export type FrameworkVersionListResponse =
  paths['/framework/versions']['get']['responses']['200']['content']['application/json']
