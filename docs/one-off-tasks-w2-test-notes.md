# ONE-OFF-TASKS W2 - TDD test notes and oracles (data layer)

Seat: `loop-test-author` (Opus). Consumer: a fresh `loop-checker`, then
`loop-implementer`. Built from the SHIP-checked scope
`docs/one-off-tasks-scope.md` (read in full, sections 5-6 and 10 are the W2
contract) under **Fork 2 reading (b): Supabase table** and **Fork 1 reading A:
new top-level tab** (both the scope's recommended readings; W1 already shipped
reading A at commit 3b20328e). This file decides WHAT is measured and HOW it
fails. It is not test code and not production code.

W2 builds the **DATA LAYER ONLY** - the pure task-model leaf, the typed row
mapper, the Supabase server-action CRUD, the repository seam, and the migration.
There is no UI in W2 (that is W3). Nothing here renders a component.

Filename note: this file is `docs/one-off-tasks-w2-test-notes.md`, following the
sibling convention `<scope-stem>-w<N>-test-notes.md` (e.g.
`wa-post-lock-w1-test-notes.md`, `grade-infer-merge-w1-test-notes.md`). The
caller's suggested `a-one-off-tasks-w2-test-notes.md` carries an `a-` prefix no
sibling uses; I matched the siblings instead. If the orchestrator wants the
other spelling, rename - nothing references this path yet.

---

## 0. Satisfiability and sabotage, PROVEN before hand-off (seat obligation 1)

A set of red tests is not a spec until something passes it. A throwaway node
reference implementation of every pure function, the mapper, and the repository
seam was written and run in the session scratchpad (`ref.mjs`, NOT committed):

- **24 spec assertions GREEN** - `validateTaskTitle` (6), `groupTasksByCollege`
  (6), `filterTasks` (6), `mapOneOffTask` (6); plus the repository CORPUS
  read-back assertion driven through an in-memory fake of the action path (2).
  Command: `node ref.mjs` -> `ALL REFERENCE TESTS PASSED: 30`.
- **Every named sabotage discriminated** - S1 blank-accept, S2 mapper-returns-raw,
  S3 group-order, S4 corpus-read-back-removed each made the targeted assertion
  throw and GREEN again on restore. No mutant was rebuilt this run; all four
  discriminated as first designed (seat obligation 2: four real kills, none
  inflated).

The spec is therefore satisfiable by an implementation I can write. One shape
decision I made explicit during the reference run and am pinning (section 4,
R-GROUP): a registered institution always gets a group even when empty (to back
the W3 per-college empty-group copy), while Unassigned and orphan-college groups
appear only when non-empty.

---

## 1. Grounded anchors (opened against the tree this session)

