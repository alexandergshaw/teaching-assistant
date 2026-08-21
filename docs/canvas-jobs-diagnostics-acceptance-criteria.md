# Canvas jobs diagnostics screen (Settings -> Diagnostics)

Request: "give me a debugging screen in the ui that shows this. should be
accessible via the settings" - where "this" is the list of a course's Canvas
content migrations, the state of each one's underlying job, and whether
anything can actually be done about a job that is stuck.

Motivating fact: the instructor has several Canvas import jobs sitting queued
and not progressing, and the Canvas API offers **no DELETE and no dequeue** for
a content migration. The only lever is `POST /api/v1/progress/:id/cancel` on the
migration's own Progress object. A screen that pretends otherwise would be
worse than none, so this screen's job is to tell the truth about each row.

## Verified API facts this is built on (do not re-derive)

- `GET /api/v1/courses/:id/content_migrations` - list. Paginated.
- `GET /api/v1/courses/:id/content_migrations/:id` - show.
- ContentMigration `workflow_state` is exactly one of: `pre_processing`,
  `pre_processed`, `running`, `waiting_for_select`, `completed`, `failed`.
- ContentMigration carries `progress_url` ("The api endpoint for polling the
  current progress") and `migration_issues_count` / `migration_issues_url`.
- There is **no** DELETE endpoint and no documented cancel/abort on the
  content-migration resource itself.
- Progress `workflow_state` is one of: `queued`, `running`, `completed`,
  `failed`. `POST /api/v1/progress/:id/cancel` accepts an optional `message`.
- Source: canvas.instructure.com/doc/api/content_migrations.html and
  /doc/api/progress.html, both read 2026-08-21.

---

## A. Reuse (vetted - read before this doc was written)

| Need | Reuse | Where |
| --- | --- | --- |
| Course id + institution + token from a course URL | `resolveCourse(courseUrl, code)` | `src/lib/canvas-core.ts:210` |
| Paginated GET following the Link header | `fetchAll<T>(url, ctx)` | `src/lib/canvas-modules/fetch-helpers.ts` |
| Form-encoded write returning JSON | `writeJson<T>(url, method, ctx, params)` | `src/lib/canvas-modules/fetch-helpers.ts` |
| Canvas HTTP error wording | `canvasError(status, institution)` | `src/lib/canvas-core.ts:98` |
| Server-action idiom | `requireOwner()` then `{...} \| {error}`, never throws | `src/app/actions/canvas-files-bulk.ts:69`, `src/lib/supabase/auth.ts:29` |
| Actions barrel | add one `export *` line | `src/app/actions/canvas.ts` |
| Lib barrel | add exports | `src/lib/canvas-modules/index.ts` |
| Settings menu (the only place a settings entry is registered - literal JSX children, no registry) | `SettingsMenu` | `src/app/components/TopBar.tsx:296`, link list at `:363-370` |
| Account-page shell + styles | `<TopBar/>` + `main.page` + `section.card` + `h1.title` + `p.subtitle` + repeated `div.section`/`p.sectionTitle`; **no MUI on account pages** | `src/app/account/integrations/page.tsx:112-212`, styles `src/app/account/security/security.module.css` |
| Active institution acronym | `useInstitutionSelection()` | `src/lib/institutions.ts:111` |
| Course chooser | `CoursePicker` (`activeInstitution`, `courseUrl`, `onSelect`) | `src/app/components/CoursePicker.tsx` |
| Effect data-loading idiom | `let active = true` + async IIFE + cleanup, setState only after await | `src/app/account/integrations/page.tsx:46-58` |

---

## B. Lib layer - `src/lib/canvas-modules/migrations.ts` (NEW)

**AC1.** `listContentMigrations(courseUrl, code?): Promise<ContentMigrationRow[]>`
  - `fetchAll` over
    `{baseUrl}/api/v1/courses/{ctx.courseId}/content_migrations?per_page=100`.
  - Maps raw rows through an explicitly typed mapper (this repo's rule -
    typed selects/rows otherwise collapse to `never`; see the
    `mapRecordingFile` pattern). `ContentMigrationRow` =
    `{ id: number; migrationType: string; workflowState: string; createdAt: string | null; finishedAt: string | null; progressUrl: string | null; migrationIssuesCount: number; migrationIssuesUrl: string | null }`.
  - Drops rows with no numeric `id`. Newest first by `createdAt`.

**AC2.** `getMigrationProgress(courseUrl, progressUrl, code?): Promise<MigrationProgress>`
  where `MigrationProgress = { id: number; workflowState: string; completion: number | null; message: string | null }`.
  - **SSRF GUARD, mandatory:** `progressUrl` arrives from Canvas JSON, i.e.
    from a remote server. Before fetching it, assert its origin is byte-equal
    to `new URL(ctx.baseUrl).origin`. On mismatch throw
    `"Refusing to follow a progress URL that is not on this Canvas host."` -
    never fetch it. The bearer token must never be sent to an origin this app
    did not resolve itself.

**AC3.** `cancelMigrationJob(courseUrl, migrationId, code?): Promise<{ progressState: string }>`
  - GET the migration, read `progress_url`.
  - No `progress_url` -> throw a message naming the migration's own
    `workflow_state` and saying there is no job to cancel and no way to delete
    the migration.
  - Progress already `completed`/`failed` -> throw "already finished".
  - Otherwise `POST {progressUrl}/cancel` (same SSRF guard as AC2) via
    `writeJson`, with `message=Cancelled from the diagnostics screen`. Return
    the resulting `workflow_state`.

**AC4.** `classifyMigration(workflowState, progressState): MigrationVerdict` -
  a PURE function, no I/O, exhaustively unit-testable. Returns
  `{ kind, sentence, cancellable }` where `kind` is one of:
  - `"stuck-no-file"` - migration `pre_processing`. Sentence says the file
    bytes never arrived, there is no job to cancel and no way to delete the
    row. `cancellable: false`.
  - `"parked"` - migration `waiting_for_select`. Sentence says nothing has
    been imported yet and abandoning it imports nothing. `cancellable: false`.
  - `"cancellable"` - progress `queued`. `cancellable: true`.
  - `"running"` - progress `running`. Sentence warns a cancel may leave
    partially imported content. `cancellable: true`.
  - `"done"` / `"failed"` - terminal. `cancellable: false`.
  - `"unknown"` - anything else, sentence names the raw states rather than
    inventing a diagnosis.
  Every sentence is defined ONCE here; no wording is duplicated in the UI.

**AC5.** All four exported from `src/lib/canvas-modules/index.ts`.

---

## C. Server actions - `src/app/actions/canvas-migrations.ts` (NEW)

**AC6.** Three actions, each `requireOwner()`-gated, each returning
`{...} | { error: string }` and never throwing:
  - `listContentMigrationsAction(courseUrl, acronym?)` -> `{ migrations: ContentMigrationRow[] }`
  - `listMigrationProgressAction(courseUrl, progressUrls: string[], acronym?)` ->
    `{ progress: Record<string, MigrationProgress | null>; progressErrors: Record<string, string> }`
    - ONE action for the whole page's progress lookups rather than one round
    trip per row. A per-URL failure yields `null` in `progress` for that URL,
    never a whole-page failure, AND its reason under the same key in
    `progressErrors`. The reason is load-bearing, not decoration: a verification
    pass found that collapsing every failure to a bare `null` made the SSRF
    guard's refusal (AC2 - Canvas returned a `progress_url` on a foreign host)
    render identically to an ordinary 404. On a screen whose whole purpose is
    explaining why an import is stuck, an unexplained "could not be loaded" is
    the one answer that helps nobody. AC12 renders the reason.
  - `cancelMigrationJobAction(courseUrl, migrationId, acronym?)` -> `{ progressState: string }`

**AC7.** `"use server"` file exporting ONLY async functions - no type
re-exports (that is a `next build`-only failure in this repo). Types are
imported by the UI from `@/lib/canvas-modules` directly.

**AC8.** Re-exported by adding one line to `src/app/actions/canvas.ts`.
`canvas-files-bulk.ts` is already 521 lines and is NOT the home for this.

---

## D. The screen - `src/app/account/diagnostics/page.tsx` (NEW)

**AC9.** Reachable from Settings: one new
`<Link href="/account/diagnostics" className={styles.menuItem} role="menuitem" onClick={() => setOpen(false)}>Diagnostics</Link>`
added to the link list in `SettingsMenu` (`TopBar.tsx:363-370`), grouped with
the other links (they carry the `border-top` separator). No other TopBar change.

**AC10.** Page structure follows the account convention exactly: `"use client"`,
`<TopBar />`, `<main className={styles.page}>`, one `<section className={styles.card}>`,
`h1.title` = "Diagnostics", `p.subtitle` naming what it is for, then
`div.section` blocks opened by `p.sectionTitle`. Styles come from
`../security/security.module.css`. **No MUI on this page.** No new colour
values - only the existing CSS variables.

**AC11.** First (and for now only) section: "Canvas import jobs".
  - Institution from `useInstitutionSelection()`; course chosen with the
    shared `CoursePicker` (`activeInstitution`, `courseUrl`, `onSelect`).
  - The chosen course URL persists across reloads under its own `ta-`-prefixed
    localStorage key (repo rule), distinct from every existing tab's key so
    this screen never hijacks another tab's selection.
  - A `Refresh` button re-runs the load. Loading is manual + on course change;
    NO background polling loop (this is a diagnostics screen, not a watcher).

**AC12.** For each migration, one row showing: id, `migrationType`,
the migration `workflowState`, the job's Progress state and completion (or
"no progress object"), a relative age from `createdAt`, the
`migrationIssuesCount` when non-zero, and `classifyMigration`'s sentence
verbatim (AC4 - never re-worded here).

