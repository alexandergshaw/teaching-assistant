# The service-role predicate audit: RES-2, closed, with five findings

Written 2026-09-28 against the tree at `28bc0c5` (`git log -1 --format=%h`).
Consumer: the repo owner, and the next wave that touches any service-role call
site or any caller-supplied Storage path.

**THE HEADLINE, because the brief said to lead with it if it existed.** There is
a genuine cross-tenant Storage WRITE (delete) and a genuine cross-tenant Storage
READ, both reachable by any approved non-owner account, and both follow from ONE
root cause: **three server actions accept a fully caller-supplied Storage object
path, persist it with no prefix validation, and four service-role Storage
operations later act on that stored path - bypassing the `course-files` bucket
policy, whose entire containment is a per-user first path segment**
(`supabase/migrations/20260722000000_course_materials.sql:17`). Findings 1-3 in
section 6. The queries themselves are almost uniformly well scoped - 129 of 150
acquisition sites are cleanly bound to the guard identity - so the predicate
idiom the criterion document credits is real. **What is not contained is the
STORAGE PATH, which no predicate can scope, and which nothing in this repo
checks.**

**No owner decision bears on this question.** Checked FIRST, as
`docs/loop/traps-spec.md:108-129` requires:

```
grep -n -iE "service.role|service_role|RLS|row.level|tenant|predicate|user_id" \
  docs/owner-decisions-2026-09-23.md docs/owner-decisions-2026-09-27.md
# -> one hit, docs/owner-decisions-2026-09-23.md:166, "ONE exported predicate
#    returning immediate, scheduled" - A32's schedule classifier, unrelated.
```

`docs/owner-decisions-2026-09-27.md` was read in full (104 lines, `wc -l`):
DECISION 15 is A43's conversational layer, DECISION 16 is A40's disclosure
column. Neither touches the service-role client, RLS, or tenant scoping. So
nothing here reasons from inferred precedent against an owner ruling.

---

## 1. The population, derived here, not quoted

### 1.1 The production file list the census runs over

```
find src -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.mts' -o -name '*.cts' \
  -o -name '*.js' -o -name '*.mjs' \) ! -name '*.test.ts' ! -name '*.test.tsx' \
  > prod_files.txt
wc -l < prod_files.txt
# 1602
```

`PF` below abbreviates `cat prod_files.txt | tr '\n' '\0' | xargs -0`, which is
how each command was actually run - this checkout's path contains spaces, so
`xargs -0` is required.

### 1.2 `createServiceClient`: 206 non-comment lines, 54 files - reproduced

```
PF grep -nE 'createServiceClient' | grep -vE ':[0-9]+:\s*(//|\*|/\*)' | wc -l
# 206
PF grep -nE 'createServiceClient' | grep -vE ':[0-9]+:\s*(//|\*|/\*)' \
  | cut -d: -f1 | sort -u | wc -l
# 54
```

The document's figure reproduces exactly. **How comments were excluded, and what
that removed.** The filter drops any line whose first non-space character opens a
comment. It is not a no-op:

```
PF grep -nE 'createServiceClient' | grep -cE ':[0-9]+:\s*(//|\*|/\*)'
# 14
```

Fourteen lines removed - 220 raw, 206 kept. **Two holes I am naming rather than
claiming coverage of:** the filter is line-based, so it does NOT strip a trailing
`// createServiceClient` on a line that also holds code, and it does not strip
the interior of a block comment whose continuation lines lack a leading `*`. I
inspected the 206 kept lines by hand (section 1.4 partitions all 206) and found
no comment among them, which is a reading, not a mechanical guarantee.

### 1.3 The alias the brief asked about EXISTS, and the census above cannot see it

```
PF grep -nE 'export .*createServiceClient|createServiceClient as '
  | grep -vE ':[0-9]+:\s*(//|\*|/\*)'
# src/app/api/cron/sweep-orphan-uploads/route.ts:47   ReturnType<typeof ...> (type position)
# src/app/api/cron/sweep-orphan-uploads/route.ts:59   ReturnType<typeof ...> (type position)
# src/lib/supabase/server.ts:126                      the declaration itself
```

No re-export under another name. **But the client IS obtainable by a second
name**: `src/lib/research/db.ts:278` exports `getDbClient()`, which returns the
memoized service client built at `:64-65` via a dynamic
`import("@/lib/supabase/server").then((mod) => mod.createServiceClient())`.

```
PF grep -nE '\bgetDbClient\b' | grep -vE ':[0-9]+:\s*(//|\*|/\*)'
# src/lib/research/db.ts:278        export function getDbClient()
# src/lib/research/glossary.ts:16   import
# src/lib/research/glossary.ts:42   const client = await getDbClient();
# src/lib/research/rubric-bank.ts:16  import
# src/lib/research/rubric-bank.ts:47  const client = await getDbClient();
# -> 5 lines, 3 files (one of which, research/db.ts, is already in the 54)
```

So `src/lib/research/glossary.ts` and `src/lib/research/rubric-bank.ts` hold
service-role queries against `glossary_terms` and `rubric_bank` and appear in
NEITHER the 206 lines nor the 54 files. The criterion document's population is a
floor for exactly this reason.

**Ruled out as further paths to a service-role client, each with the command:**

```
PF grep -nE 'createServerClient|from "@supabase/supabase-js"|from .@supabase/ssr.' \
  | grep -vE ':[0-9]+:\s*(//|\*|/\*)'
```
returns 88 lines, of which all but four are `import type { SupabaseClient }` /
`import type { User }` type-only imports plus `isAuthRetryableFetchError`. The
four real constructions are `src/lib/supabase/server.ts:94` (anon key, read at
`:95-96`), `src/lib/supabase/server.ts:127` (the service key, read at `:129`),
`src/lib/supabase/proxy.ts:212` (**anon key**, read at `:214` - I opened it to
check, because a service-role middleware client would have been the worst
possible finding), and `src/lib/supabase/client.ts:1` (`createBrowserClient`).
And the only three `SUPABASE_SERVICE_ROLE_KEY` reads in `src/` are
`server.ts:129` (the construction), `research/db.ts:60` (an existence check that
gates `getClient()`), and two comment lines.

`src/lib/supabase/storage.ts` deserves its own note because its name invites the
wrong conclusion: **every export above `:45` uses the ANON+cookie client**
(`createServerSupabaseClient`, `:1-2`). Only `listFilesAs` (`:108`) and
`removeFilesAs` (`:133`) take a client as an argument, and their only callers are
the orphan-upload cron (`src/app/api/cron/sweep-orphan-uploads/route.ts:50,62`).

### 1.4 The derived population, and the partition that proves it is exhaustive

**211 non-comment reference lines across 56 production files.** The 206 were
partitioned by content, not by arithmetic:

| Shape | Count | Command |
|---|---|---|
| import lines | 52 | `grep -cE 'import .*createServiceClient\|from "@/lib/supabase/server"\|from "\.\./server"\|from "\./server"'` over the 206 |
| `createServiceClient(` invocation lines | 149 | `grep -cE 'createServiceClient\('` over the 206 |
| type-position lines (`ReturnType<typeof ...>`) | 5 | the residue, listed below |

52 + 149 + 5 = 206, so the partition is exhaustive and disjoint. The 5 type
positions, printed rather than described:

```
src/app/actions/live-class.ts:496
src/app/api/cron/sweep-orphan-uploads/route.ts:47
src/app/api/cron/sweep-orphan-uploads/route.ts:59
src/lib/research/db.ts:26
src/lib/weekly-announcement-run.ts:137
```

