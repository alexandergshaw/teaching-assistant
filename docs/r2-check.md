# R2 scope check, round 1 of at most two (2026-09-27)

Subject: `docs/r2-scope.md` (640 lines, `wc -l docs/r2-scope.md`), committed at
`347f535`. Prior scope: `git show d0b46dd:docs/r2-scope.md` (753 lines,
`wc -l` on the extracted copy; the brief said 754).

Checker: fresh, did not author either scope. Every quantity below names the
command that produced it. Every `file:line` was opened. All evaluation ran over
reads and over scratchpad copies under
`.../scratchpad/r2check/` (`files81.txt`, `widen.py`, `transitive2.py`,
`crosswave.py`, `bound.py`, `prior-scope.md`, `backlog-347.md`). **No production
or test file was mutated.** No `git stash`, no `git add -A`, no
`git checkout --`.

---

## VERDICT: NOT BUILDABLE

5 blockers, 7 majors, 5 minors.

No wave is dispatchable. Section 1 (the three-function reading) and section 2
(the census) are sound and survive into the revision; sections 3, 5, 6, 7, 9 and
10 all require correction before any implementer is briefed.

---

## BLOCKERS

### B1 - Group A's membership filter is direct-import-only, and a verified PAT-spending path sits in Group B

**Class: NARROW-FILTER COHORT. REPEAT-OF the class the scope itself names in
section 0 row 8** (its own self-caught Canvas filter defect). Same corrective
rule - widen the specifier match, close over transitive reach, canary the widened
filter - so this is a repeat, not a new class. The document names the class,
fixes it for Canvas, and leaves it standing for GitHub, where the permissive
direction is the harm.

The filter (section 3): "grepping each of the 81 `requireOwner()` production
files for an import specifier starting `@/lib/github`". Reproduced exactly:
9 files, 83 calls (`widen.py`, per-file sums 37/27/5/4/3/3/2/1/1).

What it misses:

```
src/lib/grade/repo-content.ts:19
  import { getRepo, getRepoTree, getFileText, listCommits } from "../github";
```

A RELATIVE specifier - the exact blind spot section 0 row 8 records catching for
`./canvas-modules`. `fetchGradableRepoContent` is defined at
`src/lib/grade/repo-content.ts:55`; the four names it imports resolve to
`src/lib/github.repos.ts`, behind `ghFetch` (`:28-32`), which attaches
`Bearer ${githubToken()}` (`:32`); `githubToken()` reads
`process.env.GITHUB_TOKEN` (`:8-9`).

Guarded call sites that reach it, traced end to end:

| Call site | Guard | Reaches the PAT via |
|---|---|---|
| `src/app/actions/grading.ts:599` `gradeOneSubmissionAction` | `:607` | `canvasWorkToEntry(work)` `:621` -> `extraction.ts:210` -> `fetchGradableRepoContent` |
| `src/app/actions/grading.ts:707` `gradeAction` | `:735` | `extractCanvasEntries(canvasUrl)` `:789` and `gradeCanvasUrl(...)` `:815` -> same chain |

`src/lib/grade/extraction.ts:202` gates it on `looksLikeGithubUrl(work.submissionUrl)`
and `:210` spends the token. `grep -c "await requireOwner()" src/app/actions/grading.ts`
-> **20**. The scope assigns `grading.ts` to **Group B -> `requireUser()`**
(section 3, "the same four largest files (34/19/20/14)", `grading.ts` 20).

**Direction: PERMISSIVE.** Any approved `active` non-owner reaches the owner's
single deployment PAT through the grading path - which is exactly the exposure
section 4's "sentence that matters" asserts is confined to Group A.

Two more, by the same filter (`crosswave.py`):

- `src/app/api/visualizer/create/route.ts` (Group C, 1 site) imports
  `createVisualizerConceptAction` from `@/app/actions/visualizer` and
  `loadVisualizerIndexAction` from `@/app/actions/live-class` - both Group A.
- `src/app/actions/visualizer-selection.ts` (Group B, 2 sites) imports
  `@/app/actions/live-class`.

Neither specifier contains the string `github`, so no widening of the *name*
catches them; only closure over the action graph does.

**Fix, in the one revision:** re-derive Group A as the transitive closure to a
`githubToken()` / `process.env.GITHUB_TOKEN` reader over ALL specifier forms
(relative, `@/`, action-barrel), with `src/lib/grade/repo-content.ts` as the
mandatory canary (the narrow filter must miss it; the corrected one must find
it), then re-partition B and C from the corrected A. Waves 1 and 2 must not be
dispatched before this lands.

