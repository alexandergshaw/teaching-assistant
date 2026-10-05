# One-Off Tasks - scope (AC + architecture + data + UX + light security/SRE + wave plan)

Recon + plan only. No code in this artifact. Every quantity names the command
that produced it; every citation was opened. Sibling visual-overhaul builds
(repo-grades, grading-chat) are disjoint - this feature touches none of their
files.

Owner request, verbatim: "i need a new tab 'One-Off Tasks' as a sibling of
Courses, Term Setup, and Daily/Weekly, and on this new tab i need a simple task
management tool to track tasks across different colleges."

---

## 0. TWO FORKS THE OWNER MUST SETTLE (recommended reading picked; proceeding on it)

Per the architecture seat's duty to refuse a ruling the tree disproves, both
forks below are flagged with the measured conflict, a recommended reading, and a
one-line owner-confirmable. The rest of this scope is written against the
recommended readings. These are the only two decisions that change the SHAPE; a
reversal on either changes exactly one wave, not the whole plan (see the storage
seam in section 5 and the registration precedent in section 4).

### FORK 1 - "sibling of Courses, Term Setup, Daily/Weekly": a NEW TOP-LEVEL TAB, or a NEW CHIP in the Courses rail?

**The orchestrator brief asserts "these are TOP-LEVEL activeTab tabs". The tree
disproves that, measured:**

- The top-level strip is EXACTLY four tabs:
  `TAB_ORDER = ["courses", "manual", "files", "course-intel"]`
  (`src/app/components/tabs/tab-sections.ts:36`), labelled Courses / Tools /
  Library / Course Intel (`tab-sections.ts:38-43`).
- "Term Setup" and "Daily / Weekly" are NOT top-level tabs. They are the two
  **Tasks chips in the Courses tab's rail**:
  `TASKS_VIEW_LABELS = { term: "Term Setup", recurring: "Daily / Weekly" }`
  (`tab-sections.ts:119-122`), rendered as rail items under
  `coursesSection === "tasks"` (`COURSES_RAIL_ITEMS`, `tab-rails.ts:76-86`;
  rendered at `page.tsx:497-502,532`).
- So what the owner sees as three peers - "Courses", "Term Setup",
  "Daily/Weekly" - is actually the **three-item Courses rail**
  (`COURSES_RAIL_ITEMS.map(...)` -> `["courses", "tasks:term", "tasks:recurring"]`,
  pinned `tab-rails.test.ts:192`), one level below the top strip.

This means the owner's phrase is genuinely ambiguous and the brief's premise is
wrong. Two readings:

- **Reading A - a new TOP-LEVEL tab** (the brief's literal instruction and the
  owner's literal word "tab"): a fifth entry in `TAB_ORDER`, peer of Courses /
  Tools / Library / Course Intel. Modelled on **Course Intel**, which is the
  existing precedent for a top-level tab that "absorbed nothing, so it has no
  rail" (`page.tsx:836-844`): one stateless surface, no section/view sub-state.
- **Reading B - a new CHIP in the Courses rail**, peer of the "Term Setup" and
  "Daily/Weekly" chips the owner actually named. This is a new `CoursesSection`
  (not a `TasksView` - One-Off Tasks is cross-college, not course-prep, so it is
  not a member of the course-prep Tasks family).

**RECOMMENDATION: Reading A (new top-level tab).** Why, in one line: the data is
cross-college standing workspace that belongs to no single course context (unlike
Term Setup / Daily-Weekly, which live under Courses because they ARE course
prep), it matches the owner's literal word "tab", and it is the cleanest change
here - `TAB_ORDER`/`isActiveTab`/the strip/`parseUrlState` all DERIVE from one
list, and the Course Intel precedent gives a rail-less stateless tab with no new
URL param (section 4).

**Owner-confirmable (one line):** Reading A puts "One-Off Tasks" in the top strip
beside Courses/Tools/Library/Course Intel; if you instead meant a fourth chip
inside the Courses tab next to Term Setup and Daily/Weekly, say so and W1 becomes
a Courses-rail change instead (same task tool, one level deeper).

### FORK 2 - persistence: localStorage (per-device) vs a Supabase table (durable, cross-device)

Measured constraint that decides this: **`sweepClientState` erases ALL
localStorage on every sign-out / owner change**, keep-list is only `ta-theme`
plus its own marker (`src/lib/client-state-sweep.ts:45,146-154`). Per-user data
is wiped by design so the next signed-in user cannot inherit it. localStorage
task data would therefore be destroyed on sign-out and never crosses devices.

- **(a) localStorage** (`ta-` key): zero backend, simplest, token-cheapest, fully
  testable here (pure functions + persistence). But tasks live only on one
  device and are erased on sign-out. The leverage claim (section 3) reduces to
  click-cost only.
- **(b) Supabase table**: durable, survives sign-out, cross-device,
  owner-scoped. Needs a migration (auto-applies via the GitHub Action on push to
  main), owner-scoped RLS (the `create_problems.sql` idiom, section 6), a typed
  row mapper (bare typed selects collapse to `never` here), and CRUD through
  server actions (attended UI reaches the service-role DB only via a server
  action). This environment CANNOT verify RLS, the live query, or migration
  application (no `.env`, no live DB - `this-repo.md` section 6); only the
  migration's lexical form, the typed mapper, and the server-action shape are
  checkable here.

**RECOMMENDATION: (b) Supabase table.** Why, in one line: a cross-college task
tracker is durable accumulated data the owner returns to over a term (CORPUS, not
transient UI state), localStorage's sign-out erasure makes (a) genuinely lossy
for exactly this use, and (b) is the only version with a defensible leverage
claim and aligns with the standing "prefer most extensive scope" memory.

**Owner-confirmable (one line):** proceeding with a Supabase `one_off_tasks`
table (durable + cross-device); if you want the zero-backend version instead, we
swap W2's repository implementation to a `ta-` localStorage key (tasks then live
only on this device and vanish on sign-out) - one module changes, nothing else.

