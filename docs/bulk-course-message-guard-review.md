# sendBulkCourseMessageAction: is requireUser() the right guard? (security scope, read-only)

Seat: loop-seat security pass. Author tier: Sonnet. Not yet checked - a fresh
`loop-checker` reads this before any guard change ships. No production or test
file was edited; the only file written is this one. A throwaway driver script
lives in the session scratchpad (outside the repo) and is described under
"Instruments".

## 0. Verdict in four lines

1. **Keep `requireUser()`. Do not change the guard.** The action cannot call any
   GitHub code, and everything it can actually do is scoped to the caller's own
   course row and the caller's own Canvas credential.
2. **The GitHub reachability is import-only, by two independent routes.** Neither
   route is on the action's call path (section 2). It is the same "barrel
   artifact" class R4 already ruled on (RULING 84).
3. **The only missing thing is the paperwork, not the guard**: the file is parked
   in `GITHUB_FILES_PENDING_ENUMERATION` "route not traced here"
   (`src/app/actions/action-guard-coverage-github-cohort.test.ts:625-638`).
   Section 6 is the small wave that closes it.
4. **A correction to the brief's framing of Q-1 and R2** (section 5): Q-1 is not a
   guard question and this action is not an R2 call site. It folds into R4's
   enumeration, not R2.

## 1. Current state

| Fact | Evidence (opened) | Command / instrument |
|---|---|---|
| The action is guarded by a literal `requireUser()` as its first statement | `src/app/actions/bulk-course-message.ts:9` (import), `:52` (`const user = await requireUser();`) | read; `grep -c "requireOwner" src/app/actions/bulk-course-message.ts` -> `0` |
| It never touches `requireAppOwner` or the deprecated alias | same grep, `requireAppOwner` also absent (`grep -n "requireOwner\|requireAppOwner"` -> no output) | grep |
| Order: requireUser -> getCourse -> canLms -> count read -> predicate -> one Canvas POST | `bulk-course-message.ts:3-7` (header), `:52-77` (body) | read |
| Its whole call surface is six functions: `requireUser`, `getCourse(user.id, courseId)`, `canLms`, `countActiveCourseStudents`, `classifyRecipientCount`, `createCourseConversation` | `bulk-course-message.ts:52,53,55,65,71,74` | read |
| `getCourse` reads one `course_hub` row filtered by the caller's own `user_id` AND the id | `src/lib/supabase/courses.ts:73-78` (`.eq("user_id", userId).eq("id", id)`) | read |
| The Canvas target comes from that DB row, not from the caller | `bulk-course-message.ts:58-61` (`canvasUrl`, `institution` from `course`); only `subject`/`body` are caller text | read |
| `countActiveCourseStudents` makes only Canvas GETs | `src/lib/canvas/listings.ts:359-380` (`resolveInstitutionByCode`, `canvasGet`; nothing else) | read |
| `createCourseConversation` makes one Canvas POST, recipient pinned to `course_<digits>` | `src/lib/canvas/inbox.ts:427` (pattern), `:444-488`; credential via `resolveInstitution(courseUrl)` at `:460` | read |
| It has no UI caller and no unattended caller yet | `grep -rn "sendBulkCourseMessageAction" src --include=*.ts --include=*.tsx` excluding `*.test.*` -> only the definition at `bulk-course-message.ts:47`; unattended absence is pinned by `src/lib/bulk-course-message/unattended-callers.structure.test.ts:24-35` | grep + read |
| The instrument that flagged it: live closure over every `"use server"` file against `lib/github.repos.ts` | `action-guard-coverage-github-cohort.test.ts:196-209` (`githubReachingActionFiles`), `:755-784` (the pin) | read |
| The park-and-comment | `action-guard-coverage-github-cohort.test.ts:625-638` | read |

Gates green on today's tree (instrument: `npm run test:paths -- <p1> <p2>`):