### B2 - the instrument named as the one that catches misclassification is a source-text regex, and the scope says it is not

**Class: ASSERTION-BY-GREP PRESENTED AS EXECUTION. NEW.**

Section 5: "The instrument that actually catches a misclassification is one whose
subject is `checkOwnerOnlyEntry` EXECUTING the guard-name check against a body,
not a grep for an identifier - and that mechanism already exists (`:388-416`)."

`src/app/actions/action-guard-coverage.test.ts:388-416`, opened: the whole
function is `REQUIRE_APP_OWNER_CALL.test(action.body)` (`:400`),
`BARE_REQUIRE_OWNER_CALL.test(action.body)` (`:403`),
`BARE_REQUIRE_USER_CALL.test(action.body)` (`:409`), where those constants are
`/\brequireAppOwner\s*\(/`, `/\brequireOwner\s*\(/`, `/\brequireUser\s*\(/`
(`:69-71`) and `action.body` is a text slice produced by `collectActionExports`
(`:118-145`). Nothing is executed. No guard runs. No Supabase fake is involved.
"EXECUTING the guard-name check" is a grep wearing a verb.

The prior scope said this correctly and the restructuring deleted it. Prior
section 4, "What it does NOT cover, measured", included: "**Any runtime
authorization behaviour.** Every assertion here is source text." That bullet is
absent from the new section 5, which lists 2 items where the prior listed 4 - and
the new text asserts its negation.

The repo's executing idiom exists and is not reused: `src/lib/supabase/auth.test.ts`
mocks the Supabase client and actually calls the guards -
`it("throws for an active instructor - active is not enough to be an owner")`
at `:432`, asserting `await expect(requireAppOwner()).rejects.toThrow("limited to the workspace owner")`
at `:444`, and `it("authorizes an active owner-role account")` at `:483`. The
scope cites that file as an instrument (section 6 row 4) and never opens it.

**Consequence:** the row can ship with every guard identifier correct and every
guard attached to the wrong resource, green.

**Fix:** restate section 5's instrument honestly as source-text, and name the
executing instrument the row actually needs - a per-action test that imports the
Group-A action, mocks `@/lib/supabase/auth` with the `auth.test.ts` client fake
configured as an `active` non-owner, and asserts refusal. Model it on
`auth.test.ts`, not on `checkOwnerOnlyEntry`.

### B3 - the rule's decided fraction is stated as 402/408, and the same subsection lists 136 sites as undecided

**Class: PASS-CONDITION / RESIDUE CONTRADICTION. NEW.**

Section 3, "The residue": "The rule decides 408 - 2 - 1 - 3 = **402 of 408
sites**". Three lines later, same subsection: "It does **not** decide, and a
human or a dedicated pass must: 1. The 83 Group-A call sites' PER-ACTION split
... 2. 53 of 56 service-role-plus-discarded-result sites in Group C".

83 + 53 + 2 + 1 = **139 of 408**, 34.1%, not decided. The security-relevant
cohort is 83/408 = **20.3%** and is **100% undecided** - the brief's hypothesis,
confirmed by the document's own numbers. Both figures are the scope's; neither is
bad arithmetic; they cannot describe the same object. The consumer reads "402 of
408" and sizes wave 1 as a sweep - which section 3's own closing paragraph says
would "leave the owner's PAT reachable by any approved account, with every gate
green".

**Fix:** replace the single figure with two named objects - "the rule decides 81
of 81 FILE memberships" and "the rule decides 0 of 83 Group-A CALL SITES; the
per-action judgement is wave 1's work and is this row's actual cost" - and carry
the second figure into section 7's wave-1 sizing.

### B4 - the disposition table fails BACKWARD: eight prior obligations have no row, including two standing rules and two handovers

**Class: SILENT DROP IN A RESTRUCTURING (`iteration-caps.md` entry gate 3). NEW.**

Section 0 closes with "Nothing from the prior scope was silently dropped." Audited
against `git show d0b46dd:docs/r2-scope.md`, these prior obligations have no row:

| # | Prior obligation | Prior source | Why it matters |
|---|---|---|---|
| 1 | The alias's own stale quantities withdrawn, **plus the standing rule "Do not re-quote either number from that file"** | prior `:76-79`; prior section 7 row at `:685` | Both numbers are still in the tree: `sed -n '288p;438p' src/lib/supabase/auth.ts` -> "the ~496-invocation deprecated alias" and "the ~105 existing source files". The rule that stops the next reader quoting them is gone |
| 2 | "`canvas-core.ts` and `github.repos.ts` have zero guard calls - KEPT but REFRAMED" | prior `:686`; measurement at prior `:27-33` with its media-avatar canary | The new section 3 asserts "no second containment exists" on this and never re-runs the canaried guard-grep |
| 3 | "RESOLVED 3 - the split stands, chosen from the shared-secret audit - KEPT" | prior `:687`, citing `docs/multi-user-login-architecture.md:396-407` | This is the architecture decision R2 implements |
| 4 | "'The sweep becomes a straight one-to-one mechanical rename with no per-site judgment at all' - **WITHDRAWN**" | prior `:689`, citing `architecture.md:384-386` | The single most load-bearing withdrawal in the prior document. With no row, a future reader of `architecture.md:384-386` gets the sweep authorisation back and nothing records that it was withdrawn |
| 5 | "the media-file cohort as first wave - **HANDED OVER, already discharged by R3**" | prior `:690` | A handover with a receiver, unrecorded |
| 6 | "Per-user spend quotas before sign-up opens - **HANDED OVER, unchanged: not R2's, still owed, and R2 must not be read as closing it**" | prior `:691`, citing `architecture.md:426-431` | The most consequential omission. The new Group-C rule ("shared LLM key, no owner-private identity behind it -> `requireUser()`") is precisely what makes this obligation load-bearing, and R2 now ships that rule with the obligation unrecorded |
| 7 | "446 invocations - **WITHDRAWN**" | prior `:683` | The backlog row still carries 446 (`sed -n '136p' docs/BACKLOG.md`) |
| 8 | Three instrument facts: "**Anything outside `src/app`** - `APP_DIR` is `src/app` (`:60`)"; "**Any runtime authorization behaviour** - every assertion here is source text"; and the instrument-table row "Self-tests of the checker - `:499-578`" | prior section 4 | The third is the only thing proving `checkOwnerOnlyEntry`'s own canaries exist (they do: `:499`, `:513`, `:537`, `:560`). The second is inverted by B2 |

FORWARD audit is clean: all 22 rows in section 0 trace to a real prior
requirement, finding or number.

**Fix:** add the eight rows with explicit dispositions, and restore the two
standing rules (1 and 6) verbatim.

### B5 - three rows assert KEPT VERBATIM for text the new document does not carry

**Class: REPEAT-OF SILENT DROP IN A RESTRUCTURING** (same corrective act as B4:
audit each disposition against the prior text). Listed separately so the revision
can act item by item; not relabelled to buy a round.

1. **"Wave plan (0 through 4) and its write sets - KEPT verbatim"**, section 0.
   The new wave 0 (section 7) drops the prior's "Lands red-then-green so the
   instrument is proven before it is trusted" (prior `:584`). That sentence is
   the only thing in wave 0 that proves the new closure block can fail. Without
   it, wave 0 ships an empty list with a `toBe(0)` pin - an assertion that cannot
   fail, which is the first defect class `iteration-caps.md` names.
2. **"Residual register R2-r1 through R2-r10 - KEPT verbatim, none discharged"**,
   section 0. R2-r3 and R2-r4 had real instruments in the prior
   (`:705`: "`src/app/actions/cron-heartbeat.ts:29-36`, read"; `:706`:
   "`src/app/actions/github-student-repos.ts:14-22`, read"). Section 10 replaces
   both with "Fork 1, section 9" / "Fork 2, section 9". A fork is a question, and
   by the card's own anti-gaming rule a residual without an instrument is a
   deletion - so the restructuring deleted two residuals while asserting verbatim
   retention.
3. **"Test-side census: ... 13 already-migrated ... all reproduced exactly"**,
   section 0. The prior deliberately kept two different objects apart at
   `:217-222`: **12** (25-line-window measure, "already migrated") and **13**
   (whole-file measure). Reproduced today:
   `grep -rl 'vi.mock("@/lib/supabase/auth"' src/ --include=*.test.ts | xargs grep -lE "requireUser|requireAppOwner" | wc -l`
   -> 13. Twelve are already migrated; the thirteenth is
   `src/app/actions/course-hub-integrations.test.ts`, whose only `requireUser`
   mention is comment prose at `:6` while its factory at `:23-24` names
   `requireOwner` alone - which section 2 of the new document says itself, two
   paragraphs after its table row says the opposite.

---

## MAJORS