**Both forks are cheap to reverse because the architecture isolates them:** Fork
1 is confined to W1 (registration), Fork 2 is confined to W2 (the repository
module behind a hook seam). W3 (the UI) is identical either way.

---

## 1. What exists today (brief from the tree, not the doc)

| Fact | Where | Measured/opened |
|---|---|---|
| Top-level tabs = 4, derived from one ordered list | `tab-sections.ts:31-47` (`ActiveTab`, `TAB_ORDER`, `TAB_LABELS`, `DEFAULT_TAB="manual"`) | opened |
| Strip is `TAB_ORDER.map(...)`, onChange `(_, v: ActiveTab) => setActiveTab(v)` | `page.tsx:435-490` | opened |
| A rail-less top-level tab precedent | Course Intel: `page.tsx:836-844` (`{activeTab === "course-intel" && (<TabShell><CourseIntelTab /></TabShell>)}`) | opened |
| URL accept/normalize derives from `TAB_ORDER` | `url-state.ts:99-133` (`isActiveTab`, `resolveTabDestination`, `normalizeActiveTab`) | opened |
| `buildUrlSearch` has per-tab blocks ONLY for courses/manual/files; course-intel emits just `?tab=course-intel` | `url-state.ts:451-507` | opened |
| Active-tab persistence key | `ta-active-tab`, written by effect `useAppNavigation.ts:556-558`; restored `:97,115-124` | opened |
| Institution/college model (REUSE this, do not invent) | `src/lib/institutions.ts` - `useInstitutions()` / `useInstitutionSelection()` read `ta-institutions` acronyms (MCC, MPCC, ...) | opened |
| Owner-scoped per-user table house idiom | `supabase/migrations/20260826000000_create_problems.sql` (RLS: `auth.uid() = user_id`, 4 policies, status check, timestamps) | opened |
| Existing "Tasks" feature is COURSE prep, not this | `src/app/components/TasksTab.tsx` (800 lines, `@(Get-Content).Count`), `src/lib/course-tasks*.ts` - course-scoped prep checklists; DO NOT extend it | opened |
| No existing "one-off" anything | `Select-String ... -Pattern "one-off\|oneOff\|one_off\|OneOff"` returned nothing | measured |
| page.tsx size | 881 lines (`@(Get-Content src/app/page.tsx).Count`) - adding a ~5-line render branch stays well under the 1000 ceiling | measured |
| Only exhaustive `Record<ActiveTab>` | `TAB_LABELS` (`tab-sections.ts:38`); no `switch (activeTab)` exists (`grep` returned none) - tsc forces the new label | measured |
| Latest migration | `20261026000000_accessibility_scans.sql` -> next = `20261027000000_create_one_off_tasks.sql` | measured |

---

## 2. Acceptance criteria (owner's words -> criteria)

Written from the owner's words. Mechanism is section 5; oracle construction is
the test seat's (section 10 names the instruments only).