**AC13.** A `Cancel job` control renders ONLY where the verdict is
`cancellable: true`. It is a WRITE to the live Canvas course, so:
  - It asks for confirmation first (an inline confirm, the same two-step shape
    the repo already uses for destructive cell actions) - never a one-click
    cancel.
  - On `running`, the confirm text states plainly that partially imported
    content may be left behind.
  - After success it states the new Progress state AND that the migration row
    itself remains in Canvas's list, because Canvas has no delete for it.

**AC14.** Empty and error states are explicit: no course chosen, course with
zero migrations, a load failure (`<p role="alert" className={styles.error}>`),
and no institution configured. None of them render a blank card.

**AC15.** The page states, once, in plain language, that Canvas offers no way
to delete a content migration and that the only lever is cancelling its job -
so the absence of a delete button reads as a fact about Canvas, not a missing
feature.

---

## E. Cross-cutting

**AC16.** No emojis anywhere (`src/lib/no-emojis.test.ts` owns the rule).

**AC17.** `eslint`, `tsc`, and the `next build` compile step all clean. No
setState reached synchronously from an effect (repo lint rule) - use the
`let active = true` + async IIFE + await-then-setState idiom.

**AC18.** No touched file ends over 1000 lines.

**AC19.** Unit tests (vitest is node-env and collects only `src/**/*.test.ts`,
so NO component is rendered - test the lib, not the page):
  - `classifyMigration` over every documented migration state x progress state
    combination, including the unknown fallback.
  - The AC2/AC3 SSRF guard: a `progress_url` on a foreign origin is refused
    and no fetch is issued.
  - `listContentMigrations`' mapper: rows without a numeric id dropped,
    newest-first ordering, absent optional fields mapped to null/0.
  - `cancelMigrationJob`'s three refusal paths (no progress_url, already
    terminal, foreign origin) and its success path's returned state.
  - Each test sabotage-checked: it must actually fail when the behaviour it
    pins is broken.