### M1 - the backlog-row provenance citation does not resolve, and it is plausibly why three row obligations went undisposed

**Class: CITATION THAT DOES NOT RESOLVE. NEW.**

Section 0 preamble: "read with `grep -a -n \"^| R2 \" docs/BACKLOG.md` -> line
135; full text confirmed via `sed -n '135p' docs/BACKLOG.md`".

Measured, today AND against the scope's own commit:

```
grep -a -n "^| R2 " docs/BACKLOG.md                    -> no output, exit 1
grep -a -n "| R2 |" docs/BACKLOG.md                    -> 136
grep -a -n "| R2 |" <git show 347f535:docs/BACKLOG.md> -> 136
sed -n '135p' docs/BACKLOG.md                          -> the N13a grading row
```

The row begins `| requireOwner() call-site authorization | R2 |`, so `^| R2 `
cannot match it. The claim to have confirmed the row's full text is unsupported
by the commands the document offers, and `sed -n '135p'` reads a different row.

Why it is not cosmetic: the R2 row's own note names exactly three things to
re-confirm before scoping - "the RESOLVED 3 / SUPERSEDES architecture decision,
canvas-core.ts and github.repos.ts having zero guard calls today, the media-file
cohort as first wave" - and all three are missing rows 2, 3 and 5 of B4.

### M2 - "62 commits since d0b46dd" and "no production or test file in R2's scope was touched" are both false

**Class: UNMEASURED QUANTITY / ENUMERATION USED AS THE SET. NEW.**

```
git log --oneline d0b46dd..HEAD    | wc -l  -> 68   (today)
git log --oneline d0b46dd..347f535 | wc -l  -> 67   (at the scope's own commit)
git log --oneline d0b46dd..347f535~1 | wc -l -> 66  (immediately before it)
```

62 is not reachable by any reading. Stated twice (section 0 headline, section 11).

The drift grep names roughly 15 paths and carries the literal placeholder
`<the 9 Group A files>`, so the command as printed is not runnable. Run over all
81 production files:

```
git log --oneline d0b46dd..HEAD -- $(cat files81.txt | tr '\n' ' ')
  -> 2b5b4c7 feat(a39): provenance on all three producers, ...
```

`git show --stat 2b5b4c7` includes `src/app/actions/grading.ts` - the file at the
centre of B1. The headline counts still reproduce (408 / 81), so nothing R2 sizes
on moved; the claim "No production or test file in R2's scope was touched by any
of the 62 commits" is nonetheless false, and the evidence offered was a
hand-picked subset. `traps-spec.md`: the enumeration is a floor, never the set.

### M3 - the wave-1 coupled-test derivation over-includes across wave boundaries

**Class: WRITE-SET DERIVED BY BASENAME ACROSS A PARTITION BOUNDARY. NEW.**

Wave 1's coupled-test list (section 7) contains `visualizer-selection.test.ts`
and `src/app/api/visualizer/create/route.test.ts`. Both mock the auth module
themselves, and both belong to LATER waves:

- `src/app/actions/visualizer-selection.test.ts:19` -
  `vi.mock("@/lib/supabase/auth", () => ({ requireOwner: vi.fn() }));`. Its
  module under test is `visualizer-selection.ts`, which the scope puts in Group B
  / wave 2. It mocks `@/app/actions/live-class` (`:34`) and
  `@/app/actions/visualizer` (`:40`) wholesale, so wave 1's change to those
  production files does not require touching its auth factory at all.
- `src/app/api/visualizer/create/route.test.ts:15` - identical shape. Its module
  under test is `route.ts`, Group C / wave 3. It mocks live-class (`:16`) and
  visualizer (`:17`) wholesale.

The scope's derivation (R2-r9,
`grep -rl "requireOwner" src/ --include=*.test.ts | xargs grep -l "<basename>"`)
matches on basename TEXT, so any test that merely mocks a Group-A module is pulled
into wave 1. An implementer following the brief edits those factories in wave 1
and breaks the wave-2 and wave-3 production files - whose loudness is R2-r6,
explicitly unmeasured. Section 7's disjointness sentence ("they partition the 81
files") is true of production files only; the test write sets do not partition,
and the scope names only the waves 1/3 collision on `action-guard-coverage.test.ts`.

**Fix:** state the rule - a wave edits a test's `@/lib/supabase/auth` factory only
when that wave changes the production module the test imports UNDER TEST; a test
that mocks a sibling action module wholesale is not in that cohort - and reassign
those two files to waves 2 and 3.