Of the 149 invocation lines, one is the declaration itself
(`src/lib/supabase/server.ts:126`), leaving **148 acquisition sites in 52
files**, plus the 2 `getDbClient()` acquisitions in section 1.3 =

> **THE POPULATION UNDER AUDIT: 150 service-role client acquisition sites across
> 54 files; 211 non-comment reference lines across 56 files.**

**A site is not the same as a query, and this is the whole reason the audit was
hard.** Measured over the 148 `createServiceClient` units
(`python scratch/helpers.py`, which reports a per-unit `direct-client` and
`helper-calls` line):

```
units that query directly (with or without helpers):     21
units that only delegate to receivers:                   109
units that do neither (bare accessor / pass-through):    18
total units:                                             148
```

So 127 of 148 sites contain no query at all. The idiom in this repo is: the
action acquires the client, then hands it to a library function that owns the
predicate - or, at 9 sites, returns a bare `(createServiceClient() as any)
.from("<table>")` handle for its own module's callers to scope. So the audit is
two-level (and at those 9, three-level), and every level is reported.

```
python scratch/helpers.py   # extracts, per site, every call whose first
                            # argument is the client, plus its second argument
# distinct helpers: 136
```

136 distinct receiver functions. Their second argument (the identity) is
literally `user.id` at 108 of them, `schedule.userId`/`trigger.userId` at 9
(cron/webhook, from the row), `userId` at 2, and something else at 17 - and
those 17 are where every finding in this document lives.

---

## 2. The tenant key, established from the migrations, not from the column name

`docs/loop/traps-spec.md` rules that a predicate on the wrong column contains
nothing, so every `user_id` claim below rests on the migration that created the
table. A Python pass over all 110 migration files
(`ls supabase/migrations | wc -l` -> 110) brace-matched every `create table`
block and reported whether it declares `user_id`:

```
python scratch/tenantkey.py | tail -n +2 | awk '{print $1, $2}' | sort -u
# 50 tables created across 110 migration files
# 45 declare user_id; 5 do not
```

A bare `grep -oiE "create table ... [a-z_]+"` over the same files reports 51,
because it matches the word `column` inside an `alter table ... add column`
statement. That is a one-off miscount of exactly the kind
`docs/loop/traps-spec.md` warns about, and the brace-matching parse is what is
reported here. **45 of the 50 declare `user_id uuid ... references auth.users
(id) on delete cascade`**, which is the tenant key, and the predicate column
every scoped query in section 3 uses. The five exceptions, each opened and read:

| Table | Tenant key | Established at |
|---|---|---|
| `app_users` | **`id`**, not `user_id` - `id uuid primary key references auth.users (id)` | `supabase/migrations/20261012000000_create_app_users.sql:175` |
| `cron_heartbeat` | **none, deliberately.** `id text primary key` is the tick's NAME | `20261007000000_cron_heartbeat.sql:34`; the migration's own comment at `:23-30` says "NOT user-scoped... there is no `user_id` to key on" |
| `glossary_terms`, `knowledge_entries`, `rubric_bank` | **none** - shared, deployment-wide reference libraries | `20260702000000_*`, `20260701000000_create_knowledge_entries.sql:21-46`, `20260704000000_*` |

(That is five names in three rows; 45 + 5 = 50.)

**A 51st table exists in code and in NO migration.** `accessibility_scans`
(`src/lib/supabase/accessibility.ts:11`) is created by
`src/lib/supabase/accessibility_scans.sql`, a file that lives under `src/`, not
under `supabase/migrations/`. Its own header says "Run once in the Supabase SQL
editor" and "Writes use the service-role key, so RLS is optional." Two
consequences, both findings-adjacent and both recorded in section 6 as Finding 5:
the GitHub Action that auto-applies migrations on push to main never creates it,
and it is **the only table in the schema with no RLS**:

```
grep -rhoiE "alter table (if exists )?(public\.)?[a-z_]+ enable row level security" \
  supabase/migrations | sed -E 's/.*table (if exists )?(public\.)?([a-z_]+) enable.*/\3/i' \
  | sort -u > rls.txt
wc -l < rls.txt                 # 50
comm -23 created.txt rls.txt    # empty: no created table lacks RLS
comm -13 created.txt rls.txt    # empty: no RLS line names a table created elsewhere
```

