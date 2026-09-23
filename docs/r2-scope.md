# R2 scope: reclassifying the `requireOwner()` call sites

Seat: `loop-seat`. Consumer: the wave-plan / implementer chain for backlog row
`R2` (`docs/backlog.yml:84`). Everything below was measured in this checkout on
2026-09-23 unless a line says otherwise; every quantity names the command that
produced it. Every `file:line` citation was opened this pass.

**The row's own instruction invites a mechanical sweep and a sweep is wrong.**
Section 3 gives two call sites that break in OPPOSITE directions under a blanket
rule, both in one file. Section 1 explains why: the alias hides a distinction,
and the distinction is not recoverable from the call site's spelling.

---

## 0. The headline, before the evidence

Three facts decide almost everything, and only one of them was already written
down anywhere:

1. **The Canvas containment has LANDED**, but not where the row says to look for
   it. `src/lib/canvas-core.ts` does have zero guard calls (the row is right
   about that), because credential resolution moved to
   `src/lib/canvas-credentials.ts:189`, whose `resolveCanvasCredential` refuses
   the owner's env fallback to any identity whose role is not literally `owner`
   (`src/lib/canvas-credentials.ts:220`). So a Canvas call site's guard is no
   longer the only thing standing between a member and the owner's token.
2. **The GitHub containment has NOT landed.** `githubToken()`
   (`src/lib/github.repos.ts:8-10`) reads `process.env.GITHUB_TOKEN`
   unconditionally, and nothing in that chain checks an identity - measured by
   `grep -nE "require(Owner|User|AppOwner)[[:space:]]*\(" src/lib/github.repos.ts`,
   which exits 1 with no output against a canary of the same command on
   `src/app/actions/media-avatar.ts`, which exits 0 with three hits. So for the
   GitHub cohort the call-site guard IS the only containment today.
3. **Two call sites already depend on the weaker semantics on purpose**, with
   an in-body role branch that `requireAppOwner()` would make dead code
   (`src/app/actions/course-hub-integrations.ts:170` and `:214`). These are the
   proof that no blanket rule survives.

The architecture doc predicted (2) would be false. `docs/multi-user-login-architecture.md:379-380`
states that `githubToken()` "is consulted from exactly ONE place, `ghFetch`
(`src/lib/github.repos.ts:32`)". Measured against the tree:
`grep -rn "githubToken" src/ --include=*.ts --include=*.tsx | grep -v "\.test\."`
returns 13 lines, of which 6 are call expressions, in 5 files -
`github-models.ts:48`, `github-models.ts:62`, `github.actions.ts:240`,
`github.copilot.ts:12`, `github.pulls.ts:12`, `github.repos.ts:32`. The doc's
"single assertion" plan was priced against a number that is no longer true.

---

## 1. The three functions, read from source

| Function | Definition | What it actually checks | What it throws |
|---|---|---|---|
| `requireUser()` | `src/lib/supabase/auth.ts:328-366` | Impersonated identity must be BOTH `status === "active"` AND `role === "owner"` (`:331`); otherwise `resolveSessionAccess()` then `canUseApp(decision)` (`:338`), then AAL2 step-up (`:357`), then reconciles the caller's own row (`:358`) | `throwForDecision(decision)` (`:347`), or `NOT_AUTHORIZED_MESSAGE` on the impersonation branch (`:332`) |
| `requireAppOwner()` | `src/lib/supabase/auth.ts:408-434` | Same impersonation precondition (`:411`); then `isOwnerDecision(decision)` (`:418`), i.e. the decision must be literally `owner`; then AAL2 (`:426`) | `throwForDecision(decision)` (`:419`); an `active` non-owner gets `OWNER_ONLY_MESSAGE` (`:45`, `:68`) |
| `requireOwner()` | `src/lib/supabase/auth.ts:451-453` | **Nothing of its own.** The entire body is `return requireUser();` (`:452`) | Whatever `requireUser()` throws |

`canUseApp` is `decision === "active" || decision === "owner"`
(`src/lib/access.ts:194-196`). `isOwnerDecision` is `decision === "owner"`
(`src/lib/access.ts:199-201`). So the gap between the two guards is exactly the
`active` decision: an approved, non-owner account.

**The deprecated alias's own doc comment**, `src/lib/supabase/auth.ts:436-450`,
verbatim on the load-bearing sentences:

- ":437-438" - "Use requireUser() (any active account) or requireAppOwner()
  (owner only) instead."
- ":447-449" - "Until that wave lands, this alias is DELIBERATELY LESS
  RESTRICTIVE than the requireOwner() it replaces for those specific call sites
  - a tracked, temporary state, not an oversight."
- ":444-447" - "Delegates to requireUser() ... because that is what the majority
  of those call sites actually need; the minority that reach an owner-private
  shared secret are the ones the follow-up wave must move to requireAppOwner()
  explicitly."

**That comment carries a stale quantity of its own**: `:438` says "the ~105
existing source files that still import requireOwner()", and `:288` says
"the ~496-invocation deprecated alias". Measured this pass: 81 non-test files
and 408 invocations (section 2). Do not re-quote either number from that file.

### Does the `isOwnerEmail` / `emailVerified` finding interact here?

Yes, and it makes `requireAppOwner()` safe to use rather than unsafe - but the
interaction is one level down and easy to state wrongly.

`resolveAccess` returns `owner` on the break-glass path only when
`isOwnerEmail(email) && input.emailVerified` (`src/lib/access.ts:168-170`), and
that is the ONLY place `emailVerified` is consulted (`src/lib/access.ts:166-167`,
stated in the code comment). `resolveSessionAccess` supplies it as
`Boolean(user?.email_confirmed_at)` (`src/lib/supabase/auth.ts:182`).