**IN scope (what "simple task management tool to track tasks across different
colleges" means):**

- **AC1 - the tab exists and is reachable.** A top-level tab labelled
  "One-Off Tasks" appears in the strip beside Courses / Tools / Library / Course
  Intel, is selectable, restores from `?tab=one-off-tasks` and from
  `ta-active-tab`, and renders its surface (not a blank pane). [Reading A]
- **AC2 - a task has: title (required), a college association, a done/undone
  status, and optional notes and due date.** College reuses the existing
  institution acronyms (`useInstitutions()`); a task may be "Unassigned" (no
  college). Nothing else is required - "simple".
- **AC3 - CRUD.** The owner can add a task, edit its fields, toggle it
  complete/incomplete, and delete it. Add and complete are minimized to the
  fewest clicks (section 8).
- **AC4 - "across different colleges" = group or filter by college.** The list
  can be viewed grouped by college and/or filtered to one college, using the
  registered institution list. A task's college shows on the row.
- **AC5 - persistence.** Tasks survive a reload. [Recommended: survive sign-out
  and sync across devices - the Supabase reading, Fork 2.] Every new UI control
  (filter, group toggle, any select/checkbox) persists across reload per the
  persist-UI-control-state standing rule (a `ta-` key each).
- **AC6 - empty/loading/error states** have explicit, emoji-free copy in the
  app's voice (section 8).

**OUT of scope (deliberately minimal - "simple"):**

- No scheduling engine, no reminders/notifications, no recurrence.
- No assignment to people, no sharing, no multi-user.
- No Canvas/LMS sync of tasks.
- No sub-tasks, dependencies, priorities beyond done/undone (a priority flag is a
  possible later residual, not in this build).
- Not an extension of the course-prep Tasks feature (`TasksTab`/`course-tasks`) -
  that is course-scoped prep; this is standalone cross-college.

**Triage note:** this is feature work (a new user-reachable capability), so the
AC seat must carry a LEVERAGE CLAIM (section 3) and the test seat owns its
removal test. Acceptance criteria / Test seat both run (never triaged out).

---

## 3. Leverage claim (one paragraph + one removal-test obligation)

**Class: CORPUS** (`docs/loop/leverage.md:37`). One-Off Tasks persists a
per-owner, queryable record of tasks keyed by college, read back and re-filtered
in a later session - what the owner does instead today is keep cross-college
to-dos in their head or in a chat transcript, which is not a record anything can
mark done, filter to one college, or show still-open next week. The mechanism is
the stored, owner-scoped task rows plus the group/filter-by-college read
(section 5), not "it saves time". **This claim's strength is coupled to Fork 2:**
under the recommended Supabase reading it is genuine CORPUS (durable,
cross-device, owner-scoped); under the localStorage reading it degrades to a
per-device structured list whose honest claim is click-cost only (the
`AskAiModal` "accept the cost explicitly" disposal, `leverage.md:112-123`) - a
third reason the recommendation is (b).

**Removal-test obligation (test seat owns the assertion):** name the deletion -
remove the read-back/persistence (the repository's `list` or the group-by-college
read) - and the assertion whose observed value changes is "tasks added in a
prior load are listed and grouped by college on a later load". If Fork 2 lands on
localStorage, state in the criteria that the advantage is click-cost and record a
residual that no durable/cross-device removal test is buildable (per
`leverage.md:180-183`, latency/attention/per-device advantages have no buildable
removal test here).

---

## 4. Registration touch-list (Reading A: new top-level tab), with file:line + canary bumps

A new top-level tab touches FOUR things, because the strip, the URL accept set,
and the normalizers all DERIVE from one list. The new tab is **stateless** (no
section, no view, no new `UrlNavState` field) - modelled exactly on Course Intel
- which is what keeps the blast radius this small and avoids breaking every
`toEqual` in `url-state.test.ts`.

### Source edits (3 files)

1. **`src/app/components/tabs/tab-sections.ts`**
   - `ActiveTab` union (`:31`) += `"one-off-tasks"`.
   - `TAB_ORDER` (`:36`) += `"one-off-tasks"` (placement = owner's "sibling"
     ordering; recommend last, after `course-intel`, so the four existing
     positions are unchanged).
   - `TAB_LABELS` (`:38`) += `"one-off-tasks": "One-Off Tasks"` - **tsc forces
     this** (it is `Record<ActiveTab, string>`, the only exhaustive ActiveTab
     map; `grep` found no `switch (activeTab)`).
   - Nothing else here: `isActiveTab`, `normalizeActiveTab`, `resolveTabDestination`,
     `buildUrlSearch`, `parseUrlState`, the strip map, and the onChange handler
     all derive from `TAB_ORDER` and need **no edit** (confirmed by reading
     `url-state.ts:99-133,451-507` and `page.tsx:435-490`). The new tab needs NO
     `buildUrlSearch` branch (like course-intel it emits only `?tab=...`).

2. **`src/app/page.tsx`** (881 lines -> ~886)
   - Add import of the new tab component.
   - Add the render branch, verbatim shape of the course-intel precedent
     (`page.tsx:840-844`):
     `{activeTab === "one-off-tasks" && (<TabShell><OneOffTasksTab /></TabShell>)}`.
   - This is a PLAIN conditional mount (not an always-mounted display toggle):
     the surface holds no live capture resource, so the I-W2 "stays mounted while
     hidden" rule does not apply (contrast `page.tsx:479-507`).

3. **The new component(s)** - section 5.

### Canary bumps FORCED by the new tab (enumerate in the wave plan)

Measured by `Select-String` over the tab tests + reading each:

- **`src/app/components/tabs/tab-sections.test.ts:31`** - frozen literal
  `expect([...TAB_ORDER]).toEqual(["courses","manual","files","course-intel"])`.
  MUST add `"one-off-tasks"`. Also `:34-37` (label non-empty + no-duplicates) is
  derived and passes once `TAB_LABELS` has the entry.
- **`src/app/components/tabs/topLevelTabs.wiring.test.ts:144-150`** - frozen
  literal `toEqual(["courses","manual","files","course-intel"])` PLUS a
  `TAB_LABELS[...]` assertion per tab. MUST add `"one-off-tasks"` to the array
  and add `expect(TAB_LABELS["one-off-tasks"]).toBe("One-Off Tasks")`.
  - DERIVED assertions here that then pass automatically ONCE the page render
    branch exists: `:152` (every tab in `isActiveTab` set), `:179` (a
    `{activeTab === "<tab>" &&` render branch for every `TAB_ORDER` member -
    this is the "ships dead / blank pane" guard; it is why the page edit is
    mandatory and is the instrument for AC1).
  - DERIVED assertions that do NOT trip because the new tab is rail-less:
    `:209` (merged tabs need exactly one `<TabRail>`) and `:238` (both section
    halves) both iterate a HARDCODED `["courses","manual","files"]`, which the
    new tab is not in - exactly like course-intel. Confirm green; do not edit.
- **`src/app/url-state.test.ts`** - imports and LOOPS `TAB_ORDER` at
  `:226-227` (derived - auto-covers the new tab). Its per-tab `toEqual(...)`
  objects (e.g. `parseUrlState("?tab=course-intel")` at `:377`) test SPECIFIC
  tabs and are unaffected by a stateless new tab that adds no `UrlNavState`
  field. **Expected: no edit needed.** The wave gate MUST still run this file to
  confirm (a new `UrlNavState` field would break every `toEqual` here - another
  reason the tab stays stateless).
- **`src/app/components/tabs/tab-rails.test.ts`** - concerns the Courses/Tools
  RAILS and `EXPECTED_PARAM_NAMES` (`:298-312`). A stateless rail-less tab adds
  no rail and no param. **Expected: no edit needed;** run it to confirm.

**No other consumer.** `client-state-sweep.ts` does not enumerate tabs; the
`ta-active-tab` effect persists any `ActiveTab` value already
(`useAppNavigation.ts:556-558`). No frozen global `ta-` key list exists.

---

## 5. Architecture - the SHAPE (seam, task model, file layout, signatures)

The one load-bearing decision: **a storage seam** so Fork 2 changes exactly one
module. The UI (W3) depends only on a hook; the hook depends on a repository; the
repository is the only thing the persistence choice selects.

### 5.1 The seam (THE SURFACE IS A LAYER - named explicitly)

```
OneOffTasksTab (UI, page.tsx mounts it)
   |  calls
useOneOffTasks()  -> { tasks, loading, error, addTask, updateTask, toggleDone, deleteTask }
   |  delegates to
oneOffTasksRepository  (the ONE module Fork 2 selects)
   |  -> (b) server actions -> Supabase one_off_tasks (RECOMMENDED)
   |  -> (a) ta- localStorage  (alternative)
```

The hook `useOneOffTasks()` is the surface the UI reaches; the repository is the
surface the hook reaches. Naming both prevents the "library + endpoint, no
surface between them" failure: the hook IS the layer the user's clicks arrive at.

### 5.2 Task shape (type-only leaf - testable without a render)

Put the type and all pure logic (grouping, filtering, validation) in a plain
`.ts` leaf, never inline in the `.tsx` - vitest renders no component, so inline
logic is untestable here.

```
export interface OneOffTask {
  id: string;
  title: string;            // required, trimmed, length-capped (e.g. 1..200)
  college: string | null;   // an institution acronym (useInstitutions), or null = Unassigned
  done: boolean;
  notes: string;            // optional, default "", length-capped (e.g. 0..2000)
  dueDate: string | null;   // ISO yyyy-mm-dd or null
  createdAt: string;        // ISO
  updatedAt: string;        // ISO
}
```

### 5.3 Pure functions the test seat will pin (no render needed)

- `validateTaskTitle(raw): { ok: true; title } | { ok: false; reason }` -
  blank-after-trim rejected; length cap. (Model: `validateNewInstitutionAcronym`,
  `institutions.ts:68-77`.)
- `groupTasksByCollege(tasks, institutions): { college: string | null; tasks: OneOffTask[] }[]`
  - stable order: registered institutions in registry order, then Unassigned,
  then any college not in the registry (so a task whose college was later removed
  from Settings still shows).
- `filterTasks(tasks, { college?, status? })`.

### 5.4 File layout (new files only - disjoint from all sibling builds)

| File | Est. lines | Role |
|---|---|---|
| `src/app/components/one-off-tasks/OneOffTasksTab.tsx` | ~180 | the surface; list + add control + filter/group controls |
| `src/app/components/one-off-tasks/one-off-task-model.ts` | ~90 | `OneOffTask` type + pure validate/group/filter |
| `src/app/components/one-off-tasks/useOneOffTasks.ts` | ~90 | the hook seam (state + CRUD + persisted control keys) |
| `src/app/components/one-off-tasks/oneOffTasksRepository.ts` | ~70 | the repository seam; selects store (Fork 2) |
| **Fork 2 (b) only:** `src/app/actions/one-off-tasks.ts` | ~120 | `"use server"` CRUD (async exports only - `use-server-exports.test.ts`) |
| **Fork 2 (b) only:** `src/lib/supabase/one-off-tasks.ts` | ~110 | typed-row mapper + table reads (bare select collapses to `never`) |
| **Fork 2 (b) only:** `supabase/migrations/20261027000000_create_one_off_tasks.sql` | ~45 | table + owner-scoped RLS (section 6) |
| Tests (section 10) | - | model, repository, wiring, migration-structure |

All under `src/app/components/one-off-tasks/`, `src/app/actions/`,
`src/lib/supabase/`, `supabase/migrations/` - **none intersect** repo-grades or
grading-chat paths.

### 5.5 Seam signatures (the contract every wave builds against)

```
// repository (store-agnostic)
interface OneOffTasksRepository {
  list(): Promise<OneOffTask[]>;
  add(input: NewTaskInput): Promise<OneOffTask>;
  update(id: string, patch: Partial<Omit<OneOffTask,"id"|"createdAt">>): Promise<OneOffTask>;
  remove(id: string): Promise<void>;
}
type NewTaskInput = { title: string; college: string | null; notes?: string; dueDate?: string | null };
```

The write path **enumerates fields explicitly** (no object spread into storage),
so a future field cannot leak into the store silently (data checker's rule).

---

## 6. Data / storage spec

### Recommended (b) - Supabase `one_off_tasks`

Migration DDL in house style, modelled on `create_problems.sql` (opened). File
`supabase/migrations/20261027000000_create_one_off_tasks.sql`:

```sql
create table if not exists public.one_off_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  college text,                         -- institution acronym, or null = Unassigned
  done boolean not null default false,
  notes text not null default '',
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists one_off_tasks_user_idx
  on public.one_off_tasks (user_id, created_at desc);
alter table public.one_off_tasks enable row level security;
-- four owner-scoped policies (select/insert/update/delete), each auth.uid() = user_id,
-- drop-if-exists then create, exactly as create_problems.sql:20-38.
```

- **No nullable uniqueness key**, so no partial-index / generated-column concern
  (the 42P10 upsert trap does not arise here).
- **Typed mapper required**: a bare `supabase.from("one_off_tasks").select()`
  collapses to `never` here; map each row through an explicitly typed
  `mapOneOffTask(row): OneOffTask` (the `mapRecordingFile` idiom). The new table
  must also be added to the generated Supabase types (`src/lib/supabase/types*`).
- **CRUD via server actions** (`src/app/actions/one-off-tasks.ts`): attended UI
  reaches the service-role DB only through a server action; the file is
  `"use server"` so every export is an async function (the arrow-export ratchet
  and `use-server-exports.test.ts` both apply). RLS on `auth.uid()` means no
  app-owner gate is needed - each authenticated user sees only their own rows.
- **Retention/cleanup**: rows persist until the owner deletes them. An abandoned
  task simply stays `done=false`. `on delete cascade` removes a user's rows if
  the auth user is deleted. Size: text tasks are bytes; no quota concern.
- **UNVERIFIABLE HERE (state plainly):** RLS enforcement, the live query, and
  migration application cannot be tested in this checkout (no `.env`, no live DB,
  migrations auto-apply only on push to main - `this-repo.md` section 6). What IS
  checkable here: the migration's lexical well-formedness
  (`supabase-migrations.structure.test.ts`), the typed mapper, and the
  server-action shape. Record the RLS/live-behaviour verification as an
  owner-only residual (section 11).

### Alternative (a) - localStorage

Single `ta-` key, e.g. `ta-one-off-tasks`, holding a JSON array. Reuses the
`institutions.ts` read/write/guard shape. **Caveat (measured):** wiped by
`sweepClientState` on sign-out/owner change (`client-state-sweep.ts:146-188`) and
per-device only. Fully testable here (pure serialize/parse + persistence). Any
new UI control still needs its own `ta-` key per the persist-UI-control-state
rule.

---

## 7. Light security / admin / SRE note (folded in, not separate passes)

- **Admin / operability:** it is the owner's own data; admin CRUD = the owner.
  Under (b), owner-scoped RLS on `auth.uid()` is the whole access model - no new
  settings surface, no `requireAppOwner` route needed (this is per-user data, not
  app-owner config). No durable audit trail is in scope; say so.
- **Security:** task `title`/`notes` are owner-authored free text. They reach the
  DOM only through React (auto-escaped - no `dangerouslySetInnerHTML`), so XSS
  risk is low; confirm no raw-HTML render in review. They reach NO LLM prompt
  (this tool makes no model call), so there is no prompt-injection surface. Wire
  validation: length caps on title/notes (section 5.3); under (b) the server
  action validates again server-side, never trusting the client.
- **Reliability / SRE:** no stream, no long call, no background job, no retained
  resource. Under (b) a failed CRUD call surfaces an inline error and leaves the
  list unchanged (optimistic update rolls back on reject); under (a) a
  storage-write failure degrades to in-memory (session-only) rather than
  throwing. Rollback blast radius is tiny: all-new files plus one additive
  migration and a 3-line additive edit to `tab-sections.ts` + `page.tsx`.

---

## 8. UX

**Visual language:** reuse the app's existing surface frame - the tab mounts in
`<TabShell>` exactly like Course Intel (`page.tsx:841`), so it inherits the
standard tab padding/container. No emojis (UI/UX standard + `no-emojis.test.ts`
scans `docs/` and `src/`). Reuse house control-row patterns (`.adaptRow` /
`.ghActions`) rather than new inline flex; name every size as a token/px, do not
assert "matches".

**Click cost (counted, both first-use and repeat):**

- **Add a task:** an always-visible inline "add" row at the top (title input +
  college select defaulting to the active institution from
  `useInstitutionSelection()` + Add button / Enter-to-submit). First add = type
  title, Enter = **1 interaction** beyond typing (college pre-filled to active
  institution). Repeat add = same **1**. Minimizes clicks per the standing rule;
  no modal for the common case.
- **Complete a task:** a checkbox on the row = **1 click**, first and repeat.
- **Filter/group by college:** a single select (All / per-college / Unassigned)
  plus a group-on/off toggle; both persist (`ta-` keys). Changing filter = 1
  click.

**Keyboard:** the add-title input submits on Enter. If any keyboard handler is
added to a MUI input it MUST be routed through `slotProps.input`
(`onKeyDown` in `htmlInput` silently never fires - `seats.md` UX rule). No new
`window`-level keydown (the recorder's `r`/`p`/`m` global handler must not be
shadowed) - this surface uses element-scoped handlers only.

**Copy (emoji-free, app voice):**
- Empty: "No tasks yet. Add one above to start tracking work across your
  colleges."
- Loading (b only): "Loading your tasks..."
- Error (b only): "Could not load your tasks. Reload to try again."
- Per-college empty group (when grouped): "No tasks for {COLLEGE}."

**Three places this could mislead (UX checker to rank):** (1) the pre-filled
college on the add row could silently file a task under the wrong college if the
owner forgets to change it - show the selected college prominently on the row;
(2) "Unassigned" must read as a real bucket, not a bug; (3) under (a), tasks
vanishing on sign-out would read as data loss - if (a) is chosen, the empty-state
copy must not imply durability.

---

## 9. Reachability (trace control -> code, so it cannot ship dead)

AC1's instrument is `topLevelTabs.wiring.test.ts:179` (a render branch per
`TAB_ORDER` member). The chain: strip chip (derived from `TAB_ORDER`) ->
`setActiveTab("one-off-tasks")` (derived onChange) -> `activeTab` state (persisted
`ta-active-tab`) -> the new `{activeTab === "one-off-tasks" && ...}` branch ->
`<OneOffTasksTab>` -> `useOneOffTasks()` -> repository. Every link is either
derived from one list or an explicit edit in section 4; none is a render-only
claim. No component is rendered by any test (`this-repo.md` section 2), so the
"it paints" half is an owner/browser walk, recorded as owner-only (section 11).

---

## 10. Wave plan

Three waves, each independently pushable, disjoint write sets. Within a wave,
one implementer. Gate each wave with `npm run test:paths <p1> <p2> ...` (never a
raw multi-path `vitest`, which silently drops unmatched args), plus the
unconditional `src/file-size-ceiling.structure.test.ts`.

### W1 - top-level tab registration + empty shell (Reading A)

- **Write set:** `src/app/components/tabs/tab-sections.ts`, `src/app/page.tsx`,
  `src/app/components/one-off-tasks/OneOffTasksTab.tsx` (empty shell: a heading +
  "coming soon" placeholder, enough to satisfy the render-branch canary),
  `src/app/components/tabs/tab-sections.test.ts`,
  `src/app/components/tabs/topLevelTabs.wiring.test.ts`.
- **Canaries tripped (bump in THIS wave):** `tab-sections.test.ts:31`,
  `topLevelTabs.wiring.test.ts:144-150` (add the fifth value + its label
  assertion). `:179`/`:152` pass once the page branch exists.
- **Machine-checkable AC (source-text / derived - nothing renders):**
  `TAB_ORDER` contains `"one-off-tasks"`; `TAB_LABELS["one-off-tasks"]==="One-Off
  Tasks"`; `isActiveTab("one-off-tasks")===true`;
  `parseUrlState("?tab=one-off-tasks").tab==="one-off-tasks"`;
  `buildUrlSearch({...,tab:"one-off-tasks"})==="?tab=one-off-tasks"`; page.tsx
  has the `{activeTab === "one-off-tasks" &&` branch rendering `OneOffTasksTab`.
- **Gate:** `npm run test:paths src/app/components/tabs/tab-sections.test.ts src/app/components/tabs/topLevelTabs.wiring.test.ts src/app/components/tabs/tab-rails.test.ts src/app/url-state.test.ts src/app/components/home/useAppNavigation.test.ts src/file-size-ceiling.structure.test.ts`
  (includes tab-rails + url-state + useAppNavigation to PROVE they stay green
  unedited), then `npx tsc --noEmit`, `npm run lint`, build compile-line check.

### W2 - task model + storage seam + repository

- **Write set (recommended b):** `.../one-off-task-model.ts`, `.../useOneOffTasks.ts`,
  `.../oneOffTasksRepository.ts`, `src/app/actions/one-off-tasks.ts`,
  `src/lib/supabase/one-off-tasks.ts`, `src/lib/supabase/types*` (additive),
  `supabase/migrations/20261027000000_create_one_off_tasks.sql`, and the model +
  repository + mapper tests. (Alternative a: drop the three Supabase/action files
  and the migration; `oneOffTasksRepository.ts` targets `ta-one-off-tasks`.)
- **Canaries tripped:** `src/supabase-migrations.structure.test.ts` (lexical) +
  `src/source-bytes.structure.test.ts` (new files must stay text). No tab-set
  canary in this wave.
- **Machine-checkable AC:** `validateTaskTitle` rejects blank/over-cap and
  accepts valid; `groupTasksByCollege` orders registry-first then Unassigned then
  orphaned-college and is stable; `filterTasks` honours college+status; the
  mapper returns a fully-typed `OneOffTask` (never `never`); the server-action
  file exports only async functions; the migration is lexically well-formed. Each
  assertion names its mutation (test seat, section note below).
- **Gate:** `npm run test:paths <model.test> <repository.test> <mapper.test> src/supabase-migrations.structure.test.ts src/source-bytes.structure.test.ts src/lib/use-server-exports.test.ts src/file-size-ceiling.structure.test.ts` + tsc/lint/build.

### W3 - the task UI + CRUD + per-college grouping

- **Write set:** `.../OneOffTasksTab.tsx` (full), a `*.wiring.test.ts` asserting
  the UI mounts the hook and wires add/complete/delete/filter/group, plus any
  persisted-control-key wiring test.
- **Canaries tripped:** none new beyond file-size + source-bytes; confirm
  `topLevelTabs.wiring.test.ts` still green (the branch now renders real content).
- **Machine-checkable AC (source-text - no render here):** the component imports
  and calls `useOneOffTasks`; the add path calls `addTask`; the row checkbox
  calls `toggleDone`; delete calls `deleteTask`; the filter/group selects read
  `useInstitutions()` and write their `ta-` keys; copy strings present and
  emoji-free. The LOOK (layout, that it paints, keyboard in a real browser) is an
  owner/browser walk - owner-only residual.
- **Gate:** `npm run test:paths <OneOffTasksTab.wiring.test> src/lib/no-emojis.test.ts src/file-size-ceiling.structure.test.ts` + tsc/lint/build.

**Test-seat note (section for the test-author, not built here):** each W2/W3
assertion must name the mutation that breaks it; the leverage removal test
(section 3) belongs in W2's model/repository tests ("tasks from a prior load are
listed and grouped by college"). Prove the red tests satisfiable with a throwaway
reference implementation before hand-off.

---

## 11. `owns` file list (derived; command + output pasted)

Command (identifies the canary files that pin the tab SET or read page.tsx as
source):

```
Select-String -Path src/app/components/tabs/*.test.ts, src/app/url-state.test.ts, \
  src/app/components/home/useAppNavigation.test.ts \
  -Pattern 'courses", "manual", "files", "course-intel"|TAB_ORDER|read\(PAGE\)|TAB_LABELS'
```

Output (unique paths):

```
src/app/components/tabs/tab-sections.test.ts        <- MUST edit (frozen tab list :31)
src/app/components/tabs/topLevelTabs.wiring.test.ts <- MUST edit (frozen list :144 + add label + reads page.tsx as source :75,139)
src/app/url-state.test.ts                           <- reads TAB_ORDER (derived); run to confirm, no edit expected
```

**Full owns (edited files + tests that read them as source text):**

- Edited: `src/app/components/tabs/tab-sections.ts`, `src/app/page.tsx`, all new
  `src/app/components/one-off-tasks/*`, and (Fork 2 b) `src/app/actions/one-off-tasks.ts`,
  `src/lib/supabase/one-off-tasks.ts`, `src/lib/supabase/types*`,
  `supabase/migrations/20261027000000_create_one_off_tasks.sql`.
- Read-as-source (go red if the edit is wrong even when the edit file is fine):
  `src/app/components/tabs/topLevelTabs.wiring.test.ts` (reads `page.tsx`,
  `tab-sections.ts` via `TAB_ORDER`), `src/app/components/tabs/tab-sections.test.ts`,
  `src/app/url-state.test.ts`, `src/app/components/tabs/tab-rails.test.ts`,
  `src/supabase-migrations.structure.test.ts`, `src/source-bytes.structure.test.ts`,
  `src/lib/no-emojis.test.ts` (scans `src/` AND `docs/`, so this scope file too),
  `src/lib/use-server-exports.test.ts` (Fork 2 b), `src/file-size-ceiling.structure.test.ts`.

**Disjointness from sibling builds:** no path above intersects
`src/app/components/repo-grades/**` or any grading-chat file. Empty intersection.

---

## 12. Residual register (owner, instrument, step)

| # | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| R1 | FORK 1 (top-level tab vs Courses-rail chip) | repo owner | n/a (product decision) | orchestrator escalates; default = Reading A if unanswered within the activity |
| R2 | FORK 2 (Supabase vs localStorage) | repo owner | n/a (product decision) | orchestrator escalates; default = (b) Supabase |
| R3 | RLS enforcement + live query + migration application UNVERIFIABLE here (Fork 2 b) | repo owner | real DB on Vercel + GH Action run | owner verifies the Action applied the migration and RLS scopes rows after push to main |
| R4 | The tab/list actually PAINTS, keyboard works in a real browser | repo owner | browser walk | owner opens `?tab=one-off-tasks`, adds/completes/filters a task |
| R5 | If Fork 2 = (a), no durable/cross-device removal test is buildable | test seat | n/a (per `leverage.md:180-183`) | record the click-cost-only claim in criteria; no test |
| R6 | Priority flag / due-date reminders explicitly OUT this build | repo owner | backlog row | file as a follow-up if wanted |

Every residual above must be written into `docs/BACKLOG.md` by the orchestrator
at disposal, or it does not exist (`DEV_LOOP.md` step 0). No disposition table is
owed - this is a NEW item with no prior version.