Both `comm` outputs are empty, so the two 50-name sets are IDENTICAL: **every
table the migrations create has RLS enabled there.** (`cron_heartbeat` is in the
50 and deliberately grants no insert/update policy at all - its own comment at
`20261007000000_cron_heartbeat.sql:26-30` says why: "a signed-in browser must
not be able to forge a heartbeat and make a dead scheduler look alive.")
`accessibility_scans` is therefore the only table in the tree with no RLS, and it
is the only one not in the migrations.

Its predicate is nonetheless correct: `user_id` is the first column of its
primary key (`src/lib/supabase/accessibility_scans.sql:18`), and all three
accessors filter on it (`accessibility.ts:43,60,95`) with `user.id` from
`requireOwner()` at `src/app/api/accessibility/route.ts:36`. **One stale
citation, reported not fixed (outside my write set):** `accessibility.ts:5` cites
the DDL at `supabase/accessibility_scans.sql`; that path does not exist
(`ls supabase/` returns only `config.toml` and `migrations/`).

---

## 3. The four-way classification, with counts

Counts computed, not eyeballed - a Python set pass over the 150 site keys with a
literal of every non-default label (`python scratch/classify.py`):

```
total acquisition sites: 150
S   129      scoped to the guard identity
SI  2        a predicate exists, its value is caller-supplied
DU  14       deliberately unscoped, control named
UU  5        unscoped and unexplained  <- the findings
sum: 150
```

### 3.1 SCOPED - 129 sites

The shape, verified at every one of the 129: the enclosing function calls a
guard (`requireUser()`, `requireAppOwner()`, or `requireOwner()`), binds its
return to `user`, and passes `user.id` - never a parameter - into a receiver that
applies `.eq("user_id", userId)` on a table whose migration declares `user_id`
as the `auth.users` FK, or writes `user_id: userId` into the inserted row.

Two representative pins, opened and read:

- `src/app/actions/artifact-templates.ts:21-26` - `requireOwner()` at `:21`,
  `createServiceClient()` at `:22`, `listArtifactTemplates(supabase, user.id, kind)`
  at `:26`; receiver at `src/lib/artifact-templates.ts:16-32` filters
  `.eq("user_id", userId)` at `:21`.
- `src/app/actions/workflow-support.ts:23-31` - one of the 21 inline queries;
  `.from("cartridge_drops").select("id").eq("user_id", user.id).eq("status", "new")`
  at `:26-31`.

**Every write payload was checked for the same property**, because an insert has
no predicate to inspect. A pass over 29 insert/upsert receivers
(`python scratch/writes.py`) prints each one's payload; all 22 `user_id` lines it
found read `user_id: userId` - the function's own parameter, never a field off a
caller-supplied object. The `onConflict` keys corroborate it:
`"user_id"`, `"user_id,institution"`, `"user_id,acronym"`, `"user_id,task_id"`,
`"user_id,institution,task_id"`, `"user_id,institution,scope_key"`.

**Three id-only mutators sit inside the SCOPED set and are worth naming**, because
they are scoped by a preceding read rather than by their own predicate:
`updateAvatarLikeness` (`src/lib/avatar-likeness.ts:282`, `.eq("id", id)`),
`deleteAvatarLikenessRow` (`:322`), `updateAvatarVideo` (`:373`). Every caller in
`src/app/actions/media-likeness.ts` first resolves ownership -
`getAvatarLikenessById(supabase, user.id, id)` at `:288`, `:350`, `:369`, and
`getAvatarVideoById(supabase, user.id, jobId)` at `:567` - and returns before
mutating when that read yields null. The module's own header states the contract
(`avatar-likeness.ts:265-266`: "scoped to id only (callers already resolve
ownership ... before mutating)"). I classify these SCOPED because a foreign id
cannot reach the write; the containment is a two-step invariant, not a predicate,
and nothing enforces it mechanically - see RES-A.

**The caller-supplied identifiers that turn out NOT to be a scoping hole**,
because they are intersected with a guard-scoped list rather than trusted:

- `resolveGenerationCourseRow(courseUrl, courseId, acronym)`
  (`src/app/actions/lms-generation-course-row.ts:44-47`) forwards to
  `resolveLmsCourseRowAction` / `resolveLmsCourseRowByIdAction`
  (`src/app/actions/lms-syllabus-buttons.ts:111,149`), both of which call
  `requireOwner()` then `listCourseHubAction()` and search its result. A foreign
  courseId is simply absent from that list.
- `readExportCourseContentById(supabase, courseId)`
  (`src/lib/lms-export-source/read-export-course-content.ts:172-182`) does the
  same - `listCourseHubAction()` at `:177`, `.find((c) => c.id === courseId)` at
  `:179`.
- `listCourseHubAction` itself (`src/app/actions/course-hub-core.ts:12-19`):
  `requireOwner()` at `:14`, `listCourseHubRows(user.id)` at `:15`, which is
  `listCourses` (`src/lib/supabase/courses.ts:60-70`), `.eq("user_id", userId)`
  at `:63`.

### 3.2 SCOPED BY CALLER-SUPPLIED INPUT - 2 sites

Called out individually, as the brief requires.

| Site | The predicate | Why this is not the hole it looks like |
|---|---|---|
| `src/lib/supabase/app-users.ts:311` `setAppUserStatus` | `.eq("id", id)` where `id` is the TARGET account, supplied by the request | This IS the admin surface's job. Its five entry points (`src/app/account/people/actions.ts:288,306,323,339,355`) each call `requireAppOwner()` - the real owner guard, not the alias - and route through `performAccountAction` (`:207`), which re-reads the target fresh (`getAppUser`, `:218`), recomputes `countEffectiveOwners()` (`:228`), and refuses on `canPerformAccountAction`'s verdict (`:250`) |
| `src/lib/supabase/app-users.ts:384` `setAppUserRole` | same | same |

### 3.3 DELIBERATELY UNSCOPED - 14 sites, each with its control named

| Sites | Operation | What makes it legitimate, and what enforces it |
|---|---|---|
| `src/app/api/cron/run-schedules/route.ts:121` | every user's due schedules, releases and triggers | `CRON_SECRET` bearer check at `:112-119`, which the route's own comment at `:107-111` calls "the entire trust boundary". Per schedule, identity is re-derived via `resolveImpersonationIdentity` (`:284`), which calls `resolveAccess` and returns null for a non-active account (`src/lib/supabase/owner-context.ts:170-191`) |
| `src/app/api/cron/sweep-orphan-uploads/route.ts:85` | `storage.list` / `storage.remove` across every user's prefix in `course-files` | same `CRON_SECRET` check at `:73-83`; the route's comment at `:71-74` states the blast radius explicitly ("a bulk delete across every user's Storage objects") |
| `src/app/api/github/webhook/route.ts:97` | `listEnabledRepoPushTriggers(supabase)` - all users' enabled repo-push triggers (`src/lib/workflow-triggers/store.ts:261-275`, predicates `event_type`/`enabled`/`unattended` only) | HMAC-SHA256 signature over the raw body, `timingSafeEqual`, at `:54-72`. Then per trigger: `auth.admin.getUserById(trigger.userId)` + `resolveImpersonationIdentity` at `:104-112` |
| `src/app/api/triggers/[token]/route.ts:52` | `findEnabledWebhookTrigger(supabase, token)` - lookup by `webhook_token` across all users (`store.ts:381-400`) | The token IS the credential, and it is strong: minted as two concatenated `crypto.randomUUID()` with hyphens stripped (`store.ts:21`) - 64 hex characters. The tenant identity then comes from the FOUND ROW (`trigger.userId`), never from the request |
| `src/lib/supabase/app-users.ts:137,198,417,459,726,982` (6) | `fetchAppUserRow`, `listAppUsers`, `countActiveOwners`, `countEffectiveOwners`, `ensureAppUser`, `ensureAppUserRowExists` | `listAppUsers` reads every row and has exactly one non-test caller, `listAccountPeople` (`src/lib/supabase/app-users-directory.ts:225`), itself reached only from `src/app/account/people/page.tsx:14`, which calls `requireAppOwner()` at `:80`. The other five are the AUTHORIZATION MECHANISM: `requireUser()` cannot decide whether an account may act without reading that account's row, so `fetchAppUserRow`/`ensureAppUser*` are called from `src/lib/supabase/auth.ts:165,260,340` and `src/lib/supabase/proxy.ts:313,352` with the session's own `user.id`. `countActiveOwners` has NO non-test caller at all (`grep -rn "countActiveOwners" src` outside its own file and the tests returns only comments) - dead code, not a surface |
| `src/lib/supabase/app-users-directory.ts:134` | `auth.auth.admin.listUsers()` - paginated over EVERY auth identity | Owner-gated through `listAccountPeople` as above. Capped at `MAX_AUTH_LIST_PAGES` and throws rather than returning a truncated list (`:159-166`) |
| `src/lib/research/glossary.ts:42`, `src/lib/research/rubric-bank.ts:47` (2) | `glossary_terms`, `rubric_bank` | Both tables have NO tenant column by construction (section 2) - they are deployment-wide caches of definitions and rubric text, not per-tenant rows. Every read and write is therefore correctly unscoped. What is NOT verifiable here is whether a rubric remembered from one instructor's assignment can be served to another: `rememberRubric(instructions, rubricText)` / `findRubricForTopic(instructions)` (`rubric-bank.ts:57,107`) are keyed on instruction TEXT, so yes by design. That is a product question, not a predicate defect - RES-D |
| `src/app/account/people/actions.ts:155` | `auth.admin.getUserById(accountId)` with a request-supplied `accountId` | Two gates ahead of it: `isOwnerEmail(email)` at `:151` returns false and short-circuits before the client is built, and the only caller is `performAccountAction`, reached only from the five `requireAppOwner()` exports. Returns one boolean (`email_confirmed_at` presence), never row data |

### 3.4 UNSCOPED AND UNEXPLAINED - 5 sites

These are the findings. Full detail in section 6.

| Site | Finding |
|---|---|
| `src/app/actions/course-task-attachments.ts:84` | F1 (the write half) |
| `src/lib/supabase/courses.ts:122` | F1 (the sink) |
| `src/app/api/lms-export/selection/route.ts:464` | F2 |
| `src/app/actions/automation-runs.ts:278` | F3 |
| `src/lib/research/db.ts:65` | F4 |

---

## 4. Coverage

> **150 of 150 acquisition sites (100%), and 211 of 211 non-comment reference
> lines (100%), of the population I derived in section 1.4.**

What "covered" means, stated so a checker can attack it: for each of the 150
sites I read the enclosing declaration's full source (extracted by
`python scratch/extract.py`, 10,613 lines of unit text), identified every
expression that receives the client, and then opened the definition of each of
the 136 distinct receivers and read its predicate or its write payload. Where a
receiver delegated further, I followed it (`loadWeeklyAnnouncementPlan` ->
`listScheduledAnnouncementRows`; `resolveQuestionScopeContext` ->
`fetchOrderedScopePages` -> `listInstitutionPages`; `toRunSummaries` ->
`listRecordingFilesForRuns`; `safeStartWorkflowRun` -> `startWorkflowRun`;
`buildLiveSessionStepRunHelpers` -> `buildServerMaterialLoaders`).