```
npm run test:paths -- src/app/actions/action-guard-coverage-github-cohort.test.ts src/app/actions/bulk-course-message.test.ts
  -> COVERED ...github-cohort.test.ts files=1 passed=6 ; COVERED ...bulk-course-message.test.ts files=1 passed=17
npm run test:paths -- src/lib/canvas-credentials.test.ts
  -> COVERED src/lib/canvas-credentials.test.ts files=1 passed=19
```

## 2. Import-reachable vs call-reachable (the point of the exercise)

Instrument: a scratchpad driver that re-implements the repo walker's edge rules
(`scanRuntimeEdges`, `src/lib/module-graph/runtime-import-graph.ts:44-146`: type-only
imports erased, `export *`/`export {}` from counted, dynamic `import()` counted;
`classifySpecifier`, `:166-183`) and does a BFS for the SHORTEST trail from a root to any
file with a direct edge into `lib/github.repos.ts`, printing each hop's edge kind and
bindings. It is NOT the repo's walker; it is cross-checked against it by
(a) `lib/canvas/listings.ts` -> 17 direct-edge holders, which equals
`docs/r4-scope.md:335` ("`lib/canvas/listings.ts` -> **17 violations**"), and
(b) the real cohort test above passing with this file in the detected set.

Rooted at the action file: 423 nodes, 17 direct holders (the 17 `lib/github.*.ts`
submodules that import `./github.repos`). Two disjoint shortest trails reach them.

### Route A - DYNAMIC import inside a function the action never calls

```
actions/bulk-course-message.ts
 -> lib/canvas/listings.ts     import {countActiveCourseStudents}   (bulk-course-message.ts:13)
 -> lib/canvas/auto-zero.ts    dynamic-import "./auto-zero"         (listings.ts:450)
 -> lib/grade-zeros.ts -> lib/grade.ts -> lib/grade/extraction.ts -> lib/grade/repo-content.ts
 -> lib/github.ts -> lib/github.<submodule>.ts -> lib/github.repos.ts
```

The `await import("./auto-zero")` is at `listings.ts:450`, inside
`listCourseAssignmentDueDates` (`:445-455`). The action calls
`countActiveCourseStudents` (`:359-380`), whose body has no import and no GitHub or
grade reference. The listings.ts header already records that the due-dates function
"delegates to listAssignmentBriefsWithDue in ./auto-zero" (`:21-23`). The dynamic import
runs only if that sibling function is invoked; the action never does.

### Route B - STATIC barrel chain through `getCourse`'s module

Re-run with dynamic edges excluded (`NODYN=1`): still 421 nodes, still 17 holders, so
this is a second, independent route:

```
actions/bulk-course-message.ts
 -> lib/supabase/courses.ts          import {getCourse}                      (bulk-course-message.ts:10)
 -> lib/supabase/courses.row.ts      import {table,COLUMNS,toCourse,...}     (courses.ts:35)
 -> lib/repo-module-pairing.ts       import {coerceRepoModulePairing}        (courses.row.ts:19)
 -> lib/repo-module-mapping.ts       import {filterRepoModuleOverrides,...}  (repo-module-pairing.ts:37-41)
 -> app/components/content-tab/utils.ts  import {matchTokens}                (repo-module-mapping.ts:119)
 -> app/actions.ts                   import {requestFileUploadAction,addFileToModuleAction}  (utils.ts:11)
 -> app/actions/github.ts            export * from "./actions/github"        (actions.ts, barrel)
 -> lib/github.ts -> lib/github.<submodule>.ts -> lib/github.repos.ts
```

Measured rooted at `lib/supabase/courses.ts` alone: 421 nodes, 17 holders - so ANY
importer of `getCourse` is in the GitHub closure regardless of what it does. That is why
this file was flagged the moment it imported `getCourse`; it says nothing about the action.