### M4 - the one question the scope escalates as unverifiable is answered by an already-landed test in the file it names as its instrument

**Class: OBLIGATION ESCALATED WITHOUT OPENING THE CITED INSTRUMENT. NEW.**

Section 1: "**What this does NOT settle:** whether a real Supabase session can
reach `requireAppOwner()` with `email_confirmed_at` set but an `app_users` row
`suspended`. Routed to owner-verification in section 5, unverifiable in this
checkout (no `.env`, no live session)."

`src/lib/supabase/auth.test.ts:494` -
`it("authorizes the OWNER_EMAILS break-glass path even with a stale suspended row")`,
which calls `requireAppOwner()` at `:503` and asserts it resolves; the paired
negative is at `:508` ("does NOT authorize ... for an unverified email, even with
a stale suspended row"). The answer is **yes, by design** - see
`src/lib/access.ts:118-127`, whose own comment is about not locking the owner out
- and it is measurable here, today, by an executing test that needs no `.env`.

The scope cites `src/lib/supabase/auth.test.ts` as the instrument for section 6's
row 4 and never opens it. This is a residual invented on top of a test that
already discharges it.

### M5 - section 4's impersonation claim is contradicted by an executing test and by the preamble of the module Group B's containment rests on

**Class: READING CLAIM CREDITED AS A BEHAVIOURAL FACT. NEW.**

Section 4: "`runAsOwner` impersonation satisfies both `requireUser` and
`requireAppOwner` (`status==="active" && role==="owner"`, `:329-335`, `:409-415`)".
Section 6 owner-check 5: "Unattended runs still work (`runAsOwner` satisfies both
guards)."

- `src/lib/supabase/owner-context.ts:189-190`:
  `const role: AppUserRole = decision === "owner" ? "owner" : (profile?.role ?? "instructor");`
  - `resolveImpersonationIdentity` returns `role: "instructor"` for an `active`
  non-owner.
- `src/lib/supabase/auth.test.ts:406` -
  `it("BUG 2 CANARY: a non-owner identity in the impersonation store is refused by requireUser() too - ... reaches every requireOwner() call site, since requireOwner() delegates to requireUser()")`.
  An executing test says the opposite of the scope's sentence.
- `src/lib/supabase/effective-identity.ts:55-62` states it in prose: "a member's
  own unattended run (a scheduled workflow, an event trigger, a webhook) gets
  impersonated with role !== \"owner\". The MOMENT that run's call tree reaches
  any of the ~1000 existing call sites still calling requireUser() or the
  requireOwner() alias directly ... that call throws".

The CONCLUSION ("unaffected by reclassification") survives - both guards apply the
same impersonation precondition - but the premise does not. The cost is on
owner-check 5: as written, a verifier ticks an OWNER-owned schedule, sees it pass,
and never observes the member-schedule case, which was already broken and stays
broken. That is a silent green on the row's only runtime check for unattended
runs. Note also that the scope builds Group B's whole containment argument on
`getEffectiveIdentity` / `resolveCanvasCredential` without ever opening
`effective-identity.ts`, whose preamble is the module's own security contract.

### M6 - Fork 2 is not terminating, and it contradicts its own residual

**Class: FORK WHOSE BRANCHES ARE NOT SYMMETRIC IN WHAT THEY RE-OPEN. NEW.**

Fork 2 offers `requireAppOwner()` now, or `requireUser()` now. The
`requireUser()` branch is not a product choice inside the scope's rule - it is an
override of the rule's only security derivation for a Group-A file ("Where none
exists (GitHub), the site is `requireAppOwner()`", section 3). The scope states no
exposure, no mitigation and no residual for that branch, so answering it forces
re-deciding whether "no second containment -> `requireAppOwner()`" binds at all -
something the branch does not touch. That is the defect shape the brief asked me
to test for.

It also contradicts R2-r10's neighbour: R2-r4's Step says "default
`requireAppOwner()` applied in wave 1 **regardless**, per the recommendation",
while section 9 says "Either answer ships in wave 1 with no further round." If
the default lands in wave 1 and the owner later answers `requireUser()`, that
answer does not ship in wave 1; it is a second edit to a shipped file.

Fork 1 (`cron-heartbeat.ts`) IS terminating as written, and its wave-3 exclusion
and the `OWNER_ONLY` consequence are handled consistently. One line, no change
needed.

### M7 - R2-r2's object is not a well-defined set, so it cannot be discharged

**Class: RESIDUAL WITH AN UNRESOLVABLE OBJECT. NEW** (carried forward unchanged
from prior `:704` / `:403-415`, which has the same defect).