So `isOwnerDecision(decision)` in `requireAppOwner()` is strictly stronger than
"the caller's address is on `OWNER_EMAILS`": an allowlisted-but-unverified
address falls through to the ordinary stored-row path (`src/lib/access.ts:126-127`)
and is graded on its row like anybody else. **Consequence for R2: no call site
needs its own `isOwnerEmail` check, and none should grow one.** The one live
hazard the earlier row flagged - an unverified allowlisted address badging as an
owner - is upstream of both guards and is not reopened by anything in this scope.

**What this does NOT settle, and I am not claiming it does:** whether a real
Supabase session can reach `requireAppOwner()` with
`email_confirmed_at` set but an `app_users` row saying `suspended`. Section 5
routes that to an owner check; it cannot be exercised here.

---

## 2. The call-site census

### Commands, with canaries

```
grep -roE "await requireOwner\(\)" src/ | wc -l                          -> 411
grep -rnE "await requireOwner\(\)" src/ | grep -v "\.test\." | wc -l     -> 408
grep -rnE "await requireOwner\(\)" src/ | grep -c "\.test\."             ->   3
grep -rlE "await requireOwner\(\)" src/ | grep -v "\.test\." | wc -l     ->  81
grep -roE "requireOwner\(\)" src/ | wc -l                                -> 530
```

Canaries run in the same invocation, same pattern shape:

- POSITIVE: `grep -roE "await requireUser\(\)" src/ | wc -l` -> `57`;
  `grep -roE "await requireAppOwner\(\)" src/ | wc -l` -> `23`. The pattern
  compiles and fires.
- NEGATIVE: `grep -roE "await requireOwnerZZZ\(\)" src/ | wc -l` -> `0`. A zero
  is reachable, so a zero elsewhere is evidence rather than a broken command.
- EXTENSION CANARY (the `--include=*.ts` defect named in the brief): no
  `--include` filter is used above, so `.tsx` cannot be hidden. Checked
  explicitly: `grep -rln "requireOwner" src/ --include=*.tsx | wc -l` -> `1`,
  and that one hit is a COMMENT, `src/app/account/people/page.tsx:58`, not a
  call. Canary that the `--include=*.tsx` filter itself works:
  `grep -rln "useState" src/ --include=*.tsx | wc -l` -> `196`.
- HEAD CANARY (the "absence piped through `head`" defect): the accessor checks
  in section 0 were re-run WITHOUT `head` so the reported exit code is grep's
  own. First run reported `exit 0` for an empty result because `head` was in the
  pipe; the re-run reports `exit 1`. Both runs are recorded here deliberately.
- ERE CANARY (the `[^\n]` defect): no bracket expression is used in any pattern
  above. The one character class used is `[[:space:]]`, a POSIX class, in the
  accessor check.

### Is every production call an `await requireOwner()`?

Yes. `grep -rnE "requireOwner\(\)" src/ | grep -v "await requireOwner()" | grep -vE ":[0-9]+:\s*(//|\*|/\*)"`
returns 10 lines; 7 are in `*.test.ts`, 1 is the definition itself
(`src/lib/supabase/auth.ts:451`), 1 is a backlog-tooling label
(`src/tools/backlog/areas.ts:42`), and 1 is a test title string. **Zero
production call expressions sit outside an `await` prefix**, so `await
requireOwner()` is a complete census of the production call surface, not a
sample of it. The gap between 530 and 411 is comment prose.

### Shape of the 408

`grep`-driven Python pass (`scratchpad/retval.py`, classifying the text left of
each `await requireOwner()`):

| Shape | Count |
|---|---|
| Result discarded (`await requireOwner();`) | 255 |
| Bound (`const user = await requireOwner();`) | 153 |
| Destructured | 0 |
| Anything else | 0 |
| **Total** | **408** |

`grep -rn "\.role" src/app/actions src/app/api` (non-test) returns 7 lines, of
which exactly **2 read `.role` off a guard result**:
`src/app/actions/course-hub-integrations.ts:170` and `:214`. The other 5 are
chat-message roles and snapshot-shot roles, unrelated.

So the return-shape claim in `docs/multi-user-login-architecture.md:159-161`
holds against the tree: **no call site's BODY changes under a reclassification.**
That is the reason the change is cheap. It is emphatically not a reason the
change is mechanical.

### Neighbouring guards, for sizing

| Guard | Prod calls | Prod files | Command |
|---|---|---|---|
| `requireOwner()` | 408 | 81 | above |
| `requireUser()` | 47 | 12 | `grep -rnE "await requireUser\(\)" src/ \| grep -v "\.test\." \| wc -l` (and `-rlE` for files) |
| `requireAppOwner()` | 20 | 4 | same shape |

The row's instrument field says `requireAppOwner()` is "19 files / 23 direct
calls". Re-measured: **23 calls INCLUDING tests, 20 excluding**, and **4
production files**, not 19 - `grep -rl requireAppOwner` counts files that merely
NAME it in a comment (`src/lib/supabase/proxy.ts`, `src/app/layout.tsx`,
`src/context/SupabaseProvider.tsx`, and 12 more). The 4 production callers are
`src/app/account/people/actions.ts` (5), `src/app/account/people/page.tsx` (1),
`src/app/actions/media-avatar.ts` (3), `src/app/actions/media-likeness.ts` (11).

### The test-side census, which is the real cost

`grep -rl "requireOwner" src/ --include=*.test.ts | wc -l` -> **79 test files**.

A Python walk over every `*.test.ts` (`scratchpad/mocks2.py`) classifies each
`vi.mock("@/lib/supabase/auth"` call site by what its factory names within 25
lines:

| Factory names | Count |
|---|---|
| `requireOwner` ONLY | 73 |
| `requireOwner` AND (`requireUser` or `requireAppOwner`) | **0** |
| Neither (already migrated: media, snapshot, people, lms-actions) | 12 |
| **Total `vi.mock` call sites on that module** | **85** |

**These three numbers were cross-checked against a third, independent
instrument after a first attempt returned a silent zero.** The shell-only
version, which shares no code with the Python walk:

```
grep -rc 'vi.mock("@/lib/supabase/auth"' src/ --include=*.test.ts \
  | grep -v ":0$" | awk -F: '{s+=$2} END {print s}'          -> 85
grep -rl 'vi.mock("@/lib/supabase/auth"' src/ --include=*.test.ts | wc -l   -> 85
... | xargs grep -l "requireOwner" | wc -l                                  -> 73
... | xargs grep -lE "requireUser|requireAppOwner" | wc -l                   -> 13
... | xargs grep -l "requireOwnerZZZ" | wc -l                                ->  0  (canary)
```

The 13 is a WHOLE-FILE measure against the table's 25-line-window measure, so
the two are different objects and 73 + 12 = 85 is not in tension with it. The
single file in both sets is `src/app/actions/course-hub-integrations.test.ts`,
and its only `requireUser` mention is prose in a comment at `:6`; its factory at
`:23` names `requireOwner` alone. **So "zero factories are dual-mocked" holds
under both instruments.**

**THE SILENT ZERO, recorded because it is a fourth defect of the shape the brief
names.** A first Python pass built its file list with
`subprocess.run(["grep", "-rl", 'vi.mock("@/lib/supabase/auth"', "src/", ...])`.
It reported `total factories: 0` and **exited 0**. The cause is the embedded
double quotes in the pattern argument: on this platform they do not survive
Python's argument round-trip to `grep`, so the pattern matched nothing, the loop
never ran, and an absence was reported as a measurement. The scratchpad scripts
cited elsewhere in this document (`classify.py`, `retval.py`, `cohorts.py`,
`svc.py`, `tests.py`) all pass patterns with NO embedded double quotes and all
returned non-empty results, which is why their numbers stand - but see residual
R2-r10 before re-running any of them with a modified pattern.

**Nothing is dual-mocked.** Each of the 73 factories replaces the whole auth
module with an object exporting only `requireOwner`, so a production file that
switches to `requireUser()` finds no such export on the mock. The already-landed
R3 cohort shows the fix shape verbatim: `src/app/actions/media-likeness.test.ts:29-31`
is `vi.mock("@/lib/supabase/auth", () => ({ requireAppOwner: vi.fn() }));`
against `src/app/actions/knowledge-base.test.ts:10-12`'s
`vi.mock("@/lib/supabase/auth", () => ({ requireOwner: vi.fn() }));`.

**I have NOT verified that vitest's failure for a missing mock export is loud
rather than silent.** It is a reading claim, and section 5 turns it into a
measured one before wave 1 ships a single file.

### One source-text test asserts the literal name

`src/app/components/tasks/taskCellAttachments.wiring.test.ts:414-417`:

```
it("calls requireOwner at least once per exported action", () => {
  const exported = source.match(/export async function/g)?.length ?? 0;
  expect(exported).toBeGreaterThan(0);
  expect(source.match(/requireOwner\(/g)?.length ?? 0).toBeGreaterThanOrEqual(exported);
});
```

`source` is `readSource("src/app/actions/course-task-attachments.ts")` (`:401`).
Reclassifying that file's 3 calls fails this test, and the test file is NOT in
`src/app/actions/`, so a wave scoped by directory would miss it. It is named
explicitly in wave 3's file list.

---

## 3. Disposition, per call site

**The classifying question is not "what does this action do" but "is the
call-site guard the only thing containing an owner-private resource on this
path".** Where containment landed at the resource, the site is `requireUser()`;
where it did not, the site is `requireAppOwner()` or the row is blocked on the
containment landing first.

### Group A - GitHub-reaching: 9 files, 83 calls -> `requireAppOwner()`, per action