The call edge from `lib/` into `content-tab/utils.ts` is exactly one function,
`matchTokens` (`repo-module-mapping.ts:119` imports nothing else from it), and
`matchTokens` is a pure string tokenizer (`utils.ts:368-376`: lowercase, regex replace,
split, filter). The two barrel imports at `utils.ts:11` are used only inside
`uploadFileToModule` (declared `utils.ts:346`, call sites `:352`, `:359`), a different
function the lib chain never calls.

### What the action actually calls, rooted per called module

Instrument: same driver, one root per module that defines a function the action calls
(`node <scratchpad>/path.cjs <root>`; "holders" = files with a direct edge into
`lib/github.repos.ts`):

| Module defining a called function | Holders | Meaning |
|---|---|---|
| `lib/supabase/auth.ts` (`requireUser`) | 0 | clean |
| `lib/courses-table-helpers.ts` (`canLms`) | 0 | clean |
| `lib/bulk-course-message/refusal.ts` (`classifyRecipientCount`) | 0 | clean |
| `lib/canvas/inbox.ts` (`createCourseConversation`) | 0 | clean |
| `lib/canvas-core.ts` (`resolveInstitution`, `resolveInstitutionByCode`) | 0 | clean |
| `lib/canvas-credentials.ts`, `lib/supabase/effective-identity.ts`, `lib/canvas-fetch-response.ts`, `lib/canvas-remote-url.ts` | 0 each | clean |
| `lib/canvas/listings.ts` (`countActiveCourseStudents`) | 17 | Route A only; the called function does not take it (`:359-380`) |
| `lib/supabase/courses.ts` (`getCourse`) | 17 | Route B only; the called function is a Supabase select (`:73-84`) |

Neither dirty module reaches GitHub through the function the action calls. Module
evaluation also has no GitHub side effect: `githubToken()` is a function that reads
`process.env.GITHUB_TOKEN` only when called (`src/lib/github.repos.ts:8-12`); the only
`process.env` in that file is line 9 (`grep -n "process\.env" src/lib/github.repos.ts`),
and a top-level-anchored scan of `src/lib/github*.ts` and `lib/grade/repo-content.ts` for
`^(export )?(const|let|var) .*process\.env` returned nothing (canary: the unanchored
pattern finds `github.repos.ts:9`, so the grep can match this syntax).

**A hypothetical call would mostly be gated.** The only server-action module Route B lands
on, `src/app/actions/github.ts`, has 28 `export async function` and 27
`await requireAppOwner()` (`grep -c` for each). The one export without a guard is
`githubConfiguredAction` (`github.ts:112-114`), which returns only
`{ configured: boolean }` from `githubConfigured()` - it does not read or spend the token.
Reaching these through the barrel would not bypass an owner gate.

## 3. Comparison to the cohort norm

- Cohort default is owner-only (RULING 83, `action-guard-coverage-github-cohort.test.ts:225-252`),
  but the rule that earns an exception is per ACTION, not per file: RULING 84 (restated at
  `docs/r4-scope.md:92-97`) says a file-level closure "proves a graph HOLDS the spending
  code and never that the exported action CALLS it". R4 applied it to
  `postWalkthroughAnnouncementAction`, whose import closure reached GitHub through the
  `lib/canvas.ts` barrel and which stayed on `requireUser()`
  (`docs/r4-scope.md:316-376`; entry at `action-guard-coverage-github-cohort.test.ts:369-370`).
  That is this case, with the same containment argument.
- Non-owner Canvas-conversation actions already sit on `requireUser()` in the reviewed
  list with the same reasoning: `listConversationsAction`, `getConversationAction`,
  `replyToConversationAction`, `setConversationStateAction`
  (`action-guard-coverage-github-cohort.test.ts:512-519`; header `:457-486`).
- The owner-private universe is exactly two targets, `lib/github.repos.ts` and
  `lib/canvas-credentials.ts` (`docs/r4-scope.md:99-113`). The Canvas target is the one
  this action genuinely uses, so it needs its own answer (next section).

## 4. Actual risk