R2-r2 says "53 of 56 ... sites in 10 files not yet read (only `accommodations.ts`,
`research.ts`, `grading.ts` sampled ...)" and then lists the remainder as **eight**
files - including `research.ts` (13) and `grading.ts` (11 more), two of the three
it just called sampled. 10 minus 3 is 7. The sums close
(17+11+13+3+3+3+2+1 = 53) but the partition does not, and the entry never names
the 56 sites by `file:line`, so an implementer cannot tell which sites are owed or
when the residual is discharged.

---

## MINORS

**m1 - the Canvas "ONLY module" containment claim is evidenced by a one-file
grep; tree-wide there is a documented second reader.** Section 3 offers
`grep -n "process.env" src/lib/canvas-core.ts`. Widened:
`grep -rn "CANVAS_URL\|CANVAS_API_TOKEN" src/ --include=*.ts --include=*.tsx | grep -v "\.test\."`
finds `src/app/actions/course-hub-integrations.ts:177`, `:219`, `:228` reading
`process.env[...CANVAS_API_TOKEN]`. All three sit inside `identity.role === "owner"`
branches (`:170`/`:177`, `:214`/`:219`), and the file's own comment at `:202-203`
calls itself "the one place outside canvas-credentials.ts still allowed to read a
`<CODE>_CANVAS_*` env var by name" - so the containment argument survives, but the
absence claim as evidenced does not, and the PRIOR document cited that exception
(prior `:357-358`) while this one does not. Note the canary lesson:
`grep -rn "process\.env\.CANVAS[A-Z_]*" src/` returns NOTHING, because every read
is computed - a pattern that needed its own canary and did not get one.

**m2 - section 2's `.role` sentence counts a subset as if it were the command's
output.** "`grep -rn "\.role" src/app/actions src/app/api` (non-test) still
returns exactly 2 hits that read `.role` off a guard result" - the command returns
7 lines (reproduced); 2 read off a guard result. The prior said it plainly. The
SUBSTANCE is independently confirmed sound (`bound.py` over the 81 files):
destructured bindings 0, bound 153 (151 `user` + 2 `identity`), and the only
non-`.id` property read off a bound guard result is `.role` in
`course-hub-integrations.ts`. The "no call site's body changes" claim holds.

**m3 - the regrowth argument concludes with the wrong enforcement, and section
6's row 3 inverts the safe default for Group A.** Section 5: "the enforcement
that actually prevents regrowth is deleting the alias, not detecting new uses of
it." Deleting the alias prevents a new `requireOwner()`; it does nothing about a
new `requireUser()` in a Group-A file, which is the same exposure with a different
spelling. Worse, section 6 row 3 specifies the `:637-645` loop for Group A -
"Every non-owner-only action in a named file set calls `requireUser(` directly" -
which, applied to Group A, AFFIRMATIVELY REQUIRES any Group-A action absent from
`GITHUB_OWNER_ONLY_ACTIONS` to be on `requireUser()`. For the one group where
permissive is the harm, the instrument's default is backwards. The Group-A block
must be the CONVERSE of the media block: default `requireAppOwner()`, with an
explicit `GITHUB_NOT_OWNER_ONLY` list carrying a stated reason per entry.

**m4 - section 5 names a counter it did not run.** "647 lines (`wc -l`, and
`@(Get-Content ...).Count` agrees per the prior pass; not re-run today". I re-ran
`wc -l src/app/actions/action-guard-coverage.test.ts` -> 647. Neither this pass
nor I ran the PowerShell counter, and this repo's own card records a 42-line
disagreement between the two on another file. Low stakes, but the quantity cites a
command nobody executed this pass.

**m5 - Group C's membership is correct, and I walked it.** The scope declines to.
`widen.py` partitions all 81 files under the scope's own filters: A 9/83, B 27/160,
C 45/165, total 408 - and Group C's 45 files are exactly the complement, listed
per file with counts. The arithmetic shortcut hid no misfiled file RELATIVE TO THE
STATED RULE. That does not rescue B1, which is a defect in the rule's instrument,
not in the subtraction.

---

## What reproduced cleanly (stated once, not padded)