Files (command: `scratchpad/cohorts.py`, which partitions the 81 files by
whether they import from a `@/lib/github*` specifier):

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
```

Reasoning, verified rather than assumed: every one of the 9 imports at least one
function from `@/lib/github`, and every such function reaches `ghFetch`
(`src/lib/github.repos.ts:28-32`) or `ghJson` (`:53`), both of which attach
`Bearer ${githubToken()}`. Traced one end to end to prove the chain rather than
assert it: `getFileText` is imported by `live-class.ts:54` and `visualizer.ts:12`,
is defined at `src/lib/github.files.ts:50-55`, and its body calls `ghFetch`,
imported at `src/lib/github.files.ts:4`. `GITHUB_TOKEN` is a single deployment
PAT (`src/lib/github.repos.ts:9`) against the owner's own repos and org.

**This group is the one where a wrong answer in the permissive direction is a
live exposure today**, because there is no second containment behind it.

**NOT mechanical, and the per-action pass is mandatory.** These 9 files export
actions that do NOT all touch the token. `githubConfiguredAction` is already in
the coverage test's `PINNED_UNGUARDED` list
(`src/app/actions/action-guard-coverage.test.ts:256`) - it has no guard at all -
and `github.ts` alone imports 30-odd names at `:10`, not all of which are network
calls. The instrument for the per-action pass: for each `export async function`
in these 9 files, decide whether its body reaches an imported `@/lib/github`
symbol. **I did not perform 83 per-action judgements in this pass and am not
reporting one.** Wave 1 owes them, at roughly 9 file-scale decisions with a
handful of exceptions each.

**FLAGGED UNCERTAIN - `src/app/actions/github-student-repos.ts` (3 calls).** It
manages collaborators and invitations on student repos
(`listRepoCollaborators`, `setRepoCollaborator`, `listRepoInvitations`,
`deleteRepoInvitation`, imported at `:14-22`). Under a future multi-instructor
deployment, an instructor plausibly SHOULD manage their own students' repos, and
`requireAppOwner()` would lock them out. Today `REL1` says there are no members,
so `requireAppOwner()` costs nothing and is the safe direction - but this is a
product decision, not a security derivation, and it is in the residual register
as such.

### Group B - Canvas-reaching, not GitHub: 27 files, 160 calls -> `requireUser()`

Files and per-file counts are in `scratchpad/cohorts.py`'s wave-2 block;
the four largest are `canvas-files-bulk.ts` (34), `canvas-inbox.ts` (19),
`grading.ts` (20), `canvas-accessibility.ts` (14).

Reasoning: the containment is at the credential, verified at
`src/lib/canvas-credentials.ts:189-228`. `resolveCanvasCredential` reads the
CALLING identity's own stored row first (`:192-195`), and reaches the owner's
env-configured pair only under `if (identity.role === "owner")` (`:220`).
`src/lib/canvas-core.ts:9-23` states in its own header that
`canvas-credentials.ts` is "now the ONLY module allowed to read those vars" and
that the four resolvers delegate to it - and `grep -n "process.env" src/lib/canvas-core.ts`
finds the string only inside that comment block, never in code.

So a member reaching a Canvas action gets their OWN Canvas, or the one
indistinguishable failure (`CANVAS_CREDENTIAL_REQUIRED_MESSAGE`, `:228`). That
is the intended product behaviour, and `requireAppOwner()` here would delete a
capability members are supposed to have.

**TWO SITES IN THIS GROUP MUST BE `requireUser()` AND WOULD BREAK UNDER A
SWEEP TOWARD `requireAppOwner()`**, which is the concrete refutation of any
blanket rule:

- `src/app/actions/course-hub-integrations.ts:169-170` -
  `const identity = await requireOwner(); const isOwner = identity.role === "owner";`
  then `isOwner && !!process.env[...]` at `:176-181`. Under `requireAppOwner()`,
  `isOwner` is unconditionally true and the member branch is unreachable; the
  action's own doc comment at `:147-159` says the fix was made "in the BODY, not
  the guard" ON PURPOSE.
- `src/app/actions/course-hub-integrations.ts:213-214` -
  `listConfiguredInstitutionsAction`, same shape, documented at `:189-205`,
  including that this is "the one place outside canvas-credentials.ts still
  allowed to read a `<CODE>_CANVAS_*` env var by name".

A sweep in the other direction - the permissive one - leaves these two exactly
as they are, which is correct. That asymmetry is the whole reason the row cannot
be a sweep: the two file-internal call sites next to each other in
`course-hub-integrations.ts` (`:44`, `:248`, `:266` discard the result and are
plain `requireUser()` sites) and these two (which READ the role) end up in the
same guard by different reasoning, and a third site in a GitHub file two
directories away ends up in a different guard entirely.

### Group C - remainder: 45 files, 165 calls -> `requireUser()`

Reasoning, by what each reaches (measured by `scratchpad/classify.py`, which
reports per file whether it imports an LLM, Google, Microsoft, or service-role
module and which `process.env.*` names it reads):

- **Per-user credential stores.** `messaging-outlook.ts` (7) and
  `course-planning-*.ts` reach Microsoft; `course-calendar.ts` (3) and
  `messaging-scheduling.ts` (4) reach Google. Both stores are keyed on
  `user_id`: `src/lib/microsoft-credentials.ts:31-34` and
  `src/lib/google-credentials.ts:29-32`. No owner-private secret is behind them.
- **Service-role DB access scoped by the guard's own id.** The dominant idiom:
  `const user = await requireOwner(); const supabase = createServiceClient();`
  then `.eq("user_id", user.id)` - e.g. `src/app/actions/workflow-support.ts:22-29`,
  `:61-68`, `:118-127`. `requireUser()` returns the same `id`, so the scoping is
  unchanged. Same idiom in `knowledge-base.ts`, `artifact-templates.ts`,
  `task-institution-instructions.ts`, `automation-runs.ts`.
- **Shared LLM key, no owner-private identity behind it.** `research.ts` (17),
  `syllabus-templates.ts` (15), `llm-tools.ts` (8), and the one-and-two-call
  generator actions. This is EXACTLY the reasoning R3 already applied and
  shipped for `media.ts` / `media-voice.ts`, recorded at
  `src/app/actions/action-guard-coverage.test.ts:312-317`: a shared billing key
  with no owner-private identity behind it is `requireUser()`, and spend
  containment is a separate, deferred quota item
  (`docs/multi-user-login-architecture.md:426-431`).

**FLAGGED UNCERTAIN - `src/app/actions/cron-heartbeat.ts:31` (1 call).** Unlike
every other site in Group C, it discards the guard result and reads a GLOBAL row:
`await requireOwner(); const supabase = createServiceClient(); return await readCronHeartbeat(supabase);`
(`:30-33`). There is no `user_id` anywhere in it. This is deployment-operational
state - whether the owner's cron is ticking - and a defensible argument exists
for `requireAppOwner()`. Harm is low in both directions (the action's own catch
returns `null`, `:34-36`, so a denied member sees "never" rather than an error),
which is exactly why it is easy to get wrong silently. **I am not deciding it.**

**FLAGGED UNCERTAIN as a class - 56 call sites in 10 files that use the service
role AND discard the guard result**, so the guard supplies no id to scope on
(command and per-file line numbers: `scratchpad/svc.py`). Sampled three:
`accommodations.ts:78` and `:90` pass straight to Canvas, so
`resolveCanvasCredential` scopes them (safe, Group B);
`research.ts:30` and `grading.ts:54` are LLM/Canvas passthroughs (safe, Groups
B/C); `cron-heartbeat.ts:31` is the global read above. **I sampled 3 files of
10 and am reporting a sample, not a census.** The remaining 7 -
`canvas-inbox.ts` (17 sites), `grading.ts` (11), `research.ts` (13),
`course-hub-integrations.ts` (3), `live-class.ts` (3),
`lms-syllabus-buttons.ts` (3), `messaging.ts` (2),
`src/app/api/lms-export/selection/route.ts` (1) - need the same check, and it
is in the residual register with an owner, an instrument and a step.

### What IS genuinely mechanical, and why

Once a file's group is decided, the edit inside it is mechanical for every call
site EXCEPT a site that reads `.role` off the result. That is 2 sites out of 408
(section 2), both named above. Concretely, the mechanical part is: the
identifier at the call, the import specifier at the top of the file, and the
`vi.mock` factory in the coupled test. The NON-mechanical part is the group
decision (3 judgements, made above) plus the per-action pass inside Group A
(~9 files' worth) plus the 2 role-reading sites plus the 2 flagged uncertainties.
**Calling the whole row mechanical would have swept 83 GitHub calls to
`requireUser()` and left the owner's PAT reachable by any approved account,
with every gate green.**

---

## 4. The instrument: `src/app/actions/action-guard-coverage.test.ts`

647 lines (`wc -l`). Both counters agree: `@(Get-Content).Count` -> 647.

### What it does cover

| Mechanism | Line | What it pins |
|---|---|---|
| `collectCandidateFiles` | `:97-110` | Recursive walk of `src/app`, `.ts` and `.tsx`, skipping `.test.` |
| `isUseServerModule` | `:84-86` | **`/^\s*["']use server["']/m` - a file WITHOUT the directive is skipped entirely (`:123`)** |
| `GUARD_CALL` | `:61` | `/\brequire(Owner\|User\|AppOwner)\s*\(/` - treats all three as interchangeable "guarded" |
| `PINNED_UNGUARDED` | `:235-264`, asserted `:450` | **Exact-set**, 28 entries (`sed -n '236,263p' ... \| grep -c '^\s*"'` -> 28) |
| `OWNER_ONLY` | `:297-346`, asserted `:491-496` | 19 entries (5 admin + 14 media). Each MUST call `requireAppOwner(` and MUST NOT call `requireOwner(` or `requireUser(` (`:400-414`) |
| `MEDIA_OWNER_ONLY_ACTIONS` | `:354-369`, asserted `:599` | Exactly 14, hardcoded |
| Media file closure | `:608-624`, `:626-645` | Scoped to `MEDIA_FILES` (`:373-378`): no alias left, and every non-owner-only media action calls `requireUser(` directly |
| Self-tests of the checker | `:499-578` | Proves `checkOwnerOnlyEntry` fails for a missing name, a bare `requireUser`, and the `requireOwner` alias, and passes for `requireAppOwner` |

### What it does NOT cover, measured

- **The 6 Route Handlers.** `for f in <the six>; do grep -c '^\s*["'\'']use server' $f; done`
  returns `0` for every one of
  `src/app/api/visualizer/create/route.ts`, `.../lms-generation/deck/route.ts`,
  `.../lms-generation/deck-from-capture/route.ts`, `.../lms-export/selection/route.ts`,
  `.../automations/run-now/route.ts`, `.../accessibility/route.ts`. Each holds
  exactly 1 `await requireOwner()`. **These 6 calls are invisible to every
  assertion in this file** and stay invisible after R2 unless something else is
  built. Confirms the sibling pass's finding independently.
- **Anything outside `src/app`.** `APP_DIR` is `src/app` (`:60`).
- **Whether a reclassified site is RECORDED.** `OWNER_ONLY` is checked
  entry-by-entry (`:493`), never as a closure over the tree. A site moved to
  `requireAppOwner()` and left out of `OWNER_ONLY` fails nothing. The closure
  test that would catch it (`:626-645`) is hardcoded to `MEDIA_FILES` only.
  **This is the instrument gap R2 must close, not merely live with.**
- **Any runtime authorization behaviour.** Every assertion here is source text.

### Exactly which lines move, and when

1. **`PINNED_UNGUARDED` (`:235-264`) does NOT move for a reclassification.**
   `GUARD_CALL` (`:61`) matches all three names, so `guarded` is unchanged when
   `requireOwner` becomes `requireUser`. The exact-set assertion at `:450` stays
   green. Anyone expecting this list to be the tripwire will be surprised; it is
   not. It moves only if an action in `PINNED_UNGUARDED` GAINS a guard, which
   R2 should not do.
2. **`OWNER_ONLY` (`:297-346`) gains one entry per action moved to
   `requireAppOwner()`, each with a one-line reason.** The map currently ends at
   `:345` (`refreshAvatarVideoAction`); new entries append before the closing
   `};` at `:346`. The wave-1 cohort is the only source of new entries under the
   dispositions above.
3. **A GITHUB closure block must be ADDED, modelled line-for-line on
   `:582-646`.** New constants beside `MEDIA_FILES` (`:373-378`) naming the 9
   Group A files, and a `GITHUB_OWNER_ONLY_ACTIONS` list beside
   `MEDIA_OWNER_ONLY_ACTIONS` (`:354-369`) with its own
   `expect(...length).toBe(N)` pin mirroring `:599`. Without it, wave 1 can move
   an action to `requireAppOwner()` and forget to record it, and nothing fails.
4. **`MEDIA_OWNER_ONLY_ACTIONS.length` at `:599` and the
   `inMediaFiles.length` floor at `:616` do not move.** R2 touches no media file
   (`grep -c "await requireOwner()" src/app/actions/media*.ts` -> 0 in all four).

**That an exact-set test must be edited is the feature.** The edit is the record
that a human decided which guard each action gets. A wave that changes production
guards without touching this file has either changed nothing owner-only or has
skipped the record, and `git status --short` distinguishes those two.

---

## 5. How a wrong answer would be caught

`docs/loop/this-repo.md:240-242` and `:126-132`: no component renders under
vitest, and the network is blocked. So **no authorization DECISION can be
exercised end to end in this checkout.** There is no `.env`
(`docs/loop/this-repo.md:227-229`), so there is no Supabase session to resolve,
which means `resolveAccess` never runs against a real row here.

### What CAN be asserted here, by instrument

| Claim | Instrument | Direction of failure |
|---|---|---|
| Action X's body calls `requireAppOwner(` and neither of the other two | `checkOwnerOnlyEntry` (`action-guard-coverage.test.ts:388-416`), driven from `OWNER_ONLY` | Fails if X uses the alias or a bare `requireUser` |
| No action in a named file set still calls the alias | The `:608-624` shape, re-pointed at the Group A file set | Fails listing `file:line name` |
| Every non-owner-only action in a named file set calls `requireUser(` directly | The `:637-645` loop | Fails naming the action |
| `requireUser` admits `active`, `requireAppOwner` refuses it | `src/lib/supabase/auth.test.ts` (existing, mocks the Supabase client) | Fails on the thrown message |
| `course-task-attachments.ts` guards every export | `taskCellAttachments.wiring.test.ts:414-417` - **update the regex in the same commit** | Fails on the count |

### What must be OWNER-VERIFIED in a real session

An agent cannot run any of these. Each is written to be runnable as-is.

1. **Member cannot reach a GitHub action.** Sign in as an `active`,
   `role: "instructor"` account (create one via the account-people admin
   surface, approve it). Open the repo/GitHub surface and trigger any action in
   Group A. EXPECT: `"This action is limited to the workspace owner."` -
   `OWNER_ONLY_MESSAGE`, `src/lib/supabase/auth.ts:45`. A generic
   `"Not authorized. Sign in with an approved account."` means the wrong
   `throwForDecision` branch fired; a SUCCESS means the reclassification missed
   that action.
2. **Owner is not locked out of anything.** Same surfaces, signed in as the
   owner. EXPECT: every Group A, B and C surface behaves exactly as before the
   change. This is the check that catches the opposite-direction failure, and it
   is the one most likely to be skipped because nothing looks broken until a
   specific button is pressed.
3. **Member still reaches their OWN Canvas.** As the member, connect a personal
   Canvas credential on the integrations page, then use a Group B surface.
   EXPECT: it works against the member's own Canvas. EXPECT ALSO: with NO stored
   credential, the failure is `CANVAS_CREDENTIAL_REQUIRED_MESSAGE`
   (`src/lib/canvas-credentials.ts:228`) and never the owner's data.
4. **The two role-reading sites still branch.** As the member, load the Live
   Feed institution table (`checkInstitutionsAction`). EXPECT: institutions the
   MEMBER has stored rows for, and no institution the owner has only an env var
   for. As the owner: the union. This is the direct observation that
   `course-hub-integrations.ts:170` and `:214` were not swept.
5. **Unattended runs still work.** Let a scheduled workflow tick, or trigger one.
   EXPECT: unchanged. `runAsOwner` impersonation must still satisfy both guards
   (`src/lib/supabase/auth.ts:329-335`, `:409-415`) - both require
   `status === "active" && role === "owner"`, so this is not expected to change,
   but "not expected to change" is not a measurement and this is the cheapest
   way to get one.

### One thing to measure BEFORE wave 1 writes a production file

**Does a `vi.mock` factory missing an export fail loudly or silently?** The
73-file cost estimate rests on it. Cheapest instrument, costing one file and one
run: pick a single-call file with one coupled test - `src/app/actions/legibility-probe.ts`
(1 call) and `src/app/actions/legibility-probe.test.ts` - change ONLY the
production call to `requireUser()`, leave the test's factory naming
`requireOwner`, and run `npx vitest run src/app/actions/legibility-probe.test.ts`.
If it FAILS, the 73 renames are self-policing. If it PASSES, every one of the 73
tests is asserting against an undefined guard and the wave needs a real
instrument instead. Restore with a `cp` backup, never `git checkout --`.

---

## 6. Wave plan

Waves are ordered by exposure, not by size. Each list contains the file that
CALLS the changed guard, its coupled test file(s), and the instrument file when
that wave changes it.

**File-set disjointness holds across the three waves** (they partition the 81
files, `scratchpad/cohorts.py`), but they are NOT concurrency-safe: waves 1 and
3 both write `src/app/actions/action-guard-coverage.test.ts`, and wave 3 changes
`visualizer.ts`'s sibling `visualizer-selection.ts`. **Run them in sequence.**

### Wave 0 - the instrument, before any production file moves

Write set:
```
src/app/actions/action-guard-coverage.test.ts
```
Does: add the Group A closure block described in section 4 item 3
(`GITHUB_FILES`, `GITHUB_OWNER_ONLY_ACTIONS`, the three `it` blocks mirroring
`:597-646`), with the list EMPTY and the length pin at 0. Also runs the
loud-vs-silent measurement from section 5. Lands red-then-green so the
instrument is proven before it is trusted.

Gate: `npm run test:paths -- src/app/actions/action-guard-coverage.test.ts src/lib/supabase/auth.test.ts`

### Wave 1 - Group A, GitHub: 9 production files, 83 calls

Write set (production):
```
src/app/actions/github-repos.ts
src/app/actions/github.ts
src/app/actions/github-content.ts
src/app/actions/live-class.ts
src/app/actions/github-student-repos.ts
src/app/actions/visualizer.ts
src/app/actions/repo-grades.ts
src/app/actions/submission-repo.ts
src/app/actions/visualizer-coverage.ts
```
Write set (coupled tests and instrument):
```
src/app/actions/github-repos.grading.test.ts
src/app/actions/github-repos.grading.unmerged-branch.test.ts
src/app/actions/github.grading.test.ts
src/app/actions/github-student-repos.test.ts
src/app/actions/githubRepoGrading.wiring.test.ts
src/app/actions/live-class.test.ts
src/app/actions/submission-repo.test.ts
src/app/actions/visualizer.test.ts
src/app/actions/visualizer-coverage.test.ts
src/app/actions/visualizer-selection.test.ts
src/app/api/visualizer/create/route.test.ts
src/app/actions/action-guard-coverage.test.ts
```

**The test list above is from an IMPERFECT instrument and must be re-derived,
not trusted.** My import resolver (`scratchpad/tests.py`) left 11 of the 79
requireOwner-mentioning test files unmatched to any production file, 4 of them in
this cohort, because they import through the actions barrel or read source by
path rather than importing. The reliable derivation, run per production file:

```
grep -rl "requireOwner" src/ --include=*.test.ts | xargs grep -l "<basename>"
```

and then, as the wave gate, `grep -rn "requireOwner" src/ --include=*.test.ts`
over the whole tree, checking that every surviving hit belongs to a file this
wave did not touch.

Gate: `npm run test:paths -- <every test file in the write set>` (one argument
per file - never a raw multi-path `vitest run`, which silently drops unmatched
arguments per `docs/loop/this-repo.md:32-45`), then `npx tsc --noEmit`,
`npm run lint`, and `git status --short` against this list.

### Wave 2 - Group B, Canvas: 27 production files, 160 calls

Production write set is `scratchpad/cohorts.py`'s wave-2 block, verbatim.
Coupled tests derived by the command above, per file. `course-hub-integrations.ts`
and its test are in this wave; its two role-reading sites keep their semantics
and gain the role branch's first direct assertion.

Sub-split if the wave is too large to gate in one pass: `canvas-files-bulk.ts` +
`canvas-inbox.ts` + `grading.ts` + `canvas-accessibility.ts` (87 of the 160
calls) as 2a, the remaining 23 files as 2b. They are disjoint by file.

### Wave 3 - Group C, remainder: 45 production files, 165 calls

Production write set is `scratchpad/cohorts.py`'s wave-3 block, verbatim. Two
additions that a directory-scoped list would miss:

```
src/app/components/tasks/taskCellAttachments.wiring.test.ts   (asserts the literal name, :414-417)
src/app/actions/action-guard-coverage.test.ts                  (if cron-heartbeat lands owner-only)
```

`cron-heartbeat.ts` is EXCLUDED from this wave until the residual below is
answered. Leaving it on the alias is the status quo, which is the reversible
choice.

### Wave 4 - delete the alias

Only reachable when `grep -rnE "await requireOwner\(\)" src/ | wc -l` returns 0.
Write set: `src/lib/supabase/auth.ts` (delete `:436-453`) plus any test still
naming it. This is what converts R2 from a reclassification into an enforcement:
while the alias exists, the next feature can reintroduce a call site and every
gate stays green.

---

## 7. Disposition of the row's prior claims

R2 has not been scoped before, so there is no prior scope document to restructure.
This table disposes of the claims carried in the ROW ITSELF
(`docs/backlog.yml:84-96`) and in the two documents it cites, because the row's
own note says they "should be re-confirmed before scoping".

| Prior claim | Source | Disposition |
|---|---|---|
| `requireOwner` is `return requireUser()` at `auth.ts:451-452` | row title | **KEPT**, re-verified at `src/lib/supabase/auth.ts:451-453` |
| 411 invocations | row title/instrument | **KEPT** as the all-files figure; **REFINED**: 408 production, 3 in tests, 81 production files |
| 446 invocations | row note (already flagged stale) | **WITHDRAWN**, superseded by the above |
| `requireAppOwner()`: 19 files, 23 calls | row instrument | **CORRECTED**: 23 calls including tests, **20 production calls in 4 production files**; the 19 counts comment mentions |
| The alias's own "~105 files / ~496 invocations" | `auth.ts:438`, `:288` | **WITHDRAWN as a quantity**; 81 files / 408 calls measured. The prose around it stands |
| `canvas-core.ts` and `github.repos.ts` have zero guard calls | row note | **KEPT** (both exit 1 on the guard grep), but **REFRAMED**: for Canvas this is correct BY DESIGN because containment moved to `canvas-credentials.ts:189-228`; for GitHub it means there is no containment at all |
| "RESOLVED 3 - the split stands, chosen from the shared-secret audit" | `docs/multi-user-login-architecture.md:396-407` | **KEPT**, and section 3 is that audit performed against the tree |
| "`githubToken()` is consulted from exactly ONE place" | `docs/multi-user-login-architecture.md:379-380` | **WITHDRAWN**: 6 call expressions in 5 files, measured |
| "The sweep becomes a straight one-to-one mechanical rename with no per-site judgment at all" | `docs/multi-user-login-architecture.md:384-386` | **WITHDRAWN**: it was conditional on a containment that did not land for GitHub, and `course-hub-integrations.ts:170`/`:214` refute it independently |
| "the media-file cohort as first wave" | row note | **HANDED OVER - already discharged by R3.** `grep -c "await requireOwner()"` over the four media files returns 0 each; `OWNER_ONLY` carries the 14 media entries at `action-guard-coverage.test.ts:318-345` |
| Per-user spend quotas before sign-up opens | `docs/multi-user-login-architecture.md:426-431` | **HANDED OVER**, unchanged: not R2's, still owed, and R2 must not be read as closing it |

---

## 8. Residual register

Each entry names an owner, an instrument, the object compared, the direction of
failure, and the step that will measure it. An entry missing any of those is a
deletion, and there are none such below.

| # | Residual | Owner | Instrument | Object / direction of failure | Step |
|---|---|---|---|---|---|
| R2-r1 | The per-ACTION classification inside the 9 Group A files is not done. I classified the FILES, not the 83 call sites | wave-1 implementer | New `GITHUB_OWNER_ONLY_ACTIONS` closure block in `action-guard-coverage.test.ts`, modelled on `:626-645` | Object: each `export async function` in the 9 files. FAILS PERMISSIVE if an action reaching `ghFetch` keeps `requireUser()` (owner PAT reachable by any approved account); FAILS RESTRICTIVE if a non-token action gains `requireAppOwner()` (member locked out) | Wave 0 adds the block empty; wave 1 populates it per action and the block fails on any unlisted `requireAppOwner` in those files |
| R2-r2 | 7 of the 10 service-role-plus-discarded-result files were not inspected (53 of the 56 sites) | wave-2 / wave-3 implementer | `scratchpad/svc.py`, re-run; then read each listed line | Object: each of the 53 sites. FAILS if a site reaches data not scoped by the caller's identity and lands on `requireUser()` | Before each wave writes its cohort, read the named lines and record the scoping key for each |
| R2-r3 | `cron-heartbeat.ts:31` is genuinely ambiguous: a global deployment-health row behind a discarded guard | repo owner (product call) | `src/app/actions/cron-heartbeat.ts:29-36`, read | Object: whether cron health is owner-private. FAILS QUIETLY EITHER WAY - `:34-36` catches and returns `null`, so a member sees "never" instead of an error | Escalate as a one-line question with a recommendation (`requireAppOwner`, since it is deployment state, not course data); wave 3 excludes the file until answered |
| R2-r4 | `github-student-repos.ts` (3 calls) is a product decision, not a security derivation | repo owner (product call) | `src/app/actions/github-student-repos.ts:14-22`, read | Object: whether a future instructor manages their own students' repos. FAILS RESTRICTIVE later: `requireAppOwner()` locks out a capability instructors will want | Escalate alongside R2-r3; default to `requireAppOwner()` now, since REL1 says there are no members and the restrictive direction is reversible |
| R2-r5 | The 6 Route Handlers carry 1 `await requireOwner()` each and NO instrument can see them | wave-2 / wave-3 implementer | None exists. `isUseServerModule` (`action-guard-coverage.test.ts:84-86`, `:123`) skips them | Object: the 6 route files. FAILS SILENTLY: reclassify them wrongly and every gate stays green | Either extend `collectActionExports` to a second pass over `route.ts` files that does not require the directive, or add a dedicated source-text test naming the 6 paths. Decide in wave 0, build before wave 2 |
| R2-r6 | "A `vi.mock` factory missing an export fails loudly" is a READING claim | wave-0 implementer | The one-file experiment in section 5 | Object: vitest's behaviour on a mocked module missing a named export. FAILS EXPENSIVELY if silent: 73 test files then assert against an undefined guard | Run the `legibility-probe.ts` experiment before wave 1 writes anything; restore from a `cp` backup |
| R2-r7 | Nothing in this repo can exercise an authorization DECISION | repo owner | A real signed-in session; the 5 numbered checks in section 5 | Object: the member/owner boundary at runtime. FAILS IN BOTH DIRECTIONS and neither is visible to any gate here | Run checks 1-5 after each wave's push, not once at the end - a lockout found after three waves cannot be attributed |
| R2-r8 | The alias survives until wave 4, so a new call site can be added with every gate green | wave-4 implementer | `grep -rnE "await requireOwner\(\)" src/ \| wc -l` -> must be 0 | Object: the alias export at `auth.ts:451-453`. FAILS SILENTLY: a new feature writes `requireOwner()` and inherits the weaker check | Delete the export in wave 4; until then, nothing prevents regrowth, and that is stated rather than assumed away |
| R2-r9 | Wave test-file lists came from an import resolver that left 11 of 79 test files unmatched | each wave's implementer | The `grep -rl ... \| xargs grep -l <basename>` derivation in section 6, per file | Object: each wave's test file list. FAILS if a test is left behind: the wave gate goes green and `npm test` goes red later, attributed to the wrong change | Re-derive per file at the start of each wave; gate on a whole-tree `grep -rn "requireOwner" src/ --include=*.test.ts` |
| R2-r10 | The scratchpad scripts this document cites shell out to `grep` via `subprocess.run`, and a pattern containing embedded double quotes silently matches nothing and exits 0 (measured this pass - see section 2) | each wave's implementer | A canary inside each script: assert the file list is non-empty before the loop, and print a count that a known-nonzero shell `grep` agrees with | Object: any re-run of `classify.py`, `retval.py`, `cohorts.py`, `svc.py`, `tests.py`. FAILS SILENTLY AND PERMISSIVELY: an empty cohort reads as "nothing left to do" | Before trusting any re-run, check its printed total against the plain shell command for the same quantity; never modify a pattern to contain `"` without re-checking |

---

## 9. What I could not determine

Stated plainly, per `docs/loop/this-repo.md:223-242`:

- **No authorization decision was exercised.** There is no `.env`, so
  `resolveAccess` never ran against a real row in this pass. Every claim in
  section 1 is read from source; every claim in section 5's owner list is
  unverifiable here by construction.
- **No component rendered.** Whether a member sees a disabled control or an
  error toast on a denied Group A action is not knowable here.
- **I did not run `npm test`, `npx tsc --noEmit` or `npm run build`.** This is a
  scoping artifact and writes one file under `docs/`; `tsc` has exactly one
  sanctioned caller and it is the wave gate (`docs/loop/this-repo.md:135-139`).
  The two structure gates I did run are in section 10.
- **I did not classify 83 GitHub call sites individually** (R2-r1), **did not
  read 53 of the 56 service-role discard sites** (R2-r2), and **did not verify
  vitest's missing-export behaviour** (R2-r6). Each is a residual with an owner
  and a step, not a gap I am hoping nobody notices.
- **The Supabase RLS posture behind `createServiceClient()` is out of scope and
  unverified.** Several Group C files bypass RLS deliberately and scope in
  application code. That is a separate audit; R2 changes which accounts reach
  that code, not what it does.

---

## 10. Gates run for this artifact

```
tr -d -c '\000' < docs/r2-scope.md | wc -c            -> 0 (no NUL bytes)
LC_ALL=C grep -c '[^ -~\t]' docs/r2-scope.md          -> 0 (pure ASCII)
wc -l docs/r2-scope.md                                -> see below
@(Get-Content docs/r2-scope.md).Count                 -> see below
npm run test:paths -- src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts
git status --short
```

Results are recorded in this seat's report rather than here, because a file
cannot honestly state its own final line count.