**The completeness net, because reading 150 sites is not a proof that I missed
none.** A mechanical sweep over every receiver module plus every population file
flagged each top-level declaration that contains a table query and NO tenant
predicate and no `user_id` write payload:

```
python scratch/sweep.py
# functions with a table query and NO tenant predicate/payload: 65
```

All 65 were opened. 26 are bare `table()` / `likenessTable()` / `stepsTable()`
accessors that return an unscoped handle by construction - for each, I audited
every consumer instead (16 consumers in `src/lib/supabase/courses.files.ts`, 12
in `courses.ts`, 6 in `microsoft-credentials.ts`, and so on; a scripted check
confirmed all 16 `table()` calls in `courses.files.ts` have `.eq("user_id",
userId)` within 14 lines, with zero exceptions). The remaining 39 are the cron
and webhook functions of section 3.3, the `app_users` functions, the
`research/db.ts` functions, and four latent hazards recorded as RES-A.

**This is 100% of the population I derived, not 100% of the service-role surface
of the app.** Section 7 names what remains outside it.

---

## 5. The pass conditions - object, instrument, direction of failure

Written for the wave that fixes findings 1-3. Each names three things.

**PC1 - the injected storage path must be refused at the write.**
Object: `createTaskAttachmentRow` (`src/lib/supabase/course-task-attachments.ts:214`).
Instrument: a vitest unit test in the idiom of
`src/lib/institution-page-attachments.test.ts`, calling the real export with a
fake client and `storagePath: "OTHER-USER/whatever.pdf"` while `userId` is
`"me"`. Direction: **FAILS if the call RESOLVES** (today it resolves and the row
is inserted). The positive case - a path under `${userId}/` - must still resolve,
or the test is a tautology that a blanket refusal would satisfy.

**PC2 - the injected path must be refused at the COURSE-FILE write too.**
Object: `appendCourseMaterialFileAction` and `appendCourseExportFileAction`
(`src/app/actions/course-hub-core.ts:159,258`). Instrument: the executing
guard-test idiom of `src/app/actions/grading.guard.test.ts:294-311` - mock
`@/lib/supabase/auth`'s client as an `active` non-owner, call the real export
with `file.path = "OTHER-USER/x.zip"`. Direction: **FAILS if the action returns
anything other than an error**. `parts` must be covered by the same assertion,
separately: `downloadCourseZipBlob` signs `file.parts` in preference to
`file.path` (`src/lib/course-files.ts:210`), so a fix that validates only `path`
leaves the hole open through `parts`.

**PC3 - the sink must refuse a path outside the caller's prefix even if a row
already holds one.** Object: `taskAttachmentStorageSweep.remove`
(`src/lib/supabase/course-task-attachments.ts:185`) and
`removeCourseZipObjects` (`src/lib/course-files.ts:287`). Instrument: a unit test
feeding a fake storage client and a path array mixing one in-prefix and one
out-of-prefix path. Direction: **FAILS if the out-of-prefix path is passed to
`remove`**. This is defence in depth on purpose: PC1 and PC2 close the two write
doors that exist today, and PC3 is what keeps the third one closed when a future
wave adds another writer - which is exactly how this class of defect got in.

**PC4 - the non-vacuity check that must accompany PC2.** Object: the very same
mocked `active` non-owner session PC2 uses. Instrument: `requireAppOwner()`
called directly on it. Direction: **FAILS if that call RESOLVES.** Without PC4 a
mis-built fake makes every PC2 assertion pass for the wrong reason;
`src/app/actions/grading.guard.test.ts:410` is the shipped instance.

**I did not run any of PC1-PC4, and I am not claiming they pass or fail.** My
write set for this pass is this one document, so I cannot add a test to `src/`,
and I cannot mutate `src/` to show a proposed instrument turning red.
`docs/loop/traps-spec.md` records four instruments in this repo that claimed more
than they measured and were each caught by RUNNING them. **The mutation each
instrument must turn red on, named so the next wave can check I am not proposing
an unrunnable instrument:** delete the validation line PC1 adds, and PC1 must go
red; change `isInstitutionAttachmentStoragePath`'s `startsWith(prefix)` to
`includes(prefix)` and PC2's `parts` case must go red; change PC3's filter from
`startsWith` to a truthiness check and PC3 must go red.

**What I DID run.** The seven executing test files that bear on the guard facts
this audit rests on, through the wrapper `docs/loop/this-repo.md:40-45` mandates
for any multi-path check:

```
npm run test:paths -- src/lib/supabase/auth.test.ts \
  src/app/actions/action-guard-coverage.test.ts \
  src/lib/announcement-exemplars.test.ts src/lib/recording-files.test.ts \
  src/lib/course-intel/history.test.ts src/app/actions/grading.guard.test.ts \
  src/lib/no-emojis.test.ts

 Test Files  7 passed (7)
      Tests  160 passed (160)

COVERED src/lib/supabase/auth.test.ts                  files=1 passed=38
COVERED src/app/actions/action-guard-coverage.test.ts  files=1 passed=15
COVERED src/lib/announcement-exemplars.test.ts         files=1 passed=14
COVERED src/lib/recording-files.test.ts                files=1 passed=15
COVERED src/lib/course-intel/history.test.ts           files=1 passed=40
COVERED src/app/actions/grading.guard.test.ts          files=1 passed=20
COVERED src/lib/no-emojis.test.ts                      files=1 passed=18
```

All seven arguments credited. `no-emojis.test.ts` is included because it owns
this repo's emoji rule including its one authorized exception, and hand-rolling
that scan is forbidden (`grep -P` here exits 0 without checking).

**The instrument that does NOT exist, measured.** 22 of 1159 test files assert on
a `"user_id"` value at all:

```
grep -rln 'expect' src --include=*.test.ts | xargs grep -ln '"user_id"' | wc -l
# 22
find src -name '*.test.ts' | wc -l            # 1159
(Get-ChildItem -Recurse -Path src -Filter *.test.ts | Measure-Object).Count   # 1159
```

Both file-counting instruments agree at 1159. So the tenant-predicate idiom is
enforced by an executing test for roughly 22 of the ~40 receiver modules and by
nothing for the rest, and **no test anywhere asserts the invariant across the
population** - there is no "every service-role query carries a tenant predicate"
structure test. That absence is RES-B, not a finding, because the audit in this
document is what a structure test would have produced and the 129 scoped sites
are in fact scoped.

---

## 6. Findings

### FINDING 1 - CROSS-TENANT STORAGE DELETE, reachable by any approved non-owner. Severity: HIGH.

**What a non-owner can do:** permanently delete arbitrary objects belonging to
any other account - including the owner's - from the private `course-files`
bucket. That bucket holds course materials zips, Castletop and misc files, LMS
export cartridges, uploaded syllabi, rubric images and task-cell attachments
(`grep -rn '"course-files"' src` - `src/lib/course-files.ts:76,84,126,171,293`,
`src/lib/syllabus-upload-source.ts:209`,
`src/lib/supabase/course-task-attachments.ts:150`,
`src/app/components/tasks/TaskAttachmentsDialog.tsx:42`).

**The exact path from a guard to the query.**

1. `src/lib/supabase/auth.ts:451-453` - `requireOwner()` is now `return requireUser();`.
   Its own doc comment at `:437-450` says so: "DELIBERATELY LESS RESTRICTIVE ...
   a tracked, temporary state". So every `requireOwner()` site below admits any
   `active` account, not only the owner.