**Can a non-owner, by calling the action, cause a GitHub side effect or read GitHub data?
No.** No function on the call path touches GitHub (section 2, both routes, per-module
table), and the one GitHub-reaching server-action module is owner-gated anyway.

**Can a non-owner spend the OWNER's Canvas token (the resource this action really uses)?
No, by construction at the resolver.** Both Canvas calls resolve their credential through
`resolveCanvasCredential` - `countActiveCourseStudents` via `resolveInstitutionByCode`
(`canvas-core.ts:174-201`, call at `:189`), `createCourseConversation` via
`resolveInstitution` (`canvas-core.ts:126-137`, call at `:135`). That resolver reads the
CALLING identity's own stored row first and reaches the owner's env pair only inside
`if (identity.role === "owner")`, otherwise throws
`CANVAS_CREDENTIAL_REQUIRED_MESSAGE` (`src/lib/canvas-credentials.ts:189-227`, owner branch
`:220-225`, throw `:227`). The action maps that throw to `refuse("no-credential")`
(`bulk-course-message.ts:66-68`). An executing instrument pins the resolver half:
`src/lib/canvas-credentials.test.ts:217-234` (member identity, owner env fully
configured, stored row null -> rejects with the credential-required message), 19/19
passing today. A non-owner therefore sends only into their OWN Canvas account, to a
course row they own (`courses.ts:73-78`), which is the feature (A29 section 6 justification,
`docs/a29-architecture.md:313-318`).

**What requireAppOwner would cost:** it additionally runs `assertAal2StepUp`
(`auth.ts:426`) and admits only an owner decision (`:418`), so it would withdraw the
feature from every non-owner instructor while protecting nothing the action reaches.
`auth.ts:299` records "there are no members yet (REL1)", so the withdrawal is invisible
today; it would bite the first member.

Verdict: **benign import-only reachability.** `requireUser()` is correct, bound to what
the action can do: act on the caller's own course with the caller's own Canvas credential.

### Things this does NOT prove (stated, not filled in)

- The guard is a source-level call; no test here executes `requireUser()` rejecting an
  unauthenticated caller against the real function. `bulk-course-message.test.ts`
  mocks `@/lib/supabase/auth` wholesale (`:63-68`; the file is on the frozen
  wholesale-auth-mock list, `wholesale-auth-mock-population.structure.test.ts:161`) and
  its "signed-out caller reaches nothing" case (`:240-247`) only proves the action
  propagates a thrown guard. Guard behavior itself is `auth.test.ts`'s job (not re-run here).
- Whether Next's server bundler actually pulls `lib/github*.ts` into this action's server
  chunk (Route B is a static edge, so it likely does). Immaterial to exposure (nothing
  executes), but unmeasured; no `next build` was run (pre-push gate territory,
  `docs/loop/this-repo.md`).
- Live Canvas behavior (credential store contents, `course_<id>` expansion) - this
  environment has no key and no network; A29's own A-R2 owns it
  (`docs/a29-architecture.md:735`).
- Observation outside guard scope, not investigated: the count uses the course row's
  `institution` code (`bulk-course-message.ts:59,65`) while the POST resolves
  institution by the course URL host (`inbox.ts:460`). Both resolve against the caller's
  own credentials, so this is a correctness question for the A29 owner, not a
  privilege one.

## 5. Interaction with Q-1 and R2 (correcting the brief)

- **Q-1 is not a guard question.** It is "which composition surface hosts the bulk-class
  message control" (`docs/a29-acceptance-criteria.md:433-441`; A-R6 at
  `docs/a29-architecture.md:739`). It only moves the W3 button; the guard is L1-L4 and is
  surface-independent (`docs/a29-architecture.md:601`). Nothing here depends on or changes Q-1.
- **R2 is the `requireOwner()`-alias reclassification** (`docs/BACKLOG.md:95-97`), whose
  census is `await requireOwner()` occurrences. This action has zero (`grep -c` above), and
  RULING 17 deliberately wrote `requireUser()` explicitly so it would NOT inherit the alias
  (`docs/a29-rulings.md:305-318`). So it is **not an R2 call site and does not fold into R2.**
  R2 is also separately OWNER-BLOCKED by the permission classifier (`BACKLOG.md:97`), which
  is a reason not to couple this to it.
