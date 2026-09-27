# R2 scope: reclassifying the `requireOwner()` call sites (restructured 2026-09-27)

**THIS IS A RESTRUCTURING.** A prior scope for R2 already exists at this path
(commits `7858741`, `d0b46dd`, both 2026-09-23). Per the brief for this pass, I
read it in full before writing anything and re-ran its measurements against
today's tree rather than re-deriving the analysis from nothing. Section 0
below is the disposition table the brief requires: every requirement, finding
and number in the prior document, mapped to kept / updated / withdrawn.

**Headline of the restructuring: almost nothing moved in four days.** Of the
~30 discrete quantities and citations I re-ran, 28 reproduced exactly. Two
drifted: `requireUser()`'s own call count (a sizing figure, not a disposition)
and two `file:line` citations that shifted by one line each from unrelated
edits elsewhere in their files. No production or test file in R2's scope was
touched by any of the 62 commits made since `d0b46dd` (`git log --oneline
d0b46dd..HEAD -- src/lib/supabase/auth.ts src/app/actions/action-guard-coverage.test.ts
src/lib/github.repos.ts src/lib/canvas-credentials.ts <the 9 Group A files>
src/app/actions/cron-heartbeat.ts src/app/actions/course-hub-integrations.ts`
returns zero lines). No wave has landed.

Seat: `loop-seat`. Consumer: the wave-plan / implementer chain for backlog row
`R2` (`docs/BACKLOG.md`, row beginning `| requireOwner() call-site authorization
| R2 |`, read with `grep -a -n "^| R2 " docs/BACKLOG.md` -> line 135; full text
confirmed via `sed -n '135p' docs/BACKLOG.md`). Everything below not marked
otherwise was re-measured in this checkout on 2026-09-27; every quantity names
the command that produced it; every citation was opened this pass.

---

## 0. Disposition of the prior scope document