| What | file:line | Note |
|---|---|---|
| Title-validation model (trim, reject blank) | `src/lib/institutions.ts:68-77` (`validateNewInstitutionAcronym`) | opened; model adapts it - NO uppercase (titles keep case), a LENGTH cap replaces the duplicate check |
| Institution registry the college field reuses | `src/lib/institutions.ts:92-104` (`useInstitutions`), `:111-133` (`useInstitutionSelection`), `:27-42` (`readInstitutions`) | opened; registry order = `readInstitutions()` order; college must be sourced from here, not a parallel list |
| Mapper idiom (private, NOT exported) | `src/lib/recording-files.ts:261-277` (`mapRecordingFile`) | opened; it is a private fn, so `mapOneOffTask` MUST be `export`ed for a unit test to reach it |
| Exported-and-tested mapper precedent | `src/lib/supabase/app-users.ts:108` (`export function mapAppUserRow`), tested `src/lib/supabase/app-users.test.ts:48` (`FakeDbRow = Database["public"]["Tables"]["app_users"]["Row"]`), `:50` (`makeRow`) | opened; this is the exact pattern the mapper test follows - a fixture typed as the generated Row proves the mapper takes the real row shape (the never-collapse avoidance) |
| Migration lexical gate (auto, repo-wide) | `src/supabase-migrations.structure.test.ts:142-181` | opened; reacts to the new `.sql` with no new test code |
| Migration RLS-coverage gate (auto, repo-wide) | `src/supabase-migrations.rls-coverage.structure.test.ts:107-111` | opened; computes created-tables MINUS rls-enabled-tables and is RED if any created table lacks an RLS enable - auto-covers `one_off_tasks` |
| use-server async-only gate (auto, real-source scan) | `src/lib/use-server-exports.test.ts:333-378` (scan), `:110-156` (detector), `:291-313` (bare type re-export) | opened; reacts to the new `"use server"` action file with no new test code |
| Owner-scoped RLS DDL idiom (4 policies) | `supabase/migrations/20260826000000_create_problems.sql:5-38` | opened; the shape the new migration copies |
| Latest migration -> next number | `supabase/migrations/20261026000000_accessibility_scans.sql` (newest); next = `20261027000000_create_one_off_tasks.sql` | measured `ls supabase/migrations | sort | tail`; scope's number confirmed, no `one_off` migration exists yet |
| Scope W2 contract | `docs/one-off-tasks-scope.md:294-352` (shape + signatures), `:361-405` (data), `:524-540` (W2 wave), `:605-612` (residuals) | opened |

---

## 2. Files W2 will create (each: purpose + the sabotage that must redden it)