- **Where it does belong: R4** (`BACKLOG.md:140`), the per-action review of GitHub-closure
  files the R2 census cannot see. `GITHUB_FILES_PENDING_ENUMERATION` is R4's shrink-only
  list (`...github-cohort.test.ts:630-634`).

## 6. Recommendation and the fix wave

**Recommendation: keep `requireUser()`; resolve the pending entry by folding the file into
the reviewed-permissive classification.** This is a tests-only wave (no production
change), in R4's pattern.

Write set (one file), `src/app/actions/action-guard-coverage-github-cohort.test.ts`
(785 lines by `@(Get-Content).Count`; ceiling 1000, so headroom is not an issue):

1. Add `"actions/bulk-course-message.ts"` to `GITHUB_FILES` (`:276-337`), alphabetically.
2. Add a `GITHUB_NOT_OWNER_ONLY` entry `sendBulkCourseMessageAction` with a reason in the
   existing shape, e.g. "its Canvas calls (countActiveCourseStudents, createCourseConversation)
   resolve via resolveCanvasCredential, which only touches the owner's env pair when the
   CALLING identity's own role is 'owner'; the file reaches the GitHub PAT only through a
   dynamic import in an uncalled sibling (listings.ts:450) and the getCourse barrel chain -
   never calls it" (cite this doc).
3. Bump the count pin `toBe(69)` (`:653`) to `70` in the same commit (the test's own
   instruction, `:643-649`).
4. Remove `"actions/bulk-course-message.ts"` from `GITHUB_FILES_PENDING_ENUMERATION`
   (`:635-638`) leaving only `actions/llm-content.ts`, and delete the now-false
   "route not traced here" sentences (`:625-629`).

Pass conditions (object, instrument, direction of failure):

- Object: the set `detected \ GITHUB_FILES` vs `GITHUB_FILES_PENDING_ENUMERATION`.
  Instrument: the existing test at `:755-784`. Fails if the sets differ in either
  direction; after the edit both must equal `["actions/llm-content.ts"]`.
- Object: `Object.keys(GITHUB_NOT_OWNER_ONLY).length` vs 70. Instrument: test `:650-655`.
  Fails on any other count.
- Object: every `requireUser()` action in a `GITHUB_FILES` module vs its membership in
  `GITHUB_NOT_OWNER_ONLY`. Instrument: test `:665-677`. Fails if the new entry is missing.
- Object: the new entry's action body, comment-stripped. Instrument: test `:704-728`
  (requires `requireUser()` present and `requireAppOwner()` absent). Fails if someone
  later tightens the guard without removing the entry - the intended tripwire.
- Run as `npm run test:paths -- src/app/actions/action-guard-coverage-github-cohort.test.ts src/app/actions/bulk-course-message.test.ts`
  and quote each file's `COVERED ... passed=N` line (a raw multi-path `vitest` can drop a
  path and exit 0).