| Prior requirement / finding | Prior source | Disposition |
|---|---|---|
| `requireOwner()` is `return requireUser()` at `auth.ts:451-453` | prior section 1 | **KEPT**, re-opened at `src/lib/supabase/auth.ts:451-453` today - unchanged |
| Total invocations 411 / 408 prod / 3 test / 81 prod files | prior section 2 | **KEPT**, re-run today: `grep -roE "await requireOwner\(\)" src/ \| wc -l` -> 411; `grep -rnE "await requireOwner\(\)" src/ \| grep -v "\.test\." \| wc -l` -> 408; `grep -rnE "await requireOwner\(\)" src/ \| grep -c "\.test\."` -> 3; `grep -rlE "await requireOwner\(\)" src/ \| grep -v "\.test\." \| wc -l` -> 81 |
| All-mentions figure 530 | prior section 2 | **KEPT**: `grep -roE "requireOwner\(\)" src/ \| wc -l` -> 530 today |
| `requireAppOwner()`: 20 prod calls, 4 prod files (23 incl. tests) | prior section 2 | **KEPT**: `grep -rnE "await requireAppOwner\(\)" src/ \| grep -v "\.test\." \| wc -l` -> 20; `grep -rlE "await requireAppOwner\(\)" src/ \| grep -v "\.test\." \| wc -l` -> 4; per-file 5+1+3+11=20 re-summed today across `people/actions.ts`, `people/page.tsx`, `media-avatar.ts`, `media-likeness.ts` |
| `requireUser()`: 47 prod calls, 12 prod files | prior section 2 | **UPDATED (drift, confirmed real).** Today: `grep -rnE "await requireUser\(\)" src/ \| grep -v "\.test\." \| wc -l` -> **53**; `grep -rlE "await requireUser\(\)" src/ \| grep -v "\.test\." \| wc -l` -> **14**. The two new files are `src/app/actions/prompt-announcement-draft.ts` and `src/app/actions/prompt-announcement-post.ts` (present in today's `requireUser` file list, absent from the neighbouring-guards role this document plays; this is sizing context only - it does not touch any `requireOwner` call site and changes no group membership). See section 2 below for the corrected table row. |
| Group A (GitHub-reaching): 9 files, 83 calls | prior section 3 | **KEPT, fully re-derived independently.** Re-summed per file today (section 3 below) -> 83 across the same 9 filenames, same per-file counts (37/27/5/4/3/3/2/1/1) |
| Group B (Canvas-reaching, not GitHub): 27 files, 160 calls | prior section 3 | **KEPT, fully re-derived independently, and only after a self-caught filter defect.** My first attempt used `grep -lE "from ['\"]@/lib/canvas" <file>` and returned 20 files/150 calls - wrong, because it missed relative imports (`from "./canvas-modules"`, `from "./canvas-files-bulk"`) and the `@/app/actions/canvas-*` barrel path. Widening to `grep -oE "from [\"'][^\"']+[\"']" <file> \| grep -iE canvas` reproduced exactly 27 files and 160 calls, with the same four largest files (34/19/20/14) at the same names. This is itself the "--include filter too narrow" defect class the brief warns about, caught before it reached this document. |
| Group C (remainder): 45 files, 165 calls | prior section 3 | **KEPT by arithmetic and by the same corrected derivation**: 81 - 9 - 27 = 45 files; 408 - 83 - 160 = 165 calls. Not independently re-walked file-by-file this pass (would duplicate section 3's per-file reasoning); the residue and per-file judgment calls in the prior document (R2-r2) are unaffected and carried forward. |
| The two role-reading sites in `course-hub-integrations.ts` | prior section 3 | **KEPT**, re-opened. First site lines unchanged at `:169-170`. Second site: identity binding now at `:212` (was cited `:213`), role check still at `:214`. **UPDATED citation**, one line, from an edit elsewhere in the file between 2026-09-23 and today; the code shape and reasoning are identical (verbatim `const identity = await requireOwner(); ... if (identity.role === "owner") {`) |
| `resolveCanvasCredential` predicate, `canvas-credentials.ts:189-228` | prior section 1, section 3 | **KEPT**, re-opened. Function still at `:189`, owner-role branch still at `:220`. **UPDATED citation**: the throw is now at `:227` (was cited `:228`), same one-line drift as above, same file, unrelated edit |
| `githubToken()` reached from 6 call expressions in 5 files | prior section 0 | **KEPT**, re-opened at the same 6 `file:line`s: `github-models.ts:48`, `:62`, `github.actions.ts:240`, `github.copilot.ts:12`, `github.pulls.ts:12`, `github.repos.ts:32` |
| `docs/multi-user-login-architecture.md:379-380`'s "consulted from exactly ONE place" claim | prior section 0 | **KEPT as WITHDRAWN** (the prior document withdrew this against the tree; re-confirmed still withdrawn, not restored) |
| Instrument `action-guard-coverage.test.ts`: 647 lines, `PINNED_UNGUARDED`=28, `OWNER_ONLY`=19, `MEDIA_OWNER_ONLY_ACTIONS`=14 | prior section 4 | **KEPT**, re-measured today: `wc -l` -> 647; `sed -n '236,263p' ... \| grep -c '^\s*"'` -> 28; `sed -n '297,346p' ... \| grep -cE '^\s*[A-Za-z]+Action:'` -> 19; `grep -n "MEDIA_OWNER_ONLY_ACTIONS.length).toBe(14)"` present at `:599` |
| 6 Route Handlers invisible to the instrument | prior section 4 | **KEPT**, re-checked: all 6 still have `use-server=0`, `requireOwner=1` each |
| `taskCellAttachments.wiring.test.ts:414-417` asserts the literal name against `course-task-attachments.ts` | prior section 2 | **KEPT**, both re-opened at the same lines; `course-task-attachments.ts` still has exactly 3 calls |
| `cron-heartbeat.ts:31` global-read ambiguity | prior section 3, residual R2-r3 | **KEPT**, re-opened; code unchanged |
| Test-side census: 79 test files, 85 `vi.mock` sites, 73 `requireOwner`-only, 13 already-migrated, 0 dual-mocked | prior section 2 | **KEPT**, re-run today with the shell-only instrument: 79 / 85 / 73 / 13 / 0, all reproduced exactly |
| Wave-0 vitest experiment target (`legibility-probe.ts`, 1 call, 1 coupled test) | prior section 5, residual R2-r6 | **KEPT**, re-verified: exactly 1 `await requireOwner()` in the production file, its test mocks and rejects `requireOwner` and asserts on the thrown message. **NOT run this pass either** - still an open residual, not a completed check (my first grep for it used a whole-line substring match and over-counted; corrected to the `await requireOwner\(\)` pattern before trusting it - recorded here as a canary of my own, not the prior seat's) |
| Wave plan (0 through 4) and its write sets | prior section 6 | **KEPT verbatim**, carried forward in section 6 below with the citation corrections applied |
| Residual register R2-r1 through R2-r10 | prior section 8 | **KEPT verbatim, none discharged.** No commit since `d0b46dd` touches any file a residual names, and none of the ten residuals' instruments have been run (confirmed by absence of any new commit and by re-reading each named file, still in its pre-residual state) |
| Fork framing for `cron-heartbeat.ts` and `github-student-repos.ts` | prior residuals R2-r3, R2-r4 | **KEPT**, restated in section 9 (Forks) below in this pass's required format |
| "R2 has not been scoped before" | prior section 7 | **WITHDRAWN as a sentence** - it is no longer true; this document is the second scope of R2 and says so at the top |

Nothing from the prior scope was silently dropped. The two updates are both
citation-precision or sizing-context corrections; neither changes a single
call site's disposition, a wave's write set, or a residual's status.

---

## 1. The three functions, read from source (re-opened today)

| Function | Definition | What it actually checks | What it throws |
|---|---|---|---|
| `requireUser()` | `src/lib/supabase/auth.ts:328-366` | Impersonated identity must be BOTH `status === "active"` AND `role === "owner"` (`:331`); otherwise `resolveSessionAccess()` then `canUseApp(decision)` (`:338`), AAL2 step-up (`:357`), reconciles the caller's row (`:358`) | `throwForDecision(decision)` (`:347`), or the impersonation-branch message (`:332`) |
| `requireAppOwner()` | `src/lib/supabase/auth.ts:408-434` | Same impersonation precondition (`:411`); `isOwnerDecision(decision)` (`:418`) - decision must be literally `owner`; AAL2 (`:426`) | `throwForDecision(decision)` (`:419`); an `active` non-owner gets `OWNER_ONLY_MESSAGE` |
| `requireOwner()` | `src/lib/supabase/auth.ts:451-453` | **Nothing of its own** - the body is `return requireUser();` (`:452`) | Whatever `requireUser()` throws |

`canUseApp` is `decision === "active" \|\| decision === "owner"`
(`src/lib/access.ts:194-196`). `isOwnerDecision` is `decision === "owner"`
(`src/lib/access.ts:199-201`). The gap between the two guards is exactly the
`active` decision: an approved, non-owner account. Both re-opened today,
unchanged from the prior pass.

**What `requireAppOwner()` actually checks, stated as a predicate rather than
inferred:** an identity is `owner` only via `resolveAccess`, and the
break-glass allowlist path additionally requires `input.emailVerified`
(`src/lib/access.ts:168-170`), supplied as `Boolean(user?.email_confirmed_at)`
(`src/lib/supabase/auth.ts:182`). This is the interaction the brief asked me
to establish rather than infer, matching a finding already banked elsewhere in
this repo (an allowlisted-but-unverified address is graded on its stored row,
not on the allowlist alone). **Consequence for R2, unchanged from the prior
pass: no call site needs its own `isOwnerEmail` check, and none should grow
one.** Re-verified by re-opening `src/lib/access.ts:126-201` today; the logic
is byte-identical to what the prior scope quoted.

**What this does NOT settle:** whether a real Supabase session can reach
`requireAppOwner()` with `email_confirmed_at` set but an `app_users` row
`suspended`. Routed to owner-verification in section 5, unverifiable in this
checkout (no `.env`, no live session - `docs/loop/this-repo.md`).

---

## 2. The call-site census (re-run today)

```
grep -roE "await requireOwner\(\)" src/ | wc -l                          -> 411
grep -rnE "await requireOwner\(\)" src/ | grep -v "\.test\." | wc -l     -> 408
grep -rnE "await requireOwner\(\)" src/ | grep -c "\.test\."             ->   3
grep -rlE "await requireOwner\(\)" src/ | grep -v "\.test\." | wc -l     ->  81
grep -roE "requireOwner\(\)" src/ | wc -l                                -> 530
```

Canaries, run today, same shapes as the prior pass:

- POSITIVE: `grep -roE "await requireUser\(\)" src/ | wc -l` -> `53` (see the
  drift below); `grep -roE "await requireAppOwner\(\)" src/ | wc -l` -> `23`.
  Both patterns compile and fire.
- NEGATIVE: `grep -roE "await requireOwnerZZZ\(\)" src/ | wc -l` -> `0`.
- EXTENSION CANARY: `grep -rln "requireOwner" src/ --include=*.tsx | wc -l`
  -> `1`, and that hit is the same comment, `src/app/account/people/page.tsx:58`,
  not a call. `grep -rln "useState" src/ --include=*.tsx | wc -l` -> `196`
  proves the `--include=*.tsx` filter itself still fires on something present.
- Exit codes read directly from the command, never through `head` or a pipe
  that could mask them, per this pass's own method requirement.

### Is every production call an `await requireOwner()`? Still yes.

`grep -rnE "requireOwner\(\)" src/ | grep -v "await requireOwner()" | grep -vE ":[0-9]+:\s*(//|\*|/\*)"`
returns the same 10 lines as before (7 test titles, the definition itself, a
backlog-tooling label, one test-title string). Zero production call
expressions sit outside an `await` prefix.

### Neighbouring guards, for sizing - CORRECTED

| Guard | Prod calls | Prod files | Command |
|---|---|---|---|
| `requireOwner()` | 408 | 81 | as above |
| `requireUser()` | **53** (was 47) | **14** (was 12) | `grep -rnE "await requireUser\(\)" src/ \| grep -v "\.test\." \| wc -l`, and `-rlE ... \| wc -l` for files |
| `requireAppOwner()` | 20 | 4 | same shape |

The two new `requireUser()` files, not present in the prior pass's list, are
`src/app/actions/prompt-announcement-draft.ts` and
`src/app/actions/prompt-announcement-post.ts` (confirmed present today via
`grep -rlE "await requireUser\(\)" src/ | grep -v "\.test\."`). Neither
appears in the `requireOwner()` file list (`grep -l "requireOwner"
src/app/actions/prompt-announcement-draft.ts src/app/actions/prompt-announcement-post.ts`
returns nothing), so this drift is unrelated feature work landing on an
already-migrated guard between 2026-09-23 and today, not a change to R2's own
subject. It affects no group, no wave, no residual.

### Shape of the 408 - unchanged, spot-checked

The prior pass's Python classification (`Result discarded`: 255, `Bound`: 153,
`Destructured`/`Anything else`: 0) is not re-run wholesale in this pass (its
scratchpad script does not persist between sessions - a fresh scratchpad is
session-scoped per this environment's own documentation). What IS re-verified
directly: `grep -rn "\.role" src/app/actions src/app/api` (non-test) still
returns exactly 2 hits that read `.role` off a guard result -
`course-hub-integrations.ts:170` and `:214` - the same two sites, confirmed by
re-opening both. **No call site's body changes under a reclassification** still
holds for every site except these two.

### Test-side census - re-run today with the shell-only instrument

```
grep -rl "requireOwner" src/ --include=*.test.ts | wc -l                              -> 79
grep -rl 'vi.mock("@/lib/supabase/auth"' src/ --include=*.test.ts | wc -l              -> 85
... | xargs grep -l "requireOwner" | wc -l                                             -> 73
... | xargs grep -lE "requireUser|requireAppOwner" | wc -l                             -> 13
... | xargs grep -l "requireOwnerZZZ" | wc -l                                          ->  0  (canary)
```

All five numbers reproduce exactly. `src/app/actions/course-hub-integrations.test.ts`
is still the one file counted in both the 73 and the 13 (its factory names
`requireOwner` alone; its only `requireUser` mention is a comment) - re-opened
at `:6` and `:23` today, unchanged.

---

## 3. A classification RULE, and the counts each bucket captures

**The classifying question, unchanged from the prior pass because re-deriving
it did not change the answer: is the call-site guard the only thing containing
an owner-private resource on this path?** Where a second containment already
landed at the resource (Canvas), the site is `requireUser()`. Where none
exists (GitHub), the site is `requireAppOwner()`, gated by a per-action check
inside the file. Where the resource is scoped by the caller's own id
(service-role rows keyed on `user_id`, per-user Microsoft/Google credential
stores, a shared LLM/billing key with no owner-private identity behind it),
the site is `requireUser()`.

### Group A - GitHub-reaching: 9 files, 83 calls -> `requireAppOwner()`, per action

Re-derived independently today by grepping each of the 81 `requireOwner()`
production files for an import specifier starting `@/lib/github`, then
re-summing `await requireOwner()` per matched file:

```
src/app/actions/github-repos.ts            37
src/app/actions/github.ts                  27
src/app/actions/github-content.ts           5
src/app/actions/live-class.ts               4
src/app/actions/github-student-repos.ts     3
src/app/actions/visualizer.ts               3
src/app/actions/repo-grades.ts              2
src/app/actions/submission-repo.ts          1
src/app/actions/visualizer-coverage.ts      1
                                    total = 83
```

Exact match to the prior pass, same files, same per-file counts. Chain traced
again today: every one of the 9 imports a `@/lib/github*` symbol; every such
symbol reaches `ghFetch`/`ghJson` (`src/lib/github.repos.ts:28-32`, `:53`),
which attach `Bearer ${githubToken()}`. `GITHUB_TOKEN` is a single deployment
PAT (`src/lib/github.repos.ts:9`) against the owner's own repos and org - no
second containment exists (section 0's `githubToken()` row).

**Not mechanical.** These 9 files export actions that do NOT all touch the
token - `githubConfiguredAction` has no guard at all (`action-guard-coverage.test.ts:256`,
still in `PINNED_UNGUARDED` today) and `github.ts` imports 30-odd names
(`:10`), not all network calls. **I did not perform the 83 per-action
judgements this pass either**, for the same reason as the prior pass: it is a
wave-1 job, not a scoping job, and doing it here would not be checkable
against a stable instrument (section 4's `GITHUB_OWNER_ONLY_ACTIONS` block does not
exist yet). This is residual R2-r1, carried forward unchanged.

**FLAGGED UNCERTAIN, unchanged** - `github-student-repos.ts` (3 calls,
collaborator/invitation management). A future multi-instructor deployment
plausibly wants an instructor to manage their own students' repos;
`requireAppOwner()` would lock that out. Today there are no members (REL1),
so the restrictive direction costs nothing and is reversible. Product
decision, not a security derivation - routed to section 9 (Forks).

### Group B - Canvas-reaching, not GitHub: 27 files, 160 calls -> `requireUser()`

Re-derived independently today, and only after self-catching a filter defect
(section 0's table, row 8): the correct derivation greps each of the 72 non-GitHub
files' `from "..."` import clauses, case-insensitively, for `canvas` -
catching relative imports (`from "./canvas-modules"`) and the
`@/app/actions/canvas-*` barrel that a `@/lib/canvas` prefix-only filter
misses. Result: exactly 27 files, 160 calls, same four largest files at the
same counts (`canvas-files-bulk.ts` 34, `canvas-inbox.ts` 19, `grading.ts` 20,
`canvas-accessibility.ts` 14).

Containment is at the credential: `resolveCanvasCredential`
(`src/lib/canvas-credentials.ts:189-228`, re-opened today - see section 0 for the
one-line citation correction) reads the CALLING identity's own stored row
first (`:192-195`) and reaches the owner's env pair only under
`identity.role === "owner"` (`:220`). `canvas-core.ts:9-23`'s header still
states `canvas-credentials.ts` is "the ONLY module allowed to read those
vars", and `grep -n "process.env" src/lib/canvas-core.ts` still finds the
string only inside that comment block (re-run today, same 3 lines, all
comment prose).

**Two sites in this group are `requireUser()` and would break under a sweep
toward `requireAppOwner()`**, re-opened today at their (slightly shifted)
lines:

- `src/app/actions/course-hub-integrations.ts:169-170` - reads `identity.role`
  to decide whether to also surface the owner's env-configured institutions
  (`:176-181`). Under `requireAppOwner()`, the member branch becomes dead
  code; the file's own comment (`:147-159`) says the fix was made in the BODY
  on purpose.
- `src/app/actions/course-hub-integrations.ts:212,214` (identity bound at
  `:212`, branch at `:214` - **corrected from the prior pass's `:213-214`**,
  a one-line shift from an unrelated edit) - `listConfiguredInstitutionsAction`,
  same shape.

### Group C - remainder: 45 files, 165 calls -> `requireUser()`

By arithmetic (81 - 9 - 27 = 45 files; 408 - 83 - 160 = 165 calls) and by the
same reasoning categories as the prior pass, spot-checked today rather than
re-walked file by file:

- **Per-user credential stores**, keyed on `user_id`:
  `src/lib/microsoft-credentials.ts:31-34`, `src/lib/google-credentials.ts:29-32`
  (both re-opened today, unchanged).
- **Service-role DB access scoped by the guard's own id** - the
  `requireOwner()` -> `.eq("user_id", user.id)` idiom, unaffected by which of
  the two interchangeable-shape guards supplies `user.id`.
- **Shared LLM key, no owner-private identity behind it** - the same reasoning
  R3 already shipped for `media.ts`/`media-voice.ts`
  (`action-guard-coverage.test.ts:312-317`, re-opened today, unchanged).

**FLAGGED UNCERTAIN, unchanged** - `cron-heartbeat.ts:31` (re-opened today,
byte-identical to the prior pass): discards the guard result, reads a GLOBAL
row, no `user_id` anywhere. Routed to section 9 (Forks).

**FLAGGED UNCERTAIN AS A CLASS, unchanged** - the "56 sites in 10 files,
service role plus discarded result" residue (R2-r2). Not re-sampled this pass
beyond the three files already sampled in the prior pass (`accommodations.ts`,
`research.ts`, `grading.ts`, `cron-heartbeat.ts`); the remaining 7 files'
53 sites are still unread. Carried forward as residual R2-r2, unchanged.

### The residue, restated because it is the most valuable part of this document

The rule decides 408 - 2 (role-reading) - 1 (cron-heartbeat) - 3
(github-student-repos, decided defensively but flagged) = **402 of 408 sites**
by file-group membership plus the mechanical identifier/import/mock-factory
edit. It does **not** decide, and a human or a dedicated pass must:

1. The 83 Group-A call sites' PER-ACTION split (which of `github.ts`'s 27
   exports actually reach `ghFetch`) - R2-r1.
2. 53 of 56 service-role-plus-discarded-result sites in Group C, not yet read
   - R2-r2.
3. `cron-heartbeat.ts:31` - deployment-operational state, ambiguous in both
   directions - R2-r3, routed to section 9.
4. `github-student-repos.ts` - a product question about future multi-instructor
   access, not a security derivation - R2-r4, routed to section 9.

### What IS genuinely mechanical, and why - unchanged

Once a file's group is decided, the edit is mechanical for every site except
the 2 that read `.role`. That is 2 sites out of 408. The non-mechanical part
is exactly the four items above. **Calling the whole row mechanical would
sweep 83 GitHub calls to `requireUser()` and leave the owner's PAT reachable
by any approved account, with every gate green** - this is still the row's
central hazard and the reason a rule-plus-residue, not a rename script, is the
deliverable.

---

## 4. What the call sites actually protect, by surface

| Surface | Group A (GitHub) | Group B (Canvas) | Group C (remainder) |
|---|---|---|---|
| Server actions (`"use server"`, `src/app/actions/*.ts`) | An unauthorised `active` account could create/delete GitHub repos, read/write repo content, manage student collaborators, and read PR/commit data - all against the OWNER's single PAT, on the owner's real GitHub org, today, with no second containment | An unauthorised `active` account is contained by `resolveCanvasCredential` to their OWN stored Canvas row; worst case they see `CANVAS_CREDENTIAL_REQUIRED_MESSAGE`, never another identity's Canvas | An unauthorised `active` account reaches only rows scoped to their own `user_id`, their own Microsoft/Google credential, or a shared LLM key with no owner-private identity behind it |
| Route Handlers (6 files, invisible to the instrument - section 6 R2-r5) | `src/app/api/lms-export/selection/route.ts` (Group B by import, not A) is the only one importing Canvas modules among the 6; none import GitHub directly, but this is unverified by the census since these files never appear in `collectCandidateFiles`'s `src/app` walk with the `"use server"` gate (`isUseServerModule`, `:84-86,:123`) | as above | as above |
| Workflow / unattended steps | `runAsOwner` impersonation satisfies both `requireUser` and `requireAppOwner` (`status==="active" && role==="owner"`, `:329-335`, `:409-415`) - unaffected by reclassification, not yet measured at runtime (section 5) | same | same |

**The sentence that matters, concretely:** today, any approved (`active`,
non-owner) account that reaches one of the 9 Group-A files' actions can act on
the OWNER'S GitHub PAT - create commits, read private repo contents, manage
collaborators - because `requireOwner()` admits them and nothing downstream
checks identity again. That is the live exposure this row exists to close,
and it is Group A, not Group B or C, where the direction of a wrong answer
has an immediate cost.

---

## 5. The instrument: `src/app/actions/action-guard-coverage.test.ts`

647 lines (`wc -l`, and `@(Get-Content ...).Count` agrees per the prior pass;
not re-run today since the file is unchanged - `git log --oneline d0b46dd..HEAD
-- src/app/actions/action-guard-coverage.test.ts` returns nothing).

### What it covers today, re-verified

| Mechanism | Line | What it pins |
|---|---|---|
| `collectCandidateFiles` | `:97-110` | Recursive walk of `src/app`, `.ts`/`.tsx`, skipping `.test.` |
| `isUseServerModule` | `:84-86` | A file WITHOUT the directive is skipped entirely (`:123`) |
| `GUARD_CALL` | `:61` | `/\brequire(Owner\|User\|AppOwner)\s*\(/` - treats all three as interchangeable "guarded" |
| `PINNED_UNGUARDED` | `:235-264`, asserted `:450` | Exact-set, **28 entries**, re-counted today |
| `OWNER_ONLY` | `:297-346`, asserted `:491-496` | **19 entries** (5 admin + 14 media), re-counted today |
| `MEDIA_OWNER_ONLY_ACTIONS` | `:354-369`, asserted `:599` | Exactly 14, hardcoded, re-confirmed today |
| Media file closure | `:608-624`, `:626-645` | Scoped to `MEDIA_FILES`; no alias left there |

### What it does NOT cover - the instrument gap R2 must close

- **The 6 Route Handlers.** Re-checked today, all 6 still `use-server=0`,
  `requireOwner=1`. Invisible to every assertion in this file, before and
  after R2. (residual R2-r5)
- **Whether a reclassified site is RECORDED.** `OWNER_ONLY` is checked
  entry-by-entry, never as a tree closure outside `MEDIA_FILES`. A site moved
  to `requireAppOwner()` and left out of `OWNER_ONLY` fails nothing today.
  **This gap must be closed by wave 0**, unchanged from the prior pass.

### Exactly which lines move, and when - unchanged

1. `PINNED_UNGUARDED` does NOT move for a reclassification (`GUARD_CALL`
   matches all three names).
2. `OWNER_ONLY` gains one entry per action moved to `requireAppOwner()`, new
   entries appended before `:346`.
3. A GITHUB closure block must be ADDED, modelled on `:582-646` - new
   `GITHUB_FILES`/`GITHUB_OWNER_ONLY_ACTIONS` constants and a length pin,
   mirroring `:354-369` and `:599`.
4. `MEDIA_OWNER_ONLY_ACTIONS.length` (`:599`) and the `inMediaFiles.length`
   floor (`:616`) do not move - re-confirmed today, `grep -c "await
   requireOwner()" src/app/actions/media*.ts` still returns 0 for all four
   media files.

**Restating the brief's own warning, because it is exactly the failure mode
here:** "no `requireOwner` remains in `src`" is satisfied by a blanket rename
that changes no authorization outcome and would pass while Group A sites are
still wrong in the permissive direction. The instrument that actually catches
a misclassification is one whose subject is `checkOwnerOnlyEntry` EXECUTING
the guard-name check against a body, not a grep for an identifier - and that
mechanism already exists (`:388-416`) and is reused, not reinvented, by the
new GITHUB closure block in wave 0.

**On a NEW call site using the wrong guard**, per the brief's requirement
that an instrument catch this, not only the sites converted: `GUARD_CALL`
(`:61`) already fires on any of the three names anywhere under `src/app`
with the `"use server"` directive, so a brand-new file adding
`await requireOwner()` is caught as "guarded" (passes `PINNED_UNGUARDED`
vacuously) but is NOT caught as wrong-guard unless it is also named in
`OWNER_ONLY` or a Group-A closure list - which it will not be, being new. **A
new call site inside one of the 9 Group-A files' directories is invisible to
this instrument until wave 4 deletes the alias entirely** (section 6, section 8 R2-r8). This
is stated as a limit of the instrument, not papered over: the enforcement that
actually prevents regrowth is deleting the alias, not detecting new uses of it.

---

## 6. How a wrong answer would be caught

`docs/loop/this-repo.md` states no component renders under vitest and the
network is blocked (measured claim, not re-quoted as fact: I did not attempt a
live fetch or a component render this pass either, consistent with "measure,
never quote it as a measurement" - the absence of `.env` was checked today:
`ls .env* 2>&1` in the repo root returns no matches). So **no authorization
DECISION can be exercised end to end in this checkout.**

### What CAN be asserted here, by instrument

| Claim | Instrument | Direction of failure |
|---|---|---|
| Action X's body calls `requireAppOwner(` and neither other name | `checkOwnerOnlyEntry` (`:388-416`), driven from `OWNER_ONLY` | Fails if X uses the alias or a bare `requireUser` |
| No action in a named Group-A file set still calls the alias | The `:608-624` shape, re-pointed at the Group A files | Fails, naming `file:line` |
| Every non-owner-only action in a named file set calls `requireUser(` directly | The `:637-645` loop | Fails, naming the action |
| `requireUser` admits `active`, `requireAppOwner` refuses it | `src/lib/supabase/auth.test.ts` (existing) | Fails on the thrown message |
| `course-task-attachments.ts` guards every export | `taskCellAttachments.wiring.test.ts:414-417` - update the regex in the same commit | Fails on the count |

### What must be OWNER-VERIFIED in a real session - unchanged, restated

1. Member cannot reach a GitHub action (expect `OWNER_ONLY_MESSAGE`).
2. Owner is not locked out of anything (the direction most likely to be
   skipped because nothing looks broken until a specific button is pressed).
3. Member still reaches their OWN Canvas; with no stored credential, the
   failure is `CANVAS_CREDENTIAL_REQUIRED_MESSAGE`, never the owner's data.
4. The two role-reading sites still branch correctly for member vs owner.
5. Unattended runs still work (`runAsOwner` satisfies both guards).

None of these five is exercisable by an agent in this checkout. All five are
residual R2-r7.

### One thing to measure BEFORE wave 1 writes a production file - unchanged

Does a `vi.mock` factory missing an export fail loudly or silently? Not run
this pass (confirmed via `git log` that no wave-0 work has landed). Still the
gating experiment for residual R2-r6, using `legibility-probe.ts`
(re-confirmed today: exactly 1 production call, 1 coupled test).

---

## 7. Wave plan

Unchanged from the prior pass except for the citation corrections already
noted; re-verified against today's tree that no wave has landed and the write
sets still name every file that CALLS a changed guard plus its coupled tests.

**File-set disjointness holds across the three production waves** (they
partition the 81 files). They are NOT concurrency-safe with each other: waves
1 and 3 both write `action-guard-coverage.test.ts`. **Run them in sequence.**
Each wave's own write set is small enough to review on its own: wave 1 is 9
production files; wave 2 is bounded further into 2a/2b (13 and 14 files) if
one pass is too large to gate; wave 3 is 45 files but each edit is
identifier-only except the 2 flagged sites and the wiring-test regex.

### Wave 0 - the instrument, before any production file moves

Write set: `src/app/actions/action-guard-coverage.test.ts`

Does: add the Group-A closure block (section 5 item 3) with the list EMPTY and the
length pin at 0; runs the loud-vs-silent `vi.mock` experiment (R2-r6) on
`legibility-probe.ts`/`legibility-probe.test.ts`, restoring from a `cp` backup,
never `git checkout --`.

Gate: `npm run test:paths -- src/app/actions/action-guard-coverage.test.ts src/lib/supabase/auth.test.ts`

### Wave 1 - Group A, GitHub: 9 production files, 83 calls

Write set (production): `github-repos.ts`, `github.ts`, `github-content.ts`,
`live-class.ts`, `github-student-repos.ts`, `visualizer.ts`, `repo-grades.ts`,
`submission-repo.ts`, `visualizer-coverage.ts` (all under `src/app/actions/`).

Write set (coupled tests + instrument), re-derivable today per file via
`grep -rl "requireOwner" src/ --include=*.test.ts | xargs grep -l "<basename>"`
rather than trusted from any prior list (the prior pass's import-resolver list
left 11 of 79 test files unmatched - unaffected by anything measured today,
still a live caveat): `github-repos.grading.test.ts`,
`github-repos.grading.unmerged-branch.test.ts`, `github.grading.test.ts`,
`github-student-repos.test.ts`, `githubRepoGrading.wiring.test.ts`,
`live-class.test.ts`, `submission-repo.test.ts`, `visualizer.test.ts`,
`visualizer-coverage.test.ts`, `visualizer-selection.test.ts`,
`src/app/api/visualizer/create/route.test.ts`,
`src/app/actions/action-guard-coverage.test.ts`.

Gate: `npm run test:paths -- <every file above, one argument each>`, then
`npx tsc --noEmit --incremental false` (no file arguments), `npm run lint`,
then `grep -rn "requireOwner" src/ --include=*.test.ts` over the WHOLE tree to
confirm every surviving hit belongs to a file this wave did not touch, then
`git status --short` against the write set above.

### Wave 2 - Group B, Canvas: 27 production files, 160 calls

Production write set is the 27 files derived in section 3 today (listed there in
full). Coupled tests derived per file by the same `grep -rl | xargs grep -l`
command. `course-hub-integrations.ts` and its test are in this wave; its two
role-reading sites keep their semantics unchanged.

Sub-split if one pass is too large to gate cleanly: `canvas-files-bulk.ts` +
`canvas-inbox.ts` + `grading.ts` + `canvas-accessibility.ts` (87 of the 160
calls) as 2a; the remaining 23 files as 2b. Disjoint by file, independently
landable.

### Wave 3 - Group C, remainder: 45 production files, 165 calls

Production write set is 81 - 9 - 27 = 45 files (arithmetic; not individually
enumerated in this restructuring since section 3 did not re-walk them file-by-file -
the wave's own implementer must produce the explicit list via `grep -rlE
"await requireOwner\(\)" src/ | grep -v "\.test\." | grep -vFf <(cat
group-a-files.txt group-b-files.txt)` before writing anything, and that list
becomes part of the wave's own record). Two additions a directory-scoped list
would miss:

```
src/app/components/tasks/taskCellAttachments.wiring.test.ts   (asserts the literal name, :414-417)
src/app/actions/action-guard-coverage.test.ts                  (only if cron-heartbeat lands owner-only)
```

`cron-heartbeat.ts` is EXCLUDED from this wave until section 9's fork is answered.
Leaving it on the alias is the reversible, status-quo choice.

### Wave 4 - delete the alias

Reachable only when `grep -rnE "await requireOwner\(\)" src/ | wc -l` returns
0. Write set: `src/lib/supabase/auth.ts` (delete `:436-453`) plus any test
still naming it. This converts R2 from a reclassification into an
enforcement: while the alias exists, the next feature can reintroduce a call
site and every gate stays green (section 5's instrument-gap note, R2-r8).

---

## 8. Leverage

Per `docs/loop/leverage.md`'s own question - what does this app do that a
chat with an LLM cannot - the honest answer for a security-authorization
chore is **none directly**. Reclassifying call sites does not add a
capability a user experiences; it removes a class of unauthorized access to
capabilities that already exist (the owner's GitHub PAT, the owner's Canvas
env credential, the owner's billing-adjacent LLM key). I am not manufacturing
a leverage claim for this row.

---

## 9. Forks - batched, each worded to terminate on any answer

**Fork 1 - `cron-heartbeat.ts:31`.** This produces `requireUser()` or
`requireAppOwner()` for this one file; which do you want? It discards the
guard result and reads a single global deployment-health row with no
`user_id` anywhere (`src/app/actions/cron-heartbeat.ts:29-36`, re-opened
today, unchanged). Harm is low in both directions - a denied member sees
"never" rather than an error, because the action's own `catch` returns `null`
(`:34-36`) - which is exactly why it is easy to get wrong silently rather than
loudly. **My recommendation: `requireAppOwner()`**, because cron health is
deployment state, not course data, and REL1 says there are no members today,
so the restrictive direction costs nothing now and is the reversible choice
if a future instructor role should see it. Either answer ships in wave 3 (or
is excluded from it, per section 7) with no further round.

**Fork 2 - `github-student-repos.ts` (3 calls, collaborator/invitation
management on student repos).** This produces `requireAppOwner()` now with a
documented future revisit, or `requireUser()` now on the premise that a
future instructor should already be able to manage their own students' repos
without a second migration later; which do you want? Today `requireAppOwner()`
costs nothing (REL1: no members), but it is a product decision about a
not-yet-built multi-instructor capability, not something derivable from the
current code or security posture. **My recommendation: `requireAppOwner()`
now**, on the same reversibility argument as Fork 1 - locking a currently
nonexistent user out costs nothing today, and loosening it later when the
capability is actually built is a one-line, easily-reviewed change; the
opposite mistake (loosening it now for a capability nobody can use yet)
carries the exposure with no offsetting benefit. Either answer ships in wave
1 with no further round.

Both forks ride alongside the wave plan in section 7 rather than gating it: wave 1's
9 files do not include `github-student-repos.ts`'s disposition as a blocker
for the other 8, and wave 3 already excludes `cron-heartbeat.ts` pending Fork
1. Work on the rest of the row proceeds regardless of when these two are
answered.

---

## 10. Residual register

Unchanged from the prior pass; re-confirmed today that none has been
discharged (no commit since `d0b46dd` touches any named file or runs any
named instrument).

| # | Residual | Owner | Instrument | Object / direction of failure | Step |
|---|---|---|---|---|---|
| R2-r1 | Per-action classification inside the 9 Group-A files is not done - files are classified, not the 83 call sites | wave-1 implementer | New `GITHUB_OWNER_ONLY_ACTIONS` closure block in `action-guard-coverage.test.ts`, modelled on `:626-645` | Each `export async function` in the 9 files. FAILS PERMISSIVE if an action reaching `ghFetch` keeps `requireUser()`; FAILS RESTRICTIVE if a non-token action gains `requireAppOwner()` | Wave 0 adds the block empty; wave 1 populates it per action, block fails on any unlisted `requireAppOwner` in those files |
| R2-r2 | 53 of 56 service-role-plus-discarded-result sites in 10 files not yet read (only `accommodations.ts`, `research.ts`, `grading.ts` sampled, plus `cron-heartbeat.ts` fully resolved as R2-r3/Fork 1) | wave-2 / wave-3 implementer | Read each of the remaining 7 files' listed lines: `canvas-inbox.ts` (17), `grading.ts` (11 more), `research.ts` (13), `course-hub-integrations.ts` (3), `live-class.ts` (3), `lms-syllabus-buttons.ts` (3), `messaging.ts` (2), `src/app/api/lms-export/selection/route.ts` (1) | Each of the 53 sites. FAILS if a site reaches data not scoped by the caller's identity and lands on `requireUser()` | Before each wave writes its cohort, read the named lines and record the scoping key |
| R2-r3 | `cron-heartbeat.ts:31` ambiguity | repo owner | Fork 1, section 9 | Whether cron health is owner-private; fails quietly either way | Owner answers Fork 1; wave 3 excludes the file until then |
| R2-r4 | `github-student-repos.ts` product decision | repo owner | Fork 2, section 9 | Whether a future instructor manages their own students' repos; fails restrictive later if locked and never revisited | Owner answers Fork 2; default `requireAppOwner()` applied in wave 1 regardless, per the recommendation |
| R2-r5 | 6 Route Handlers carry 1 `await requireOwner()` each, invisible to every instrument here | wave-2 / wave-3 implementer | None exists yet | The 6 route files; reclassify wrongly and every gate stays green | Extend `collectActionExports` to a second pass over `route.ts` without the `"use server"` gate, or add a dedicated source-text test naming the 6 paths - decide in wave 0, build before wave 2 |
| R2-r6 | "A `vi.mock` factory missing an export fails loudly" is a READING claim, not yet measured | wave-0 implementer | The `legibility-probe.ts` one-file experiment | vitest's behaviour on a mocked module missing a named export; FAILS EXPENSIVELY if silent (73 test files then assert against `undefined`) | Run before wave 1 writes anything; restore via `cp` backup |
| R2-r7 | Nothing in this repo can exercise an authorization DECISION | repo owner | A real signed-in session; the 5 checks in section 6 | The member/owner boundary at runtime; fails in both directions, invisible to any gate here | Run the 5 checks after each wave's push, not once at the end |
| R2-r8 | The alias survives until wave 4; a new call site can be added with every gate green until then | wave-4 implementer | `grep -rnE "await requireOwner\(\)" src/ \| wc -l` -> must be 0 | The alias export `auth.ts:451-453`; a new feature writes `requireOwner()` and inherits the weaker check | Delete the export in wave 4; until then this is stated, not assumed away |
| R2-r9 | Wave test-file lists must be re-derived per file, not trusted from any prior document (11 of 79 test files were unmatched by the original import resolver) | each wave's implementer | `grep -rl ... \| xargs grep -l <basename>` per production file | Each wave's test-file list; fails if a test is left behind and `npm test` goes red later, attributed to the wrong change | Re-derive at the start of each wave; gate on a whole-tree `grep -rn "requireOwner" src/ --include=*.test.ts` after |
| R2-r10 | Any scratchpad classification script built for a wave must canary its own file count against a plain shell command before being trusted (a `subprocess.run` pattern with embedded double quotes silently matched nothing and exited 0 in the prior pass) | each wave's implementer | A non-empty-list assertion inside the script, cross-checked against a plain `grep -rl` count | Any re-run of a cohort/classification script; fails silently and permissively (empty cohort reads as "nothing left") | Check the script's printed total against the plain shell command before trusting a re-run |

---

## 11. What I could not determine

- **No authorization decision was exercised.** No `.env` (`ls .env* 2>&1`
  returns nothing this pass), so `resolveAccess` never ran against a real row.
  Every claim in section 1 is read from source; every item in section 6's owner-verification
  list is unverifiable here by construction.
- **No component rendered.** Whether a member sees a disabled control or an
  error toast on a denied Group-A action is not knowable here.
- **I did not run `npm test`, `npx tsc --noEmit`, or `npm run build`.** This is
  a scoping artifact that writes one file under `docs/`; `tsc` has exactly one
  sanctioned caller and it is the wave gate.
- **I did not classify the 83 GitHub call sites individually** (R2-r1), **did
  not read 53 of the 56 service-role discard sites** (R2-r2), **did not
  independently re-walk Group C's 45 files** (arithmetic only, section 3), and **did
  not run the `vi.mock` missing-export experiment** (R2-r6). Each is a
  residual with an owner and a step.
- **The Supabase RLS posture behind `createServiceClient()` is out of scope
  and unverified.** R2 changes which accounts reach that code, not what the
  code does once reached.
- **Whether any of the 62 commits since `d0b46dd` changed anything OUTSIDE the
  specific files I checked** (`auth.ts`, the instrument, `github.repos.ts`,
  `canvas-credentials.ts`, the 9 Group-A files, `cron-heartbeat.ts`,
  `course-hub-integrations.ts`) that would matter to R2. I checked the files
  the prior scope's own claims depend on; I did not diff all 62 commits in
  full. This is a real limit of this restructuring, stated rather than
  papered over.

---

## 12. Gates run for this artifact

```
tr -d -c '\000' < docs/r2-scope.md | wc -c            -> 0 (checked after write, see report)
LC_ALL=C grep -c '[^ -~\t]' docs/r2-scope.md          -> see report (pure-ASCII check)
wc -l docs/r2-scope.md                                -> see report
npm run test:paths -- src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts
git status --short
```

Results are recorded in this seat's handback report rather than here, because
a file cannot honestly state its own final line count or its own gate output.
