/**
 * The generated catalogue entry schema is the api's documentation of
 * `AvatarProviderCatalogue::entry()`. The key list (checked against the
 * derived `CatalogueEntry` at compile time by the nuxt shape contract) is
 * compared here with the PHP source that really emits them, and the status and
 * error-code unions are checked against it too, so a key or code added or
 * renamed server-side without a regenerated spec fails this file.
 *
 * Needs the sibling `api` checkout (wrapper layout). In a standalone clone it
 * reports that it was skipped; the drift check script does the same.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CATALOGUE_ENTRY_KEYS,
  CATALOGUE_ERROR_CODES,
  CATALOGUE_STATUSES,
  ITALIAN_VALUES,
  PAL_SYNC_STATUSES,
} from '../nuxt/avatar-template-catalogue-shape-contract'
import { EXTERNAL_TTS_ENGINES, PAL_SYNC_CODES } from '../../app/types/avatar-template'

const API_ROOT = process.env.API_ROOT ?? join(__dirname, '../../../api')
const CATALOGUE = join(API_ROOT, 'app/Support/AvatarTemplates/AvatarProviderCatalogue.php')
const present = existsSync(CATALOGUE)

const PAL_SYNC = join(API_ROOT, 'app/Support/AvatarTemplates/TavusPalSync.php')

/** The php source without comment lines, so a docblock never counts as an emission. */
function code(path: string): string {
  return readFileSync(path, 'utf-8')
    .split('\n')
    .filter((line) => !/^\s*(?:\*|\/\*|\/\/)/.test(line))
    .join('\n')
}

const literals = (source: string, pattern: RegExp): string[] =>
  [...new Set([...source.matchAll(pattern)].map((m) => m[1]!))].sort()

describe.skipIf(!present)('catalogue types against the api source', () => {
  const source = present ? readFileSync(CATALOGUE, 'utf-8') : ''
  const catalogue = present ? code(CATALOGUE) : ''

  it('lists exactly the keys entry() emits, plus the Tavus editable flag', () => {
    const body =
      /private static function entry\([\s\S]*?\): array \{\s*return \[([\s\S]*?)\];/.exec(
        source
      )?.[1]
    const emitted = [...(body ?? '').matchAll(/^\s*'([a-z_]+)' =>/gm)].map((m) => m[1])

    expect(emitted.length).toBeGreaterThan(0)
    expect(source).toContain("['editable' => $editable]")
    expect([...emitted, 'editable'].sort()).toEqual([...CATALOGUE_ENTRY_KEYS].sort())
  })

  it('emits exactly the statuses CatalogueStatus lists', () => {
    expect(literals(catalogue, /'status' => '([a-z_]+)'/g)).toEqual([...CATALOGUE_STATUSES].sort())
  })

  it('emits exactly the error codes CatalogueErrorCode lists', () => {
    const emitted = literals(catalogue, /'(provider_[a-z_]+|unsupported_catalogue)'/g).filter(
      (value) => value !== 'provider_error'
    )

    expect(emitted).toEqual([...CATALOGUE_ERROR_CODES].sort())
  })

  it('classifies Italian only as native or multilingual', () => {
    expect(literals(catalogue, /'(native|multilingual)'/g)).toEqual([...ITALIAN_VALUES].sort())
  })
})

describe.skipIf(!existsSync(PAL_SYNC))('persona sync types against the api source', () => {
  const sync = existsSync(PAL_SYNC) ? code(PAL_SYNC) : ''

  it('emits exactly the statuses PalSync lists', () => {
    expect(literals(sync, /'status' => '([a-z_]+)'/g)).toEqual([...PAL_SYNC_STATUSES].sort())
  })

  it('PAL_SYNC_CODES lists exactly the codes TavusPalSync emits', () => {
    expect(literals(sync, /'((?:tavus|pal)_[a-z_]+)'/g)).toEqual([...PAL_SYNC_CODES].sort())
  })
})

// Not an api-source check: the closed sets must COME FROM the generated client,
// so a value the api adds or drops reaches the types without a hand edit.
describe('closed sets are derived from the generated client', () => {
  const types = readFileSync(join(__dirname, '../../app/types/avatar-template.ts'), 'utf-8')

  it.each([
    ['FieldType', /export type FieldType\s*=\s*['"]/],
    ['CatalogueStatus', /export type CatalogueStatus\s*=\s*['"]/],
    ['CatalogueErrorCode', /export type CatalogueErrorCode\s*=\s*(?:\|\s*)?['"]/],
    ['CatalogueEntry.italian', /italian:\s*['"]native['"]/],
    ['PalSync.status', /status:\s*['"]synced['"]/],
    // A literal union, or one derived from the hand-kept PAL_SYNC_CODES const (circular:
    // that const is itself checked against this type).
    ['PalSyncCode', /export type PalSyncCode\s*=\s*(?:\|\s*)?(?:['"]|\(typeof)/],
  ])('has no hand-written union for %s', (_name, handWritten) => {
    expect(types).not.toMatch(handWritten)
  })
})

const FIELD_SPECS = join(API_ROOT, 'app/Support/AvatarTemplates/ProviderFieldSpecs.php')

describe.skipIf(!existsSync(FIELD_SPECS))('external speech engines against the api source', () => {
  it('are the Tavus ttsEngine options other than tavus-auto', () => {
    const options = /options: \['tavus-auto', ([^\]]*)\], palPath: 'layers\/tts\/tts_engine'/.exec(
      code(FIELD_SPECS)
    )?.[1]
    const engines = [...(options ?? '').matchAll(/'([a-z]+)'/g)].map((m) => m[1]!)

    expect(engines.length).toBeGreaterThan(0)
    expect([...EXTERNAL_TTS_ENGINES].sort()).toEqual(engines.sort())
  })
})