- Sabotage owed (test-author seat's call, not designed here): flip the action to
  `requireAppOwner()` and confirm `:704-728` goes red; remove the new entry and confirm
  `:665-677` goes red.

**Optional, not required for the verdict:** an executing instrument in the
`*.guard.test.ts` idiom (`auth.test.ts:432-493`, cited by the cohort file's own header at
`:245-251`) that drives the real `requireUser` with an unauthenticated session. Defer to
the test seat; it would also cover the gap listed in section 4.

### If the owner instead wants owner-only (the alternative, costed)

Production: `bulk-course-message.ts:9,52` swap to `requireAppOwner`. Tests:
`bulk-course-message.test.ts:63-68,94,102,241` mock/assert `requireUser` and would be
renamed; the file would be added to `GITHUB_FILES` with NO `GITHUB_NOT_OWNER_ONLY` entry
(pin stays 69), the pending entry removed. It also changes the A29 product contract
(per-instructor send, `docs/a29-architecture.md:313-318`) and needs the A29 criteria
revisited. Cost of being wrong: withdraws a shipped capability from every non-owner
instructor to guard a path that does not exist. Cost of the recommended path being wrong:
if a later change makes the action CALL a GitHub or owner-env path, the `:704-728` tripwire
only catches a guard flip, not a new call - hence the residual below.

## 7. Owner-decision framing

This is an agent-resolvable classification, not a product fork, so I am not asking for
a gate. If the owner wants to overrule: **"Should sendBulkCourseMessageAction be
instructor-usable (keep requireUser, record the reviewed-safe entry) or owner-only
(requireAppOwner, withdraw the feature from non-owners)?"** Either answer ends the
activity: the fix wave in section 6 (or its costed alternative) is then pure transcription.
Recommended reading acted on: the section 6 wave. This is my reading, not an owner ruling.

## 8. Residual register

| # | Residual | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| RES-1 | A future edit makes the action (or `getCourse`/`countActiveCourseStudents`) CALL a GitHub or owner-env path; the source-text tripwire sees only guard identifiers, not new calls | R4 follow-up / test-author seat | per-module `computeForbiddenReachability` rooted at each module the action calls, pinned as a count, with the sabotage "add a call into a dirty sibling" | the fix wave's test-author pass; not designed here |
| RES-2 | No executing test drives the REAL `requireUser()` rejecting a signed-out caller for this action | test-author seat | `*.guard.test.ts` idiom per `auth.test.ts:432-493` | optional addition to the section 6 wave, else a named gap |
| RES-3 | Bundler inclusion of `lib/github*.ts` in this action's server chunk is unmeasured | repo owner | `next build` output inspection | pre-push gate, `docs/loop/this-repo.md` (this checkout cannot run the prerender tail) |
| RES-4 | Institution-code vs URL-host resolution mismatch (section 4 observation) | A29 owner | read `institutionForUrl` (`canvas-core.ts:60`) against a course row whose `institution` and `canvasUrl` host disagree | A29 verify, outside this review |
| RES-5 | Route B (any importer of `getCourse` is in the GitHub closure) will keep adding files to the pending list as new actions import it | R4 | the cohort test at `:755-784` already fails loud on a new file; no new instrument needed | per new action, at the push |

## 9. Instruments (exactly what produced each number)

| Quantity | Command |
|---|---|
| 423 nodes / 17 holders rooted at the action; Route A and B trails | `node <scratchpad>/path.cjs app/actions/bulk-course-message.ts` (BFS driver mirroring `runtime-import-graph.ts:44-183`) |
| 421 nodes / 17 holders with dynamic edges excluded (Route B) | `NODYN=1 node <scratchpad>/path2.cjs app/actions/bulk-course-message.ts` (same driver, `dynamic-import` edges skipped) |
| per-module holders (0 / 17) | `node <scratchpad>/path.cjs <root>` for each of the 11 roots in the section 2 table; cross-check 17 for `listings.ts` = `docs/r4-scope.md:335` |
| `requireOwner` count in the action = 0 | `grep -c "requireOwner" src/app/actions/bulk-course-message.ts` |
| cohort test file = 785 lines | `@(Get-Content src/app/actions/action-guard-coverage-github-cohort.test.ts).Count` (PowerShell; the mandated counter, `docs/loop/this-repo.md:160-165`) |
| pins 69 and the 17/6/19 passing counts | `npm run test:paths -- ...` lines quoted in section 1 |

Scratchpad: `C:\Users\alexa\AppData\Local\Temp\claude\C--Users-alexa-OneDrive-Documents-Projects-teaching-assistant\e8e96e62-aa3d-4508-b28a-354d4d297572\scratchpad\path.cjs`
(not committed). `git status --short` at the time of writing shows other seats'
in-flight files and none of mine except this doc.