NO cross-test-file imports (`no-cross-test-file-imports` memory): each test file
duplicates any fixture/helper it needs; it never imports from another `*.test.ts`
(importing re-runs that file's `describe` blocks). Do NOT import `makeRow` from
`app-users.test.ts` - duplicate it.

Do NOT name any comment-stripping helper with the enumerated name banned by
`src/tools/strip-comments-agreement.structure.test.ts`, and do not mention that
literal in any new test. W2's tests need no comment stripping, so this should not
arise; if one ever does, use `withoutLineComments` with the CRLF-safe UNANCHORED
form (`.split(/\r?\n/)` + `/\/\/.*$/`).

Production files (implementer writes; listed for the test-to-source map):
`src/app/components/one-off-tasks/one-off-task-model.ts`,
`.../oneOffTasksRepository.ts`, `.../useOneOffTasks.ts`,
`src/app/actions/one-off-tasks.ts` (`"use server"`),
`src/lib/supabase/one-off-tasks.ts` (mapper + reads),
`src/lib/supabase/types.ts` (additive: the `one_off_tasks` Row),
`supabase/migrations/20261027000000_create_one_off_tasks.sql`.

New test files:

| Test file | Purpose (one line) | Headline sabotage that MUST turn it red |
|---|---|---|
| `src/app/components/one-off-tasks/one-off-task-model.test.ts` | `validateTaskTitle`, `groupTasksByCollege`, `filterTasks` pure-function pins | drop the blank check in `validateTaskTitle` (accept `"  "`) |
| `src/lib/supabase/one-off-tasks.test.ts` | `mapOneOffTask` raw-row -> task, renames + null handling + never-collapse avoidance | return the raw row unmapped (snake_case keys leak through) |
| `src/app/components/one-off-tasks/oneOffTasksRepository.test.ts` | repository routes reads/writes through the mocked ACTION path; CORPUS read-back | make `list` ignore the store and return `[]` (removes the persisted read-back) |
| `src/app/components/one-off-tasks/one-off-tasks-client-boundary.structure.test.ts` | the component dir imports NO `src/lib/supabase/*` and constructs no supabase client (attended UI reaches the DB only via a server action) | add a direct `import ... from "@/lib/supabase/one-off-tasks"` to the repository |

Existing repo-wide instruments W2 must RUN (no new code; they react to the new
files): `src/supabase-migrations.structure.test.ts`,
`src/supabase-migrations.rls-coverage.structure.test.ts`,
`src/lib/use-server-exports.test.ts`, `src/source-bytes.structure.test.ts`,
`src/file-size-ceiling.structure.test.ts` (unconditional), `src/lib/no-emojis.test.ts`.

---

## 3. The verify table (object under comparison / instrument / direction)

Every row names the object, the instrument that produces each quantity, and the
direction of failure. "Frozen literal" means an expected value written out in the
test, never derived from the thing under test.

### 3.1 Pure model leaf - `one-off-task-model.test.ts`

| # | Object | Instrument | Direction (RED when) |
|---|---|---|---|
| R-VAL-1 | `validateTaskTitle("")` and `validateTaskTitle("   ")` | `.toEqual({ ok: false, reason: "blank" })` (frozen literal) | returns `ok:true`, or a different `reason` |
| R-VAL-2 | `validateTaskTitle("  Grade lab  ")` | `.toEqual({ ok: true, title: "Grade lab" })` (frozen literal - proves trim AND case-preservation) | not trimmed, uppercased, or rejected |
| R-VAL-3 | `validateTaskTitle("x".repeat(201)).ok` and `.reason` | `.toBe(false)` / `.toBe("too-long")` | over-cap accepted, or wrong reason |
| R-VAL-4 | `validateTaskTitle("x".repeat(200)).ok` | `.toBe(true)` (boundary) | the cap is off-by-one (rejects exactly-cap) |
| R-GROUP-1 | `groupTasksByCollege(tasks, ["MCC","MPCC"]).map(g=>g.college)` with tasks in colleges MPCC, null, MCC, OLD | `.toEqual(["MCC","MPCC",null,"OLD"])` (frozen literal) | order not registry-first-then-null-then-orphan |
| R-GROUP-2 | the MCC / Unassigned / OLD group `.tasks` ids | `.toEqual([...])` per group (frozen) | a task lands in the wrong bucket |
| R-GROUP-3 | orphan college OLD (on a task, not in the registry) is still present | its group exists with the task | a de-registered college's task silently vanishes |
| R-GROUP-4 | a registered institution with no tasks | its group present with `tasks: []` | empty registered group dropped (W3 empty-copy has no bucket) |
| R-GROUP-5 | Unassigned when no null-college task exists | NOT present in the output | an empty Unassigned group is emitted |
| R-FILT-1 | `filterTasks(ts,{college:"MCC"})` ids | `.toEqual(["a","b"])` (frozen) | returns other colleges |
| R-FILT-2 | `filterTasks(ts,{college:null})` ids | `.toEqual(["c"])` (frozen - null = Unassigned) | null treated as "all" or matches a named college |
| R-FILT-3 | `filterTasks(ts,{status:"open"})` / `{status:"done"}` ids | frozen per status | status inverted or ignored |
| R-FILT-4 | `filterTasks(ts,{college:"MCC",status:"done"})` ids | `.toEqual(["b"])` (frozen) | the two filters are OR'd, not AND'd |

### 3.2 Typed mapper - `one-off-tasks.test.ts`

The fixture row is typed `const row: Database["public"]["Tables"]["one_off_tasks"]["Row"] = {...}`
(the `app-users.test.ts:48` idiom). That typing is the never-collapse proof: if
the generated `one_off_tasks` Row is missing or wrong, the fixture fails tsc and
the mapper's own `row` param type collapses - caught at the type gate, not at
runtime.

| # | Object | Instrument | Direction (RED when) |
|---|---|---|---|
| R-MAP-1 | `mapOneOffTask(row)` full object | `.toEqual({ id, title, college, done, notes, dueDate, createdAt, updatedAt })` frozen literal - every camelCase key with its expected value | any field dropped or mis-valued |
| R-MAP-2 | `"due_date" in mapped`, `"created_at" in mapped`, `"user_id" in mapped` | each `.toBe(false)` | the raw row is returned unmapped (snake_case / `user_id` leak) |
| R-MAP-3 | `mapOneOffTask({...row, college:null, due_date:null})` | `.college` `null`, `.dueDate` `null` | a null is coerced to `""`/`"null"`/`undefined` |
| R-MAP-4 | `mapOneOffTask({...row, notes:null}).notes` | `.toBe("")` | a missing/null notes becomes `null`/`undefined` instead of `""` |

R-MAP-2 is the primary never-collapse-avoidance guard at runtime: a mapper that
`return row;` (the shape bare typed selects produce when cast through `any`)
leaks snake_case and `user_id`, which R-MAP-1/2 catch. R-MAP-2 must assert BOTH
the absence of snake_case AND the presence of the camelCase equivalent, so a
sabotage that merely renames one key is still caught by R-MAP-1.

### 3.3 Repository seam + CORPUS read-back - `oneOffTasksRepository.test.ts`

The repository is the node-testable seam layer. The hook `useOneOffTasks` is
React state/effects and renders nothing under vitest, so its wiring is NOT
tested here (section 5, argued/owner). Tests MUST mock the action module so no
real DB/`fetch` is reached (`vitest.setup.ts` throws on real fetch -
`tests-are-network-blocked` memory); mock `@/app/actions/one-off-tasks`, never
`fetch`, and never `canvasFetch` (this is not a Canvas path).

Drive the repository through a `vi.mock("@/app/actions/one-off-tasks", ...)`
whose fake implementations are backed by an in-memory array (the course-intel
CORPUS precedent: drive the PRODUCTION path with a fake store, not a direct
import of the internal).

| # | Object | Instrument | Direction (RED when) |
|---|---|---|---|
| R-REPO-1 | `repository.add(input)` | the mocked `addOneOffTaskAction` spy was called once with `input` | the repository builds its own row / calls the wrong action |
| R-REPO-2 | `repository.list()` / `update` / `remove` | each delegates to its matching mocked action spy | a method returns a local value without calling the action |
| R-REPO-3 (CORPUS) | add a task on one repository instance, then `list()` on a FRESH instance over the SAME fake store, then `groupTasksByCollege` the result | the prior-load task is listed AND appears under its college group (frozen title) | see removal test below |

### 3.4 Client/DB boundary - `one-off-tasks-client-boundary.structure.test.ts`

| # | Object | Instrument | Direction (RED when) |
|---|---|---|---|
| R-BOUND-1 | every `.ts`/`.tsx` under `src/app/components/one-off-tasks/` (read as text, import lines only) | NO import whose specifier matches `@/lib/supabase/` or `@supabase/supabase-js`, and no `createClient(`/`createBrowserClient(` call | the repository (or any component-dir file) imports the supabase lib or builds a client - i.e. reaches the DB without going through the server action |
| R-BOUND-2 | canary: the scan actually read > 0 files and the matcher fires on a known-bad fixture string | `expect(files.length).toBeGreaterThan(0)` and a positive hit on an in-test fixture line | the scan passes by reading nothing / a dead matcher (the emoji-scan false-clean class) |

R-BOUND-1 scans only the W2 component directory, so it does not constrain the
server-side `src/lib/supabase/one-off-tasks.ts` or the action file (those are
SUPPOSED to touch supabase). R-BOUND-2 is mandatory: without the canary a broken
walk reports clean, which is this repo's single most-repeated false-green.

---

## 4. Frozen oracles, stated as CONSTRUCTIONS

Each oracle is a literal written into the test, built as follows and provably
constructible from the tree (the reference run built all four):

- **O-VAL**: `{ ok: false, reason: "blank" }`, `{ ok: true, title: "Grade lab" }`,
  `"too-long"`. Construction: by hand from the rule (trim; empty -> blank;
  len>200 -> too-long; else ok+trimmed). The cap `200` is the scope's value
  (`:305`, "1..200"); pin the constant via the boundary pair R-VAL-3/R-VAL-4 so a
  changed cap is caught, not the literal `200` in source (source-text over-pin is
  a known defect - `source-text-tests-overspecify` memory).
- **O-GROUP**: from input tasks in colleges `[MPCC, null, MCC, OLD]` and registry
  `[MCC, MPCC]`, the group-college order is `["MCC","MPCC",null,"OLD"]`.
  Construction: registry order first (MCC, MPCC), then Unassigned (null) because a
  null-college task exists, then orphan OLD in first-appearance order. This is a
  hand-built literal, NOT `groupTasksByCollege(...).map(...)` compared to itself
  (the tautology class - `refactor-disarms-tests` memory).
- **O-FILT**: `["a","b"]` (college MCC), `["c"]` (college null), per-status and
  the AND case `["b"]`. Construction: by hand from a fixed 3-task fixture.
- **O-MAP**: the full task object literal for a known row, with every snake_case
  source key renamed and `user_id` absent. Construction: write the row literal and
  the task literal independently; do NOT derive one from the other.

---

## 5. Executable HERE vs ARGUED-only (stated plainly)

**Executable under vitest (node-env, network-blocked) in W2:**

- All of section 3.1 (pure functions), 3.2 (mapper with a typed fixture), 3.3
  (repository wiring + CORPUS read-back via a mocked action store), 3.4 (import
  boundary source scan).
- The repo-wide auto-instruments in section 6.

**Argued only - NOT asserted as verified here (route to residuals):**

- **The hook `useOneOffTasks` state wiring** (optimistic add/toggle/delete,
  loading/error). It is React state/effects; vitest renders no component
  (`this-repo.md` section 2 / memory). W3's source-text pins and an owner browser
  walk cover it. Do NOT write a render/`renderHook` test - it is a fake green.
- **That the server action actually reads/writes Supabase, and RLS scopes rows to
  the owner.** No `.env`, no live DB, network blocked. The action's EXPORT SHAPE
  is checkable (section 6, use-server scan); its DB BEHAVIOUR is owner-only (R3).
- **Durability / cross-device persistence** (the true CORPUS advantage). The
  repository test proves WIRING and in-memory read-back through the production
  path, NOT that data survives a real reload, a sign-out, or a second device.
  That dimension is unprovable here and is an owner-only residual (R5-DUR below),
  parallel to scope R5. Say this in the test file header so no reader mistakes
  the mock for a durability proof.

---

## 6. Structure / repo-wide gates W2 must run (exact paths, auto-trigger, sabotage)

Run via `npm run test:paths <p1> <p2> ...` (never a raw multi-path `vitest`,
which silently drops unmatched args - `test-paths-wrapper` memory). Full W2 gate:

```
npm run test:paths \
  src/app/components/one-off-tasks/one-off-task-model.test.ts \
  src/lib/supabase/one-off-tasks.test.ts \
  src/app/components/one-off-tasks/oneOffTasksRepository.test.ts \
  src/app/components/one-off-tasks/one-off-tasks-client-boundary.structure.test.ts \
  src/supabase-migrations.structure.test.ts \
  src/supabase-migrations.rls-coverage.structure.test.ts \
  src/lib/use-server-exports.test.ts \
  src/source-bytes.structure.test.ts \
  src/file-size-ceiling.structure.test.ts \
  src/lib/no-emojis.test.ts
```

then `npx tsc --noEmit`, `npm run lint`, build compile-line check.

| Gate | file:line | What it catches in W2 | Sabotage that reddens it | Discriminates? |
|---|---|---|---|---|
| Migration lexical | `src/supabase-migrations.structure.test.ts:147-180` | an unterminated / un-doubled apostrophe in the new `.sql` | put `user's` (single apostrophe) in a comment-free string literal in the migration | YES |
| Migration RLS coverage | `src/supabase-migrations.rls-coverage.structure.test.ts:107-111` | the new `one_off_tasks` table created WITHOUT `enable row level security` | delete the `alter table public.one_off_tasks enable row level security;` line | YES - RED with no mutation needed if the enable is simply absent; GREEN once present |
| use-server async-only | `src/lib/use-server-exports.test.ts:358-377` | a non-async export in `src/app/actions/one-off-tasks.ts` | add `export const TITLE_MAX = 200;` to the action file | YES |
| source-bytes text | `src/source-bytes.structure.test.ts` | a materialized `\uXXXX` escape or NUL written into any new file | write a literal control char via the editor into a new file | YES |
| file-size ceiling | `src/file-size-ceiling.structure.test.ts` | any new file over the 1000-line ceiling | n/a (all W2 files est. <= ~120 lines) | argued (no file approaches the ceiling) |
| no-emojis | `src/lib/no-emojis.test.ts` | an emoji in any new src/ or docs/ file (incl. this notes doc) | add an emoji to a new file | YES |

Note (do NOT test, but tell the implementer): a bare `export type { X } from "..."`
with a `from` clause is deliberately NOT flagged by the use-server scan
(`use-server-exports.test.ts:315-329`); only `next build` catches a genuinely
dangling one. Keep the action file's exports to async functions and (if needed)
`export type`/`export interface` DECLARATIONS - no re-exports.

Additional tsc-only trap to grep the W2 diff for before the type gate: the dotAll
`/s` (or `/gs`) regex flag passes vitest and FAILS tsc with TS1501
(`regex-s-flag-fails-tsc` memory). None of the W2 logic needs it.

---

## 7. Named sabotage per requirement (RED expected, GREEN on restore)

Each was run in the reference implementation unless marked argued. A sabotage RED
in both directions or GREEN in both discriminates nothing; all below discriminate.

| Requirement | Sabotage mutation | Expected |
|---|---|---|
| R-VAL-1/2 | `validateTaskTitle` drops the blank check (`return {ok:true, title: raw.trim()}`) | RED R-VAL-1; GREEN on restore. Discriminates. |
| R-VAL-3/4 | change the cap to `>= 200` (reject exactly-cap) | RED R-VAL-4; discriminates the boundary. |
| R-GROUP-1 | emit Unassigned/orphan before registered, or sort colleges alphabetically | RED R-GROUP-1. Discriminates. |
| R-GROUP-3 | drop tasks whose college is not in the registry | RED R-GROUP-3. Discriminates the de-registration correctness fact. |
| R-GROUP-4 | include registered institutions only when they have tasks | RED R-GROUP-4. Discriminates. |
| R-FILT-2 | treat `college:null` as "all" | RED R-FILT-2. Discriminates null-vs-all. |
| R-FILT-4 | OR the college and status filters | RED R-FILT-4. Discriminates AND-vs-OR. |
| R-MAP-1/2 | mapper `return row;` (raw passthrough) | RED R-MAP-1 and R-MAP-2. Discriminates. |
| R-MAP-3/4 | `notes: row.notes` (no `?? ""`), `dueDate: row.created_at` (wrong source) | RED R-MAP-4 / R-MAP-1. Discriminates. |
| R-REPO-1/2 | repository method returns a local value without calling the action spy | RED the matching R-REPO row. Discriminates wiring. |
| R-REPO-3 (CORPUS removal) | **remove the persisted read-back**: `list` ignores the store and returns `[]` | RED R-REPO-3 (prior-load task not listed). GREEN on restore. This is the leverage removal test - the removal is the CORPUS advantage (read-back), not a generic throw. Discriminates. |
| R-BOUND-1 | add `import { mapOneOffTask } from "@/lib/supabase/one-off-tasks"` to the repository | RED R-BOUND-1. Discriminates the DB-via-action-only boundary. |

Implementer obligation (seat practice): after writing each test, apply its
sabotage to the real production unit, watch the test go RED, restore, watch it go
GREEN. A test never watched fail on its real mutation is not evidence. Restore by
cp-backup, NOT `git checkout --` (that reverts uncommitted chunk work -
`sabotage-restore-needs-a-copy` memory).

---

## 8. AC mapping (machine AC = source-text/structure/pure-function pins only)

| AC (scope section 2) | W2 machine-checkable pin | Residual (owner + instrument + step) |
|---|---|---|
| AC2 - task shape: title (required), college assoc, done, optional notes + due date, id | R-VAL-* (title required/capped), R-MAP-1 (full shape incl. id/college/done/notes/dueDate), R-GROUP/R-FILT (college is a first-class field) | the shape as RENDERED on a row -> R4 (owner browser walk, W3) |
| AC5 - persistence (tasks survive a reload; recommended: survive sign-out + cross-device) | R-REPO-3 proves WIRING + in-memory read-back through the production path | **durable/cross-device survival** -> R5-DUR + scope R3 (owner: live DB on Vercel + GH Action; step: owner adds/reloads/signs-out and across a second device after push) |
| AC2 - college reuses the institution registry, not a parallel list | R-GROUP uses the passed `institutions` list (registry order); college sourced from `useInstitutions()` in W3 | that W3 actually feeds `useInstitutions()` in -> W3 source-text pin + R4 |

AC1 (tab reachable) was W1. AC3 (CRUD clicks), AC4 (group/filter UI), AC6
(empty/loading/error copy) are W3 - not W2.

---

## 9. Residual register (owner / instrument / step - missing any one is a deletion)

| # | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| R3 (scope) | RLS enforcement + live query + migration application UNVERIFIABLE here | repo owner | real DB on Vercel + GH Action run | after push to main, owner confirms the Action applied `20261027000000_create_one_off_tasks.sql` and that RLS scopes rows to `auth.uid()` |
| R4 (scope) | the data actually surfaces/paints; row shows title+college+done | repo owner | browser walk | W3; owner opens `?tab=one-off-tasks`, adds/completes/filters |
| R5-DUR | durable/cross-device CORPUS survival (survives reload, sign-out, 2nd device) is NOT provable here; the repo test proves wiring only | repo owner | real DB + two devices | owner adds a task, signs out/in and opens a second device after push; parallels scope R5 and `leverage.md:180-183` (per-device/durability advantages have no buildable removal test here) |
| R-HOOK | `useOneOffTasks` optimistic state (add/toggle/delete rollback, loading/error) is argued, not vitest-tested (no render) | test seat / owner | W3 source-text pins + owner browser walk | W3 |

All four must be written into `docs/BACKLOG.md` by the orchestrator at disposal,
or they do not exist (`DEV_LOOP.md` step 0). R3/R4/R5 already exist in the scope
residual table (`:605-612`); R5-DUR and R-HOOK are the W2-specific additions.

---

## 10. What I could not determine from the tree

- **Whether Fork 2 is finally (b) Supabase or (a) localStorage.** These notes are
  written for (b), the scope's recommendation and the caller's instruction. If the
  owner reverses to (a): drop `one-off-tasks.test.ts` (mapper), the use-server and
  both migration gates, and the action-mock in the repository test; the repository
  test then drives a `ta-one-off-tasks` localStorage fake, and R-REPO-3's CORPUS
  removal still applies (remove the read-back) but R5-DUR hardens to "no durable
  removal test buildable" (scope R5). One module and three test files change.
- **The generated `one_off_tasks` Row field spelling in `src/lib/supabase/types.ts`.**
  The table does not exist yet (confirmed: no `one_off` migration, no Row in
  types.ts). The mapper test's typed fixture depends on the implementer adding the
  Row additively with the migration's columns. If the generated column names
  differ from the migration (section 6 DDL in the scope), the mapper fixture's
  type assertion fails tsc - which is the intended catch, not a gap.
- **Exact est. line counts of the production files** are the scope's (`:327-334`),
  not re-measured here (files do not exist yet); all are well under the ceiling.
