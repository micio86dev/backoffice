# BEAI — backoffice

Nuxt 4, SPA (`ssr: false`). The operator console: dashboards, participants, evaluations, avatar templates.

> **Bun only.** Bun is the sole package manager here: install, dev and build.
> Node runs the Vitest/Playwright runners and the Vitest/Playwright runners, nothing else.
> `npm`, `pnpm`, `yarn`, `npx` and `pnpx` are not used — see `AGENTS.md` and the
> pinned version catalogue in `openspec/changes/archive/2026-07-16-project-skeleton-ci/design.md`.
>
> This file used to be the stock Nuxt starter README, listing three other
> package managers ahead of bun. The first thing a new developer opened
> contradicted the project's own toolchain rule, and the CI guard meant to
> catch that looked for only two of the five banned tools and never looked at
> Markdown at all.

## Setup

```bash
bun install
```

## Development

```bash
bun run dev          # http://localhost:3000
```

## Production

```bash
bun run build
bunx serve .output/public -s
```

## Tests

```bash
bunx vitest run      # unit
bunx playwright test # E2E — chromium, webkit, mobile
bunx nuxi typecheck
bunx eslint .
```

> Playwright reuses a server already listening on 3000. If one is running —
> started by hand, or the Docker container — the suite tests THAT, without the
> environment variables Playwright injects, and fails for reasons unrelated to
> the code. Stop it first.

## Real-stack e2e (opt-in)

Every other Playwright suite is fully mocked (`page.route`), so none of them can
see an api whose database schema is behind its code. The `stack` tier is the one
that can: it drives the REAL running stack (backoffice nginx -> api -> Postgres)
with no mocks, and fails on any `/api/` answer with status >= 500.

```bash
task stack:check   # precondition, from the wrapper repo: the stack must be up and ready
BEAI_E2E_ADMIN_EMAIL=... BEAI_E2E_ADMIN_PASSWORD=... bun run test:e2e:stack
```

- Runs on the HOST against `http://localhost:3001`; override with `BEAI_E2E_STACK_URL`.
- Origin guard: the config, the global setup and the spec all refuse any
  `BEAI_E2E_STACK_URL` whose parsed hostname is not exactly `localhost`, `127.0.0.1` or
  `[::1]` (http or https, no embedded credentials). The tier signs in and writes data, so a
  stray export pointing at staging or production must fail before any request. Setting
  `BEAI_E2E_ALLOW_NON_LOCAL=1` lifts the host check; it is for deliberate use only.
- `BEAI_E2E_ADMIN_EMAIL` / `BEAI_E2E_ADMIN_PASSWORD`: the admin of a DEDICATED e2e
  organization in your local dev data (no default credentials are committed). Never reuse
  a production or personal account.
- Never run it with `--trace on` or `trace: 'on'`: the trace records the typed password.
  The config keeps `on-first-retry`, and the stack tier has no retries, so it records none.
- Before any test, a global setup calls `/api/health` then `/api/health/ready` through
  the same origin and aborts with the exact fix (for example
  `docker compose exec api php artisan migrate --force`) when the stack is not ready.
- It WRITES a real row in the local dev database only (a reusable link labelled
  `e2e-stack-<timestamp>` on the first project it finds) and deletes it through the real
  api afterwards; a leftover is recognisable by that prefix. It never creates projects.
- Specs: `reusable-link.stack.spec.ts` (creates and removes a link) and `project-potential.stack.spec.ts` (opens the create-project drawer on the `potential` type and checks MTG and LAT are selectable; read-only, never submits).
- Not part of `bun run test:e2e` or CI: `tests/e2e/stack/**` is ignored by the mocked projects.

## API client

`types/api.ts` is GENERATED from `openapi.json`, which is exported from the api
repository. Never edit either by hand:

```bash
bun run codegen
```

All three repositories must carry a byte-identical `openapi.json`; the wrapper's
Cross-Stack Consistency job fails otherwise.

## More

The full local walkthrough lives in the wrapper's `GUIDE.md`.