2. `src/app/actions/course-task-attachments.ts:66-99`,
   `createTaskAttachmentAction(input)`. A `"use server"` export (`:1`), so it is
   an RPC endpoint reachable directly, not only through the dialog that normally
   calls it. Guard `requireOwner()` at `:83`. The ONLY validation of
   `input.storagePath` is non-emptiness, at `:79-81`. It is forwarded verbatim at
   `:92`.
3. `src/lib/supabase/course-task-attachments.ts:214-237`,
   `createTaskAttachmentRow(supabase, userId, input)` writes
   `storage_path: input.storagePath` at `:227`. **No path validation of any
   kind.** Contrast its own documented mirror,
   `insertInstitutionPageAttachmentRow`
   (`src/lib/institution-page-attachments.ts:388-396`), which refuses at `:394`:
   `if (!isInstitutionAttachmentStoragePath(userId, pageId, input.storagePath)) throw`.
4. `src/app/actions/course-hub-core.ts:48-57`, `deleteCourseHubAction(id)`.
   Guard `requireOwner()` at `:50`; `deleteCourseRow(user.id, id)` at `:52`.
5. `src/lib/supabase/courses.ts:121-129`, `deleteCourse(userId, id)`:
   `createServiceClient()` at `:122`,
   `listTaskAttachmentStoragePathsForCourse(supabase, userId, id)` at `:123`
   (correctly scoped - it returns the ATTACKER'S OWN rows, which is the point),
   then `taskAttachmentStorageSweep.remove(supabase, storagePaths)` at `:124`.
6. `src/lib/supabase/course-task-attachments.ts:184-196`:
   `supabase.storage.from(ATTACHMENT_STORAGE_BUCKET).remove(chunk)` at `:188`,
   bucket `"course-files"` at `:150`, on the SERVICE-ROLE client.

**Why RLS does not save it.** The bucket's containment is a per-user first path
segment, and nothing else:

```
supabase/migrations/20260722000000_course_materials.sql:31-33
  create policy "Users delete own course-file objects"
    on storage.objects for delete
    using (bucket_id = 'course-files' and (storage.foldername(name))[1] = auth.uid()::text);
```

The service-role client bypasses `storage.objects` policies exactly as it
bypasses table RLS (`src/lib/supabase/server.ts:122-124`). So the prefix
invariant the policy expresses must be re-enforced in application code at the
service-role boundary, and at step 6 it is not.

**The attack, in two calls.** `createTaskAttachmentAction({ id: <uuid>,
courseId: <my own course id>, taskId: "x", fileName: "x", mimeType: null,
sizeBytes: 1, storagePath: "<victim-uuid>/<object>" })`, repeated once per target
object; then `deleteCourseHubAction(<my own course id>)`. Step 5 collects the
injected paths because they are on rows whose `user_id` is the attacker's own,
and step 6 deletes them. The attacker loses one of their own course tiles; the
victim loses files. `deleteCourse` throws on a failed removal rather than
proceeding (`course-task-attachments.ts:189-193`), which means a nonexistent
target aborts the run - an existence oracle as well.

**What it is not.** Not remote code execution, not a credential disclosure, and
not reachable by an unauthenticated visitor: `SIGNUP_MODE` defaults to
`approval` (`docs/multi-user-login-architecture.md:426-431` records this as the
containment for shared spend), so the attacker needs an approved account first.

### FINDING 2 - CROSS-TENANT STORAGE READ through a service-role signed URL. Severity: HIGH, with impact honestly bounded.

**The same root cause, a different sink.**
`src/app/actions/course-hub-core.ts:258-273`,
`appendCourseExportFileAction(courseId, file)`: guard `requireOwner()` at `:263`,
and `file` is `{ name, path, size, parts?, generated? }` with **no validation of
`path` or `parts` at all** - `{ ...file, addedAt: new Date().toISOString() }`
goes straight to `appendCourseExportFile` (`src/lib/supabase/courses.files.ts:237`),
which persists it into `course_hub.export_files` under the caller's own row
(`.eq("user_id", userId)` at `:244` - correctly scoped, and irrelevant to the
defect).

Then:

1. `src/app/api/lms-export/selection/route.ts:324` `requireOwner()`; `:464`
   `const supabase = createServiceClient()`; `:465`
   `readExportCourseContentById(supabase, courseId)`.
2. `src/lib/lms-export-source/read-export-course-content.ts:172-182` resolves the
   attacker's OWN course row through `listCourseHubAction()` (correctly), then
   `readExportCourseContentForRow(supabase, course)`.
3. `:84` `const file = latestSourceExportFile(course)`. That selector
   (`src/lib/courses-table-helpers.ts:631-635`) filters out only entries with
   `generated === true` (`:621-623`) and then takes the greatest `addedAt`.
   `generated` is optional and the attacker omits it; `addedAt` is stamped
   server-side at append time, so **the injected entry is always the one
   selected**.
4. `:89` `downloadCourseZipBlob(supabase, file)` ->
   `src/lib/course-files.ts:205-243`, which prefers `file.parts` over `file.path`
   at `:210` and calls `getCourseZipUrl(supabase, p)` at `:226` ->
   `supabase.storage.from("course-files").createSignedUrl(path, 3600)` at `:171`,
   on the SERVICE-ROLE client. The bucket's SELECT policy
   (`20260722000000_course_materials.sql:15-17`) is bypassed.
5. `src/lib/course-files.ts:230` `res = await fetch(url)` retrieves the victim's
   bytes into the server process.

**Bounding the impact honestly, because this is where it would be easy to
overclaim.** The bytes are then handed to `parseCartridgeBlob`
(`read-export-course-content.ts:90`). For a
target that is not a ZIP container, `JSZip.loadAsync` throws and the route
returns an error naming the path and the underlying failure
(`read-export-course-content.ts:103-105`) - which is a reliable
existence-and-readability oracle over another tenant's object keys, but not
content. For a target that IS a ZIP container - every `.imscc` cartridge, every
materials zip this app writes, and every `.docx`/`.pptx`/`.xlsx`, which are ZIP
containers - the archive opens, and how much of its content reaches the response
depends on `adaptCartridgeToCourseContent` finding cartridge structure. **I could
not determine how much content a non-cartridge ZIP yields through this route**,
because that requires running the route against real Storage, and this checkout
has no `.env` and blocks the network under vitest. A victim's course export
cartridge, however, is exactly the shape this path is built to parse, so for that
target the read is a full content disclosure.

The same primitive exists for `appendCourseMaterialFileAction` (`:159`) and
`appendCourseCastletopFileAction` (`:192`) and `appendCourseMiscFileAction`
(`:225`) - all four appenders take an unvalidated `path`.

### FINDING 3 - a second cross-tenant Storage DELETE, through the workflow zip-log completion path. Severity: MEDIUM (same impact as F1, more steps).

`src/app/actions/automation-runs.ts:277-279`: `requireOwner()`,
`createServiceClient()`, `completeCourseZipRunLogs(supabase, user.id, runId, ok, refs, detail)`.
Down to `src/lib/workflows/zip-run-log-completion.ts:159-220`,
`completeCourseZipRunLog`:

- `:169` finds the attacker's own tile via `listCourseHubAction()` (correct).
- `:171` `const entry = tile.materialsFiles.find((f) => f.name === ref.fileName)` -
  `ref` is caller-supplied, and `materialsFiles` is the list
  `appendCourseMaterialFileAction` writes without validation.
- `:174` `downloadCourseZipBlob(supabase, { path: entry.path })` - the F2 read,
  again, on the service-role client.
- `:208` `appendCourseMaterialFileAction(ref.courseId, { name: ref.fileName, path, size })`
  returns `replacedPath`, the path of the same-named entry it displaced
  (`courses.files.ts:259` collects it) - i.e. **the path the attacker injected**.
- `:211-213` `if (r.replacedPath) { await removeCourseZip(supabase, r.replacedPath); }`
  -> `removeCourseZipObjects` (`src/lib/course-files.ts:287-296`) ->
  `supabase.storage.from("course-files").remove(paths)` at `:292-294`, and that
  one swallows every error (`.catch(() => {})` at `:295`), so the delete is
  silent.

Listed separately from F1 because a fix that only validates
`createTaskAttachmentRow` leaves this one open, and because its sink is a
different function in a different module.

### FINDING 4 - a shared reference library is mutable by any approved account, under a guard whose own comments say owner. Severity: MEDIUM.

`src/lib/research/db.ts:313-327` `verifyKnowledgeEntry(id, edits)` and `:329-338`
`deleteKnowledgeEntry(id)` operate on `knowledge_entries` with `.eq("id", id)`
only, through the service client obtained at `:65`. That is correct: the table has
NO tenant column (section 2), so there is no predicate to add.

**The defect is the control, not the predicate.** The module's own section header
at `:282` reads "Owner curation"; `:284-286` says "awaiting review"; the action's
doc comment at `src/app/actions/research.ts:56` says "awaiting the owner's
review". The shipped guard on both exports is `requireOwner()`
(`src/app/actions/research.ts:61` inside `listUnverifiedKnowledgeAction`, and
`:81` inside `reviewKnowledgeEntryAction`), which is `requireUser()`. So **any
approved non-owner can read every unverified entry and permanently delete any
entry in the deployment's shared knowledge library**, including the curated
seed. `deleteKnowledgeEntry` returns a boolean and never throws, so the caller
reports success either way.

Impact is to SHARED state, not to another tenant's private data: the table is
seeded from in-repo curated entries and grown by the research loop's web
retrieval (`upsertKnowledge`, `:236`, called from
`src/app/actions/case-study-research.ts:33`), so it holds reference material, not
per-tenant rows. `rubric_bank` (`rubric-bank.ts:57,107`) carries the same
no-tenant-column shape but has no delete surface.

### FINDING 5 - one table is outside the migration system and has no RLS. Severity: LOW to MEDIUM, conditional.

`accessibility_scans`. Its DDL is `src/lib/supabase/accessibility_scans.sql`, not
a migration, so the auto-apply GitHub Action never creates it, and its own header
says to run it by hand in the SQL editor. It is the only table in the tree with
no `enable row level security`, and its header says so: "Writes use the
service-role key, so RLS is optional."

The service-role path through it is correctly scoped (`accessibility.ts:43,60,95`,
all three filter `user_id`, from `requireOwner()`'s `user.id` at
`src/app/api/accessibility/route.ts:36`). **The exposure, if the table exists in
production, is the OTHER client:** with no RLS, anyone holding the
`NEXT_PUBLIC_SUPABASE_ANON_KEY` - which ships to every browser by definition -
could select every tenant's rows directly. Those rows hold Canvas item ids,
titles and accessibility issue text per course. **Whether the table exists in
production is an owner fact I cannot determine** (no live database here), which
is why the severity is conditional and stated as a range.

---

## 7. What I could not determine

- **Whether a `..` segment in a Supabase Storage object key is normalized.**
  `isInstitutionAttachmentStoragePath`
  (`src/lib/institution-page-attachments.ts:265-268`) requires
  `storagePath.startsWith(`${userId}/${pageId}/`)` and nothing more, so
  `"<me>/<page>/../../<victim>/x.pdf"` passes it. Whether that key resolves to
  the victim's object depends on how Storage and the HTTP layer treat `..` in the
  object path, which needs a live bucket. This is RES-C, and it is the one place
  where an otherwise-correct validator might not be sufficient.
- **How much content Finding 2 actually yields for a non-cartridge ZIP.** Stated
  in the finding. Needs a live bucket and a real object.
- **Whether `accessibility_scans` exists in production, and whether the storage
  bucket policies quoted in section 6 are actually applied there.** Migrations
  auto-apply on push to main, so the bucket policies almost certainly are; the
  hand-run SQL file almost certainly is not. Neither is checkable from here.
- **Whether `knowledge_entries` or `rubric_bank` hold anything a tenant would
  consider private.** Their contents are a production fact.
- **Anything about rendered behaviour.** vitest here is node-env and collects
  only `src/**/*.test.ts`; no component is rendered by any test
  (`docs/loop/this-repo.md:112-118`). Every reachability statement in this
  document is a source-READING claim about guards and call paths.
- **Whether a service-role query exists on a path no `src/` file names** - a
  build step, an edge function, or a library that reads `process.env` itself.
  Section 1.4's population is a floor over `src/`.
- **Whether the two `SCOPED BY CALLER-SUPPLIED INPUT` sites' refusal rule
  (`canPerformAccountAction`) is itself correct.** I verified it is CONSULTED and
  that a refusal short-circuits; I did not audit the rule's own logic, which is
  `src/lib/account-people-view.ts`'s subject and out of this pass's scope.

---

## 8. Attacks I tried that did not work

An audit with no attempted attacks is not an audit. Each of these was a real
attempt to find a cross-tenant read or write, and each failed for the stated
reason.

1. **Forge a `userId` into the service-role writing-style read.**
   `getWritingStyleBlock(userId)` (`src/app/actions/writing-style-block.ts:9-11`)
   builds a service client and calls `getUserStyle(supabase, userId)`. All 16
   non-test callers pass `user.id` from their own guard; the one that does not
   name a guard, `src/app/api/ai-chat/route.ts:492`, derives `userId` from
   `supabase.auth.getUser()` at `:430-432`. No path supplies it from the request.
2. **Read another tenant's decrypted Canvas token.**
   `getLmsCredentialSecret(userId, institution)`
   (`src/lib/lms-credentials.ts:208-222`) returns a decrypted token. Two callers:
   `src/lib/canvas-credentials.ts:160`, reached from `resolveCanvasCredential`
   (`:191`), which takes its identity from `getEffectiveIdentity()` and NEVER a
   parameter; and `src/app/account/integrations/lms-actions.ts:342`, which uses
   `actor.id` from `requireUser()` at `:328`. The AAD binding
   (`rowAad(userId, institution)`, `lms-credentials.ts:121-123`) means a
   ciphertext only authenticates under the pair it was written for, so even a
   forged read would fail to decrypt.
3. **Pass a foreign `courseId` to the LMS generation and export actions.** Closed
   by `listCourseHubAction()` intersection at every entry - section 3.1.
4. **Point an institution-page attachment row at another tenant's object.**
   Refused at `src/lib/institution-page-attachments.ts:394`. This is the control
   Finding 1's module lacks, and finding it here is what made the absence in
   `course-task-attachments.ts` visible.
5. **Sign another tenant's task-attachment path.** The only signing call for that
   table is `src/app/components/tasks/TaskAttachmentsDialog.tsx:406-408`, on the
   BROWSER client, where the bucket SELECT policy applies. There is no
   service-role signer for `course_task_attachments.storage_path`.
6. **Mutate an avatar likeness or video by a foreign id.** All four id-only
   mutators are preceded by a `user.id`-scoped read that returns before the
   write - section 3.1.
7. **Fire another tenant's webhook trigger.** 64 hex characters from two
   `randomUUID()` draws (`src/lib/workflow-triggers/store.ts:21`).
8. **Reach the account-admin surface as a non-owner.** All five exports and the
   page itself call `requireAppOwner()`, not the alias - section 3.2.
9. **Forge a cron heartbeat to make a dead scheduler look alive.** The table has
   RLS with no insert/update policy at all, deliberately
   (`20261007000000_cron_heartbeat.sql:23-30`), and the only writer is behind
   `CRON_SECRET`.
10. **Write an `ai_chat_messages` row under another tenant's id.**
    `logChatMessage` (`src/lib/supabase/chat-logs.ts:23-45`) does take
    `userId` as a parameter and inserts it at `:35`. All three callers
    (`src/app/actions/llm-tools.ts:286,335`, `src/app/api/ai-chat/route.ts:675`)
    pass a session-derived id, and **nothing in `src/` ever reads the table**
    (`grep -rn "ai_chat_messages" src` returns only the writer and the generated
    types), so there is no read-back to exploit even if a forged row landed.
11. **Use the four id-only mutators that have NO ownership pre-read.**
    `renameRecordingFile` (`src/lib/recording-files.ts:193`),
    `deleteRecordingFile` (`:212`), `deleteDeckTemplate`
    (`src/lib/deck-templates.ts:60`), `deleteWorkflowDef`
    (`src/lib/workflow-defs.ts:57`). Every non-test caller is a client component
    using the RLS-bound browser client
    (`src/app/components/FilesTab.tsx:272,388,507`,
    `src/app/components/caption-studio/PreviewExport.tsx:188`,
    `src/app/components/ppt-design/index.tsx:350`,
    `src/app/components/workflows/WorkflowPanel.tsx:462,496`), and both tables
    carry `for delete using (auth.uid() = user_id)`
    (`20260820000000_create_deck_templates.sql:36-39`,
    `20260725000000_create_workflow_defs.sql:33-36`). They are latent, not live -
    RES-A.
12. **Read another tenant's course row through the exported unscoped table
    handle.** `src/lib/supabase/courses.row.ts:32` exports
    `table()` returning a bare `.from("course_hub")`. Its only two importers are
    `courses.ts:35` and `courses.files.ts:5`, and all 12 + 16 consumer queries
    apply `.eq("user_id", userId)` - measured, not read: a scripted check over
    `courses.files.ts` reports `table() calls: 16` and
    `without user_id in next 14 lines: []`.

---

## 9. Disposition of the prior requirements this document consumes

| Prior requirement | Where | Disposition |
|---|---|---|
| **RES-2**: "That all 206 non-comment `createServiceClient` references across 54 files scope their queries on the caller's own id. I verified the idiom at `lms-credentials.ts:215` and nothing more." | `docs/owner-private-secrets.md` section 10 | **DISCHARGED, and the answer is mostly yes with five exceptions.** 129 of 150 acquisition sites are scoped to the guard identity; 2 are the owner-gated admin surface; 14 are deliberately cross-tenant with a named control; 5 are findings. The population figure was right and its files were right; what it could not see is the `getDbClient()` alias (section 1.3). **The premise it was framed under - that the predicate is the containment - is where it was incomplete: for Storage there is no predicate, and that is where all three cross-tenant primitives live.** |
| RES-2's proposed instrument: "a source-shape test asserting every service-client query in a `"use server"` file carries an `.eq("user_id"` or an equivalent predicate" | same | **WITHDRAWN as specified, REPLACED by PC1-PC4.** Reason: the shape it describes would have passed on all five findings. Findings 1-3 are Storage operations with no query and no predicate to inspect; Findings 4-5 are tables with no tenant column, where an `.eq("user_id"` assertion would be wrong. A source-shape test over `"use server"` files also cannot see `src/lib/**`, where 136 of the 136 receivers live. Enforcer it protected: nothing - it was never built. |
| RES-1: "`ELEVENLABS_VOICE_ID` ... is contained nowhere", with `resolveNarrationVoiceId`'s step 3 having "no `identity.role === "owner"` check" | `docs/owner-private-secrets.md` section 4.1 and RES-1 | **ALREADY FIXED IN THE TREE, and the criterion document is now stale on this point.** `src/app/actions/media-voice.ts:265-289` now takes `role: AppUserRole | undefined` and gates the env fallback on `if (role === "owner")` at `:283`; both callers pass `user.role` (`:328`, `:354`). The doc comment at `:255-264` cites RULING 125 and the `canvas-credentials.ts:220` shape. Discharging commit: `ddc8c30`, "fix(media): the owner's cloned voice is no longer reachable by any signed-in account". Recorded here rather than edited into that file, which is outside my write set. |
| "The predicate idiom is real: `src/lib/lms-credentials.ts:215` filters `.eq("user_id", userId)`" | `docs/owner-private-secrets.md` section 4.3 | **KEPT, and generalized.** The line is now at `:215` still (`getLmsCredentialSecret`'s `.eq("user_id", userId)`), and the idiom holds at 129 of 150 sites, not just this one. |
| "Containment is the QUERY PREDICATE, per call" | same row | **KEPT FOR TABLES, INSUFFICIENT AS STATED.** Section 6 is three counterexamples where the query predicate is correct and a Storage path is the uncontained thing. Any future wave quoting that sentence must read it as "per call, for rows" and add "and the storage prefix, for objects". |
| "A full audit of those 206 lines is NOT something I did" | same row | **HONEST AND CORRECT.** Saying so is what made this pass possible; had it claimed coverage, nobody would have looked. |

No prior version of `docs/service-role-predicate-audit.md` exists
(`ls docs/service-role-predicate-audit.md` -> No such file or directory before
this pass), so nothing in this file is a restructuring of an earlier one.

---

## 10. Residual register

Each entry names an owner, an instrument, and the step that will measure it. An
entry missing any of the three is a deletion, and I have called none of these
that.

| Id | What is not proven now | Owner | Instrument | Step that will measure it |
|---|---|---|---|---|
| RES-A | Four exported id-only mutators (`renameRecordingFile` `recording-files.ts:193`, `deleteRecordingFile` `:212`, `deleteDeckTemplate` `deck-templates.ts:60`, `deleteWorkflowDef` `workflow-defs.ts:57`) are contained today ONLY because every caller uses the RLS-bound browser client. Their signatures accept any `SupabaseClient<Database>`, so one future service-role caller removes the containment with every gate green - the exact shape Findings 1-3 already are | repo owner to schedule; the fixing wave implements | A source-shape test in the `src/lib/use-server-exports.test.ts` idiom (detector, canary on known-bad AND known-good, then the scan): assert that no file containing `createServiceClient` imports any of those four names. Direction: FAILS if such an import appears. Canary: plant the import in a fixture string and prove the detector fires | The next wave that touches any of those four modules, or the Finding 1-3 remediation wave, whichever lands first |
| RES-B | No instrument anywhere asserts the tenant-predicate invariant across the population. 22 of 1159 test files assert on a `"user_id"` value; roughly 18 of ~40 receiver modules have no predicate test at all. This document is the audit a structure test would have produced, and it expires the moment a site is added | repo owner to schedule | Per-receiver-module executing tests in the idiom of `src/lib/announcement-exemplars.test.ts:150-161`, which captures the fake client's filters and asserts both `toContainEqual(["user_id", "user-a"])` AND `not.toContainEqual(["user_id", OTHER_USER])` - the second half is what makes it non-vacuous | Each wave that adds a service-role receiver owes its own; a sweep over the ~18 uncovered modules is a separate, schedulable row |
| RES-C | Whether `isInstitutionAttachmentStoragePath` (`institution-page-attachments.ts:265-268`) is sufficient, given that it accepts a path containing `..` segments after the required prefix. Its sufficiency turns on how Supabase Storage treats `..` in an object key, which no test in this repo can observe | repo owner - it needs a live bucket - for the empirical half; a wave can add the defensive half unconditionally | Two parts. (a) A unit test asserting the validator returns false for any path containing a `..` path segment; direction: FAILS if it returns true, which it does today. (b) The owner's own check against the real bucket. (a) is worth landing regardless of (b)'s answer, because a validator that refuses `..` is correct under either outcome | The Finding 1-3 remediation wave lands (a). (b) is owner-only |
| RES-D | Whether `rubric_bank` and `knowledge_entries` serving one instructor's remembered rubric text to another instructor is intended. `rememberRubric(instructions, rubricText)` / `findRubricForTopic(instructions)` (`rubric-bank.ts:57,107`) are keyed on instruction TEXT across the whole deployment, by design, and the table has no tenant column | repo owner - it is a product decision about whether a rubric is shared reference material or a tenant's own work | None exists to build until the decision is made. If the answer is "tenant-private", the instrument is a migration adding `user_id` plus predicate tests in the RES-B idiom; if "shared", the instrument is a line in the product copy saying so | Not a wave. An owner decision, then one of the two shapes above |
| RES-E | Whether `accessibility_scans` exists in production and whether RLS was enabled on it by hand. If it exists without RLS, the browser's anon key can read every tenant's rows | repo owner - no live database here | The owner's own `select` against the table with the anon key. If it returns another account's rows, the fix is a migration (moving the DDL under `supabase/migrations/` so it auto-applies) plus the four own-row policies every sibling table has | Owner-only for the observation. The migration move is a schedulable wave regardless, since a table nobody can auto-apply is a table that is silently absent |
| RES-F | Whether the 148 `createServiceClient` acquisition sites remain 148. This document's population is a measurement of one commit, `28bc0c5`, and section 1.2's count is the thing every classification in section 3 ranges over | each wave that adds a service-role site | Re-run section 1.2's two commands and diff the count. Direction: any increase means section 3's counts are stale and the new site is unclassified | Every wave's own gate, in the same turn it adds the site |

---

## 11. Every quantity, with the command that produced it

Run from the repo root at `28bc0c5`. `PF` abbreviates
`cat prod_files.txt | tr '\n' '\0' | xargs -0`. Scripts named `scratch/*.py`
were written to this session's scratchpad, not to the repo.

| Quantity | Command | Value |
|---|---|---|
| Production files scanned | `wc -l < prod_files.txt` | 1602 |
| `createServiceClient` references, non-comment | `PF grep -nE 'createServiceClient' \| grep -vE ':[0-9]+:\s*(//\|\*\|/\*)' \| wc -l` | 206 |
| ... files | same, `\| cut -d: -f1 \| sort -u \| wc -l` | 54 |
| Comment lines the filter removed | same, `\| grep -cE ':[0-9]+:\s*(//\|\*\|/\*)'` | 14 |
| import lines within the 206 | `grep -cE 'import .*createServiceClient\|from "@/lib/supabase/server"\|from "\.\./server"\|from "\./server"'` | 52 |
| `createServiceClient(` invocation lines within the 206 | `grep -cE 'createServiceClient\('` | 149 |
| type-position lines within the 206 | the residue, printed in section 1.4 | 5 |
| Partition check | 52 + 149 + 5 | 206 |
| Acquisition sites (invocations minus the declaration) | 149 - 1 | 148 |
| ... files | `cut -d: -f1 sites.txt \| sort -u \| wc -l` | 52 |
| `getDbClient` references, non-comment | `PF grep -nE '\bgetDbClient\b' \| grep -vE ':[0-9]+:\s*(//\|\*\|/\*)'` | 5 lines, 3 files |
| **Total acquisition sites under audit** | 148 + 2 | **150** |
| **Total non-comment reference lines** | 206 + 5 | **211** |
| **Total files** | 54 + 2 new | **56** |
| Other `createServerClient` / supabase-js constructions | `PF grep -nE 'createServerClient\|from "@supabase/supabase-js"\|from .@supabase/ssr.' \| grep -vE ':[0-9]+:\s*(//\|\*\|/\*)'` | 88 lines, 4 real constructions, 1 of which reads the service key |
| Distinct receiver functions taking the client as arg 1 | `python scratch/helpers.py` | 136 |
| Classification counts | `python scratch/classify.py` (set pass over 150 site keys + a literal of every non-default label) | 129 S / 2 SI / 14 DU / 5 UU, sum 150 |
| Migration files | `ls supabase/migrations \| wc -l` | 110 |
| Tables created in migrations | `python scratch/tenantkey.py`, brace-matched `create table` blocks | 50 (a bare `grep -oiE` says 51 - it matches `column`) |
| ... declaring `user_id` | same, `\| grep -c " user_id$"` | 45 |
| ... not declaring it | same, `\| grep " NO-UID$"` | 5: `app_users` (key `id`), `cron_heartbeat`, `glossary_terms`, `knowledge_entries`, `rubric_bank` |
| Tables with `enable row level security` in migrations | `grep -rhoiE "alter table ... enable row level security" supabase/migrations \| sed -E ... \| sort -u \| wc -l` | 50 |
| The two sets are identical | `comm -23 created.txt rls.txt` and `comm -13 created.txt rls.txt` | both empty |
| Tables in the tree with no RLS | `accessibility_scans`, DDL at `src/lib/supabase/accessibility_scans.sql`, absent from `supabase/migrations` | 1 |
| Functions with a table query and no tenant predicate/payload, across every receiver module | `python scratch/sweep.py` | 65, all 65 opened |
| `table()` calls in `courses.files.ts` | scripted 14-line window check | 16, zero without `user_id` |
| Test files asserting on a `"user_id"` value | `grep -rln 'expect' src --include=*.test.ts \| xargs grep -ln '"user_id"' \| wc -l` | 22 |
| Total vitest test files | `find src -name '*.test.ts' \| wc -l` | 1159 |
| ... second instrument | `(Get-ChildItem -Recurse -Path src -Filter *.test.ts \| Measure-Object).Count` | 1159 |
| Tests run for this document | `npm run test:paths -- <7 paths>` | 7 files / 160 tests passed, one `COVERED` line per argument (section 5) |
| Coverage | 150 of 150 acquisition sites; 211 of 211 reference lines | 100% of the derived population |
| Unit shapes across the 148 `createServiceClient` units | `python scratch/helpers.py` | 21 query directly / 109 delegate only / 18 neither; 9 of those 18 are bare `table()` handles |
| This file's size | `wc -l docs/service-role-predicate-audit.md` | 895 at the last citation repair; the repair that recorded it added 0 lines, so re-measure rather than trusting this row |
| This file's size, second instrument | `@(Get-Content docs/service-role-predicate-audit.md).Count` | 895, agreeing with `wc -l` |
| Doc gates re-run after the last edit | `npm run test:paths -- src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts` | 2 files / 21 tests passed; both `COVERED`. `no-emojis.test.ts:254` scans `roots = ["src", "docs"]` including `.md`, so this file was in scope |

Two line-counting instruments are reported because they disagree by 15 to 138 on
real files in this repo (`docs/loop/this-repo.md:5-12`), and a gap you have not
measured on THIS file is not 42.

**Tree state.** `git status --short` at hand-off shows exactly one entry,
`?? docs/service-role-predicate-audit.md`. No file under `src/` or `supabase/`
was modified by this pass; every measurement above is a read, and no guard was
touched.