Every headline quantity in the document reproduces on my own instruments:
411 / 408 / 3 / 81 / 530; `requireAppOwner` 20 calls / 4 files / 23 including
tests with per-file 5+1+3+11; `requireUser` 53 / 14 with the two new files named
correctly; test-side 79 / 85 / 73 / 13 / 0; the non-`await` residue at 10 lines;
the instrument at 647 / `PINNED_UNGUARDED` 28 / `OWNER_ONLY` 19 /
`MEDIA_OWNER_ONLY_ACTIONS` 14 with the `:599` pin present; `githubToken()` at 6
call expressions in 5 files at the six exact cited lines; all 6 Route Handlers
directive-free with 1 call each (`src/app/api/lms-generation/deck/route.ts`'s only
"use server" occurrence is comment prose at `:57`, so `isUseServerModule` still
skips it); `canvas-credentials.ts` `:189` / `:192-195` / `:220` / `:227`;
`microsoft-credentials.ts:31-34`; `google-credentials.ts:29-32`;
`cron-heartbeat.ts:29-36` / `:31` / `:34-36`;
`taskCellAttachments.wiring.test.ts:414-417`; `course-task-attachments.ts` 3
calls; `legibility-probe.ts` 1 call with its coupled test rejecting the mock;
`auth.ts:328-366` / `:408-434` / `:451-453` and every sub-line cited in section 1;
`access.ts:168-170` / `:194-196` / `:199-201`; `auth.ts:182`. The section 0 claim
that 28 of about 30 quantities reproduced is accurate as far as the counts go -
the defects above are in the RULE, the INSTRUMENT and the TABLE, not in the
arithmetic.

**Gate hygiene is correct.** No gate or instrument in the document runs a raw
multi-path `vitest`. Wave 0, wave 1 and section 12 all use
`npm run test:paths -- <paths>` (confirmed present at `package.json:21`), and the
type gate is `npx tsc --noEmit --incremental false` with no file arguments.

**The "feature already exists" argument is WEAK, and I am saying so plainly.**
`grep -rn "requireAppOwner\|isOwnerEmail\|role === \"owner\"" ` over the 9
Group-A files returns nothing: there is no containment inside any of them. R3
closed only the media cohort. The exposure section 4 describes is real, live and
unclosed. The row is worth building.

**Section 8's refusal to manufacture a leverage claim is correct** per
`DEV_LOOP.md` - a security-authorization chore builds no capability a user
reaches, and the honest "none directly" is the right answer, not a gap.

**Section 1's `requireAppOwner` predicate was established rather than inferred,
and correctly.** `resolveAccess`'s break-glass requires `input.emailVerified`
(`access.ts:168-170`), supplied as `Boolean(user?.email_confirmed_at)`
(`auth.ts:182`); the consequence stated - no call site needs its own
`isOwnerEmail` check and none should grow one - holds.

---

## Disposition-table audit, both directions

**FORWARD: clean.** All 22 rows in section 0 trace to a real requirement, finding
or number in `git show d0b46dd:docs/r2-scope.md`. No invented ancestry.

**BACKWARD: FAILS.** Eight prior obligations have no row - B4's table. Two of them
are standing rules ("do not re-quote the alias's own counts"; "per-user spend
quotas are still owed and R2 must not be read as closing them"), two are handovers
with named receivers, one is the withdrawal of the architecture document's own
sweep authorisation, and three are instrument facts - one of which the new text
inverts (B2).

**DISPOSITIONS ASSERTED AND NOT CARRIED: three.** B5 - the wave plan's
red-then-green requirement, two residuals' instruments downgraded to questions,
and one quantity relabelled onto a different object.

Both failure modes the brief named as live are present in this document, and the
backward failure is the larger one.

---

## The weakest requirement

Section 5 item 3 plus section 6 row 3, taken literally: "add the Group-A closure
block ... with the list EMPTY and the length pin at 0", enforced by the
`:637-645` loop, which requires every non-enumerated action in the named file set
to call `requireUser(` directly.

Implemented exactly as written, wave 0 lands an instrument that asserts (a)
`GITHUB_OWNER_ONLY_ACTIONS.length === 0` and (b) every action in the 9 Group-A
files is on `requireUser()`. That is an instrument that PINS THE EXPOSURE, green,
and wave 1 then has to fight its own tripwire. Nothing in the document warns the
implementer that the Group-A block must be the polarity-inverse of the media
block it is "modelled on".

## The silent green, named concretely

R2 can be built, pass `npm run lint`, `npx tsc --noEmit --incremental false`,
`next build`, every vitest path and every structure test, and still leave the
owner's GitHub PAT reachable by any approved `active` account, because:

1. `grading.ts`'s 20 sites land on `requireUser()` and reach
   `fetchGradableRepoContent` -> `ghFetch` -> `Bearer ${githubToken()}` (B1,
   traced above, `grading.ts:607`/`:621` and `:735`/`:789`);
2. the only instrument that could catch a wrong guard is an ENUMERATION
   (`OWNER_ONLY`, `GITHUB_OWNER_ONLY_ACTIONS`) populated from the very per-action
   judgement R2-r1 defers - an enumeration is a floor, not the set;
3. every assertion in `action-guard-coverage.test.ts` is a regex over source text
   (B2), so a correctly-NAMED guard on the wrong RESOURCE is invisible by
   construction;
4. the converse check specified for Group A actively requires the permissive
   guard for anything unlisted (m3);
5. no component is rendered and no authorization decision is exercised by any
   test in this repo, so every claim in section 6's owner-verification list -
   including the one refuted by `auth.test.ts:406` (M5) - is a reading claim until
   a human signs in.

---

## What is dispatchable as it stands

- **Nothing in section 7.** Wave 0's spec is polarity-inverted (m3) and lost its
  falsifiability proof (B5.1). Waves 1, 2 and 3 all depend on a cohort partition
  that B1 shows is wrong in the permissive direction.
- **Reusable without change:** section 1's three-function reading (minus the M4
  over-escalation), section 2's census and canaries, section 8's leverage
  refusal, and Fork 1.
- **Independently useful now, and separable from the revision:** R2-r6's
  loud-versus-silent `vi.mock` experiment on
  `src/app/actions/legibility-probe.ts` / `.test.ts` (1 production call, 1 coupled
  test, both re-verified). It needs no cohort decision, its result is required by
  every later wave, and it can be run with a `cp` backup while the revision
  proceeds. If it comes back SILENT, M3 and B5.1 both get worse and the revision
  should know before it writes wave 0.

## Stopping point

**Design**, with **measurement** as the named receiver.

B1 (the cohort's derivation), B2/m3 (the instrument's kind and polarity) and B3
(what the rule actually decides) are design questions inside the seat's own remit
and are fixable in one revision. B4 and B5 are mechanical table repair. M1, M2
and M7 are citation and definition repair. M4 and M5 are corrections that an
already-landed test supplies - they RELOCATE to `src/lib/supabase/auth.test.ts`
rather than to the owner. None of the blockers lands on an orchestrator ruling;
I checked the dispatch constraints in the brief against the artifact and found no
ruling in conflict with itself or with the caps card.

**One question must go to the owner rather than be fixed in the revision**, and
it is M6 re-worded so every answer terminates the activity:

> `src/app/actions/github-student-repos.ts` (3 call sites, collaborator and
> invitation management on student repos) reaches the owner's single deployment
> GitHub PAT with no second containment, like the rest of Group A. R2 will ship
> it **owner-only** either way - the security derivation is the same for all 9
> Group-A files and the revision will not weaken it. The only open question is
> the bookkeeping: (a) ship it owner-only and file a backlog row to revisit it
> when multi-instructor access is actually built, or (b) ship it owner-only and
> record the revisit as a residual inside R2's own register with the wave-1
> implementer as owner. Which do you want?
>
> Either answer ends the activity: wave 1 is unchanged, no file's guard changes
> on the strength of the answer, and nothing else is re-decided. What is NOT on
> offer is `requireUser()` now - that would put the owner's PAT behind "any
> approved account" for a capability nobody can use yet, which is the exposure
> this row exists to close, and the revision should not be asked to price it.

## Concurrency and tree state

At the START of this check, `git status --short` showed five sibling-owned
modifications: `docs/BACKLOG.md`, `docs/backlog.yml`, `docs/css-orphans.md`,
`src/lib/llm.ts`, `src/lib/llm.test.ts`. By the END, a sibling (or the
auto-commit hook) had committed four of them, leaving:

```
 M docs/css-orphans.md      <- sibling-owned, pre-existing at session start
?? docs/r2-check.md         <- MINE, the only file this check wrote
```

Both states are recorded deliberately: the disappearance of four entries between
the two reads is sibling activity, not this check's, and `docs/r2-check.md` is
the only path this check created or changed.

Live siblings were reported on `docs/g4-scope.md` and
`src/app/components/ui/modalAdoptionScan.ts` plus its dependents; I touched
neither, and neither appears in the tree above. `docs/BACKLOG.md` was read only
(`grep -a`, `sed -n`, and `git show 347f535:docs/BACKLOG.md` into a scratchpad
copy); `docs/backlog.yml` was neither read nor written.
