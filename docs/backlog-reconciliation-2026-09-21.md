# Backlog reconciliation, 2026-09-21

Audit of `docs/backlog.yml` against the git history and the working tree.
Read-only: nothing but this file was written. Audited at HEAD `01098b0`
(2026-09-21 11:25:35 -0500). HEAD moved once during the audit (`832e9d3` ->
`01098b0`, which changed only A29's note); the row set was re-dumped and
diffed after that move and only A29's `note` differed (2 changed lines,
`diff rows.txt rows2.txt | grep -c "^[<>]"`), so every row below reflects
`01098b0`.

Author: a loop seat. Every finding below is meant to be checked by a fresh
peer before anyone applies it. Where I read a commit message rather than
its diff, I say so.

---

## 1. The table

46 rows (`python -c "import yaml,io; print(len(yaml.safe_load(io.open('docs/backlog.yml',encoding='utf-8'))))"`).
Every `state` is one of the four legal values: 33 unscoped, 8 verification,
3 actionable, 2 owner (`collections.Counter` over the parsed rows). Every
row has `verify: null` and `owns: []` (0 of 46 non-null for each, same
parse), which matters for section 5.

Classification key: STALE = SHIPPED-AND-STALE, RESID = SHIPPED-WITH-RESIDUALS,
CLOSE = SHIPPED-CLOSEABLE, OPEN = IN-FLIGHT or UNBUILT and accurately
described, DESC = DESCRIPTION-WRONG.

| Row | State | Classification | Evidence commit(s) | Recommended action |
|---|---|---|---|---|
| V1 | verification | OPEN | - | None. Cites re-confirmed (AnnouncementDraftSlot.tsx:19,83,203; RecordingControls.module.css:389) |
| V2 | verification | OPEN | - | None. `grep -c "  it(" clipboard.test.ts` = 9, matches the row |
| V3 | verification | OPEN | - | None |
| V4 | verification | OPEN | - | None |
| V5 | verification | OPEN | - | None |
| V6 | verification | OPEN | - | None. route.ts:92 is still the tick-started log line |
| N3 | unscoped | OPEN | - | None (blocked on V3; workflow still only logs failedCount, sweep-orphan-uploads.yml:62-67) |
| R2 | unscoped | OPEN | - | None. 411 re-measured (section 3) |
| G2 | verification | OPEN | - | None. Seed still at useAssessmentRowStore.ts:96-98, `grep -c useEffect` = 0 |
| G3 | unscoped | OPEN | - | None. orphan-upload-sweep.ts:46,55 still carry the 250ms assumption |
| G4 | unscoped | DESC | - | Re-measure: 124 callLlm sites is now 127 |
| L3 | owner | OPEN | - | None. REGRESSION.md:37641 heading and globals.css:25/:294 confirmed |
| N13a | unscoped | DESC | 7c409a6 (cap half, cited); 2c92fec (comment, NOT cited) | Floor enforcement moved :154 -> :168; cite 2c92fec for the comment half; floor itself still unbuilt |
| N13b | unscoped | OPEN | - | None beyond noting its instrument's gemini.ts:25 / engine.ts:126 cites are pre-7c409a6 |
| N15a | unscoped | OPEN | - | None (only its A14 dependency moved; see A14) |
| N15-rubric-picture | unscoped | OPEN | - | None. RubricInputModal.tsx:127 still `.docx,.pdf,.txt,.md` |
| L6 | unscoped | OPEN | - | None |
| A3 | unscoped | OPEN | - | None. course-intel.ts:113 and :132 confirmed |
| A4 | owner | OPEN | - | None. AskAiModal.tsx:99 confirmed |
| L9 | unscoped | DESC | - | Re-measure: 176/57 is now 203/69 |
| A7 | unscoped | DESC | - | Re-measure: repo-grades/index.tsx is 930, not 913 (70 lines of headroom, not 87) |
| A8 | unscoped | RESID | 58a4254, d5a3e2c, db747cc (A8-R waves 0-2), 75bd7d4 | Record that A8-R shipped; raise the Ruling O contradiction (section 2.1) BEFORE anything else; A8-P and routes c/d remain |
| A12 | unscoped | RESID | b7e62fe, 917d29f | Record the ship; file the two rows its scope promised and never filed (section 2.3) |
| A13 | unscoped | RESID | b7e62fe, 917d29f | Merge with A12 into one verification/residual row |
| L11 | unscoped | OPEN | - | None |
| L12 | unscoped | OPEN | - | None |
| A14 | unscoped | RESID | cb478e9 | Title still says LIVE ON MAIN; record cb478e9; give its three open items owners |
| L13 | unscoped | OPEN | - | None. The one blind copy is still at snapshot-role-setrole-callsites.structure.test.ts:29-30 |
| L14 | unscoped | RESID | c80fa68 | Record the ship; R4, R8, R9 are not discharged (section 2.4) |
| L15 | unscoped | DESC | - | Walker count is 39, not 32 (L14's R9 said 38 and was never applied here) |
| L16 | unscoped | OPEN | - | Keep, but record that the guard cannot currently block at all (section 5.1) |
| A16 | actionable | RESID | 6ecc226, e9670d1, 2e34886, 61b229f, cbe84e2, 434ad5e, e57b1c5, f8d65eb | Move to verification; "a fix pass is running" is stale (f8d65eb landed 09:37) |
| A17 | unscoped | DESC | (3d2f07f moved the cited lines) | Re-cite: regenerateArmed :85 -> :105, events :345/:349 -> :367/:371 |
| A18 | actionable | RESID | f9f29c1, d62aea3 | Move to verification; REGRESSION entry still owed |
| A19 | unscoped | RESID | 3d2f07f, 26bf0d0, 33f7557 | Record the ship; its scope's residuals live only in docs/a19-scope.md |
| A20 | verification | OPEN | 13cef3b, 36aaad3 (both cited) | None, except its R1-R5 are recorded only as a pointer to docs/a20-scope.md |
| A21 | actionable | RESID | bc950c4, 91ede74 | Move to verification; record 91ede74; RES-10 has no owner |
| A22 | unscoped | RESID | 7375a21 | Record the ship; relocate RES-A22-3/-4 then delete |
| A23 | unscoped | RESID | 4dad288, 38f0e95 | Change to owner (the 12-module decision); give sites 4-5 an owner or call them deleted |
| A24 | unscoped | OPEN | - | None ("wave 2 is building" is past tense now; harmless) |
| A25 | unscoped | OPEN | - | None |
| A26 | unscoped | RESID | 3366654 | Convert to verification carrying RR-1/RR-2 (owner, real browser) |
| A27 | unscoped | CLOSE | 3366654 | Delete once A26's verification row carries RR-2 |
| A28 | unscoped | RESID | f6f0515 | Convert to verification (RR-3); RR-2 REGRESSION baseline not found by id |
| A29 | unscoped | OPEN | - | None; accurate at 01098b0 (owner chose Canvas Inbox) |
| A30 | unscoped | CLOSE | 832e9d3 | Delete; fold its rendered-cell claim into A28's owner check; its `blocked_by: ['A28']` goes with it |

Tally: 13 RESID, 2 CLOSE, 6 DESC, 25 OPEN, 0 STALE (counted from the
table above). Zero rows landed in
STALE because every shipped row here also has something genuinely left;
that is a judgement, and a checker should push on A22 and A27 in
particular.

**Shipped rows whose own text does not mention the landing commit: 15.**
A8, A12, A13, A14, A16 (f8d65eb only), A18 (d62aea3 only), A19, A21
(91ede74 only), A22, A23, A26, A27, A28, A30, L14. Measured by the
per-row check in section 6.3 plus a manual read for A14 (whose commit
names the row only in its body).

---

## 2. Findings that need action beyond a row edit

### 2.1 A8-R shipped the label the owner ruled against

- The owner's answer to Ruling O was recorded at `d4c32cc`
  (2026-09-20 12:29:57): an unconfirmed row gets "a NEUTRAL LABEL AND A
  HEDGED PROMPT, not today's Submission bytes" (quoted from
  `git show d4c32cc -- docs/backlog.yml`; the same text is in A8's note
  today).
- A8-R wave 0 landed at `58a4254` (15:04), wave 1 at `d5a3e2c` (15:31),
  and wave 2 inside `db747cc` (15:51), whose message describes only an
  A18 doc relocation. `git show --stat db747cc` lists 16 source files under
  grading-recording/ and src/lib/grade/, so the A16 note's claim that wave
  2 is hidden in that commit holds up.
- What shipped: `src/lib/grade/submission-kind.ts:61` and `:71` both map
  `unknown: "Submission"`. `:21-25` and `:43-44` say "unknown maps to
  today's pre-A8-R strings", and GradingTableRow.tsx:268 renders
  `submissionKindLabel(row.submissionKind)`.
- `docs/a8r-scope.md` was last changed at `b054d9a` (14:52), after the
  owner answer. `grep -ci neutral docs/a8r-scope.md` returns 0. The
  canary `grep -c unknown` on the same file returns 17. So the build
  followed a scope that never took in Ruling O.

I read the label Records and the call site. I did not read all of wave 2.
My reading is that every row still says "Submission" until an instructor
clicks, which the A8 row itself calls "the defect". Please confirm by
opening `db747cc` before acting on this. It is recorded here and not in
A8's row because I was not allowed to edit the backlog.

### 2.2 Thirteen shipped rows have no REGRESSION entry by id or commit

Instrument: `grep -anE "(^|[^A-Za-z0-9])<ID>([^0-9]|$)" docs/REGRESSION.md`.
The canary is A16, which hits at :44261. I also ran `grep -ac <hash>`
for each landing commit. Zero hits for A12/A13, A14, A18, A19, A20, A21,
A22, A23, A26, A27, A28, A30 and L14. The last entry is 434 (:44422,
"Repo Grades bulk-run handler and hooks, before A16 wave 3"). Limit: an
entry could describe one of these behaviours without naming its id or
hash, and this instrument would miss it. For A18, `docs/a18-ac.md` R-1
already names this debt. So does A21's note ("a REGRESSION entry for
bc950c4, which does not exist").

### 2.3 Rows a shipped chunk promised to file and never did

If the parent row is deleted as shipped, each of these is lost:

| Promised by | Residual | What the scope doc says owns it | Found in backlog.yml? |
|---|---|---|---|
| A12/A13 (docs/a12-a13-scope.md section 9) | RES-1: engine.ts:307 and :320 still emit "Re-run to grade it/the rest", which is false on GithubGradingPanel (strings confirmed in the tree today) | "The backlog row filed at this chunk's push" | No. Only A13's pre-ship note mentions it |
| A12/A13 | RES-2/RES-3: single-row re-dispatch and the parseRepoRef/fullName identity question | "A follow-on scoping seat, after this chunk's push" | No (`grep -c parseRepoRef docs/backlog.yml` = 0) |
| A12/A13 | RES-6: whether the review CSV carries an ungraded column (owner) | "Escalated at this chunk's push" | No (`buildCsvContent` = 0) |
| A12/A13 | RES-7: grade-result-doors.wiring.test.ts is satisfied by a comment | "Filed as a backlog row at this chunk's push" | No (`referencesUngradedFlag` = 0) |
| A21 note | RES-10: postWalkthroughAnnouncementAction drops delayedPostAt | "worth its own row if anyone wants it" (no owner) | No. As written this is a deletion |
| L14 note | R4: runVerify has zero production callers | "needs its own row" | No. Only L14 and L15 mention runVerify |
| L14 note | R8: REGRESSION entry for gate tooling, step "before the L14 implementer hand-off" | Baseline seat | Not done: `grep -ac "test:paths" docs/REGRESSION.md` = 0, after c80fa68 shipped |
| L14 note | R9: L15's walker count, owner "orchestrator, into the L15 row" | Orchestrator | Not applied (L15 still says 32) |
| A22 scope section 11 | RES-A22-4: 17 type-only barrel importers elsewhere | "a note on whichever row adds the next sweep" | No |
| A23 note | Sites 4 and 5 (course-schedule-docx.test.ts:42-48, steps.weekly-announcement-schedule.test.ts:63-69) | Recorded "so the next reader knows", with no owner and no step | As written this is a deletion |
| A19 scope section 8 | RES-4 (a11y of the per-slot control), RES-5 (sticky timing: owner question), RES-6 (output receipt: owner), RES-7 (reviewer convention), RES-G4 in 33f7557's body (routed to architect) | Various seats and the owner | None of these is in A19's row |

### 2.4 L14 shipped, but only half its residual register is discharged

R5 and R10 did land in `docs/loop/traps-tests.md:89-99`, which I read.
R4, R8 and R9 did not (see 2.3). R1, R2, R6 and R7 are standing or
accepted by design. R3's enforcer shipped as gate-commands.structure.test.ts
in `c80fa68`; I did not re-run it.

---

## 3. Per-row evidence (non-trivial rows only)

Every quantity names its command. Every file count comes from Git Bash
unless marked PS, meaning `@(Get-Content <p>).Count` in PowerShell.

- **A8.** Evidence is in 2.1. What remains open: A8-P (routes a and the zip
  path, grading.ts:871), exclusion (deferred by Ruling A), residual routes c
  and d with owners already named in the row (Ruling J), and the Ruling O
  contradiction. The row's last word is "A8-R IS PARKED BEHIND A16", but
  A8-R had already shipped at 15:04-15:51 on 2026-09-20.
- **A12, A13.** `b7e62fe` adds ungradedDisclosure.ts (177 lines) and
  corrects the seeded strengths text and the skipped-status literal. Its
  own message says "RES-5 still owes the VISIBLE treatment". `917d29f`
  then adds ungradedRowLabel.ts and a CSS rule on `[data-ungraded-state]`.
  I read both diffs at `--stat` level plus their messages. A13's residual
  RES-4 (owner, a real browser) and RES-5 (contrast in both themes) are
  owner or seat items with a named step.
- **A14.** `cb478e9` (2026-09-15) is the fix. Its body opens "A14, live on
  main and grade-affecting". It also edited docs/backlog.yml (the note's
  "TWO CORRECTIONS" paragraph comes from it), yet the title still reads
  "LIVE ON MAIN" and the instrument still says utils.test.ts is 68 lines
  with zero tests (PS count today: 390). Three items are still open. The
  sanitized-name collision has an owner and an instrument (the owner's real
  Canvas zip filenames) but no step. The phantom row from a 4-part leaf
  name is "deliberately left unfixed", with no owner. Files past
  MAX_NESTED_ZIP_DEPTH = 3 vanish silently, with no owner. As written, the
  last two are deletions.
- **A16.** Waves 0-3 plus the fix pass are all in `git log`. The note says
  "A fix pass is running", but `f8d65eb` ("build the three wave 3
  tightenings as they were actually worded", 09:37:47) is that pass, and
  its diff rewrites canary S-26 to call the shipped `collectorDecl`
  (`git show f8d65eb | grep -n S-26`). The row's RES-W3V numbering does
  not match docs/a16-wave3-verify.md:495-496. In the doc, RES-W3V-3 is the
  two graded counts (now A28, shipped) and RES-W3V-4 is the S-26 canary
  (discharged by f8d65eb). The row gives other meanings to W3V-2/3/4.
  What remains is owner-only (RES-W3-1/2/3/5, RES-V-6, the W3V browser
  claims) plus conditional triggers (RES-V-1/3/4/7/8), each already
  carrying an owner, an instrument and a step in the note. No
  agent-buildable wave remains, so `actionable` is the wrong state.
  GradingRecordingPanel.tsx is 990 (PS), which matches the note.
- **A18.** `d62aea3` covers the seven strings the row names ("Seven defect
  loci across the two composers"). The same commit also changed A16 and
  A18 `state` from illegal values (`planned`, `scoped`) to `actionable`
  (`git show d62aea3 -- docs/backlog.yml`). What remains is
  docs/a18-ac.md section 6: R-1 (REGRESSION entry; stale 427-line figure
  at REGRESSION.md:41936), R-3 and R-4 (owner), R-5/R-6/R-7 (test seat).
  I did not check whether d62aea3 discharged R-6 or R-7. Layer (3), the
  tool living under a tab called Recording, is still an owner question.
- **A19.** `3d2f07f` is the feature, `26bf0d0` the UX-pass edits and
  `33f7557` the guard-instrument replacement. The row still reads as a
  pre-scope feature request and claims the panel is 979 lines (PS: 985).
- **A21.** `91ede74` addresses the note's six action-layer mutants, going
  by its message ("The whole request handed to the model is now
  compared... Two expect(true) tests deleted"). I read its `--stat` but not
  the assertions. Still open: the REGRESSION entry, owner items (a)-(c),
  accepted limit (d), and RES-10 without an owner.
- **A22.** `7375a21` narrows the specifier and deletes
  KNOWN_UNREGISTERED_LOCAL_FILES entirely, which answers the row's closing
  question about whether the list should exist. `4dad288` later replaced
  the raw-source pattern guard with an AST walk, which discharges
  RES-A22-1 in substance. I did not determine whether A23's
  `directoryRoots` covers RES-A22-3 (.js files and subdirectories).
- **A23.** `4dad288` and `38f0e95` shipped the transitive walk.
  `4de8a59` (02:39) records that an owner decision is owed: twelve of
  sixteen src/lib/grade modules are now freely importable. The row does not
  record an answer. RES-A23-1 and RES-A23-2 are in the row with an owner.
  Sites 4 and 5 are not (see 2.3).
- **A26, A27.** `3366654` has a new useRepoGradesBulkGrade.lifecycle.test.ts
  (395 lines). Its message says the test "drives the real handler and was
  red before the fix (6 of 7)". I did not reproduce the red-before. The
  message also says the per-cell button gets the same catch (the row's
  R-6) and corrects the misleading comment in useRepoGradesRubricSource.ts
  (the row's note). RR-3 went into the build: classTrendsFolderEntry.ts is
  in the diff. What remains is RR-1 and RR-2, both owner and a real
  browser (docs/a26-a27-scope.md section 16).
- **A28, A30.** `f6f0515` adds the pure classifier. `832e9d3` routes the
  per-cell path through it and sets the cell error. A28's RR-1 is A30. RR-2
  (a REGRESSION baseline "before hand-off") is not found by id (see 2.2).
  RR-3 is an owner browser check.
- **L14.** See 2.4.
- **L15.** `grep -rlE "readdirSync|walkTsxFiles" --include=*.test.ts src | wc -l`
  = 39. The row says 32. `grep -n testTimeout vitest.config.ts` exits 1, so
  the row's core premise still holds.
- **L9.** `grep -rl readFileSync --include=*.test.ts src | wc -l` = 203 and
  `grep -rl stripComments --include=*.test.ts src | wc -l` = 69. The row
  says 176 and 57.
- **G4.** `grep -rn "callLlm(" src --include=*.ts --include=*.tsx | grep -v "\.test\." | wc -l`
  = 127 (the row says 124). `head -1 src/app/page.tsx` is `"use client";`
  and `grep -c "AbortSignal\|timeout" src/lib/llm.ts` = 0, both as the row
  claims.
- **R2.** `grep -roE "await requireOwner\(\)" src | wc -l` = 411, matching
  the row. `grep -roE "await requireAppOwner\(\)" src | wc -l` = 23,
  matching. `grep -rlE requireAppOwner src | wc -l` = 24 against the row's
  19. I cannot compare these, because the row does not name the instrument
  behind 19 and mine includes test files.
- **A7.** PS counts: index.tsx 930, RepoGradeCellControl.tsx 651,
  RepoGradesControls.tsx 647, RepoGradesGrid.tsx 643, LinkUsernamesPanel.tsx
  453. Only index.tsx differs from the row.
- **A17.** `grep -n regenerateArmed announcement-draft-slots.ts` gives the
  first hit at :105. The event union members are at :367 and :371. A19's
  `3d2f07f` edited this file. The capability still exists; only the line
  cites are wrong.
- **N13a.** `grep -n` on class-trends-draft.ts: the floor constant is at
  :18, and enforcement is `if (report.totalResults < floor)` at :168. The
  stale comment the title asks to fix was rewritten by `2c92fec`
  (2026-09-20). It now says the old text was wrong, at :90-98. The row
  does not mention 2c92fec (`'2c92fec' in note` = False).

---

## 4. State field check

All 46 states are legal against `BACKLOG_STATES`
(src/tools/backlog/types.ts:75-80). Where state does not fit the
classification:

- **A16, A18, A21 are `actionable` with no remaining agent-buildable
  work.** Each should become `verification` (owner items) or be split.
  They are also invisible to `selectNext`: `isScoped` (types.ts:88-90)
  requires non-empty `owns` and `verify`, and all three have neither.
  `actionable` therefore does not make them selectable. It just
  misdescribes them.
- **A12, A13, A14, A19, A22, A23, A26, A28, L14 are `unscoped` although
  they shipped.** `unscoped` means "lacks owns/verify; nobody works it until
  it is scoped" (types.ts:13). For a shipped row that sends the reader the
  wrong way, which is today's four incidents over again.
- **A27 and A30 are `unscoped` and closeable.**
- **A30 carries `blocked_by: ['A28']` against a row that has already
  shipped.**

---

## 5. What exists today, measured

### 5.1 The stop guard cannot currently block

`echo '{"stop_hook_active": false}' | npm run --silent backlog:stop-guard`
printed "stop allowed: no actionable item; 36 item(s) are unscoped and
cannot be selected" and exited 0. The mechanism is next.ts:25-37. It
requires `isScoped` for an actionable item, and no row has a `verify`, so
the three actionable rows count as unscoped (33 + 3 = 36). Two
consequences:

- L16's complaint (the guard blocks while work is in flight) cannot occur
  against the current file. Its underlying point, that no state means
  in flight, still stands.
- The guard is the only automated reader of the backlog that runs every
  turn (.claude/settings.json: a Stop hook running
  `npm run --silent backlog:stop-guard`). Today it reads nothing about
  shipped work at all.

### 5.2 Nothing links commits to rows

- `ls .git/hooks | grep -v sample` returns nothing, `core.hooksPath` is
  unset, and there is no .husky/ or .githooks/.
- CI runs no tests. `grep -ln "vitest\|npm test\|npm run test"
  .github/workflows/*` exits 1. The canary `grep -ln supabase` hits
  supabase-migrations.yml.
- `src/tools/backlog/backlog-file.structure.test.ts` checks render
  byte-identity, kind, area and a frozen row count of 46 (:55). It never
  reads git.
- No test in src/ spawns git. The only test files calling
  execSync/execFileSync/spawnSync are under src/tools/vitest-paths/, and
  they spawn node/vitest.

So nothing in the repo fails when a commit naming a row lands while the
row is unchanged.

---

## 6. Proposed mechanism: a shipped-row check in the Stop hook

### 6.1 What it does

Add a pure function `shippedButUncited(items, commits)` in
src/tools/backlog/ and call it from the existing `stop-guard` CLI, before
`decideStopGuard`:

1. Input `commits`: one `git log --since=<oldest row's filing date>
   --name-only --format=%x1e%h%x1f%aI%x1f%s` call, parsed into
   {hash, date, subject, files}.
2. A commit counts as WORK when it touches any path outside `docs/`,
   `.claude/`, `src/tools/backlog/backlog-file.structure.test.ts` and
   `src/tools/backlog/areas.ts`. The last three are what backlog-only
   commits touch: row-count bumps and area registrations.
   This rule deliberately ignores the conventional-commit type, because
   `db747cc` is typed `docs(...)` and carries A8-R wave 2.
3. A row is FLAGGED when a WORK commit names its id, word-bounded
   `(^|[^A-Za-z0-9-])<id>([^A-Za-z0-9]|$)`, case-insensitive, in the
   SUBJECT, is dated after the row was filed, and the row's text does not
   contain that short hash.
4. Any flagged row makes the guard BLOCK once per turn, reusing the
   existing escape 2. The reason names the row and the commits: "A30 names
   832e9d3 but its row does not cite it: record the ship, or add the hash
   to the row's `from`/`note` with the word 'unrelated'". The fix is
   always a row edit, which is exactly the step that has been skipped.

The reverse case (a row claiming work that does not exist) is out of
scope for this mechanism. See the residual register.

### 6.2 Pass condition

- **Object:** the set of (row id, commit hash) pairs where a WORK commit
  names the row and the row does not cite the hash.
- **Instruments:** `git log` for the commits, `parseBacklogYaml` for the
  rows, and the word-bounded regex above for the match.
- **Direction of failure:** a non-empty set blocks the turn (fails loud).
  The dangerous direction is a false EMPTY set, which is today's state. A
  unit test must therefore feed a fixture commit naming a fixture row and
  assert the block, and a sabotage that removes the hash-citation check
  must turn it red.

### 6.3 Dry run against today's history (measured, not built)

This is a scratchpad Python script implementing rules 2-3. It is not in
the repo. Row filing date = first commit adding `id: '<ID>'` to
docs/backlog.yml (`git log --reverse -S`). It flagged 15 rows:

A8 (d5a3e2c, 58a4254, 75bd7d4), A12 (b7e62fe), A13 (917d29f, b7e62fe), L14
(c80fa68), A16 (f8d65eb), A18 (d62aea3, db747cc), A19 (33f7557, 26bf0d0,
3d2f07f), A20 (db747cc), A21 (91ede74), A22 (7375a21), A23 (38f0e95,
4dad288), A26 (3366654), A27 (3366654), A28 (832e9d3, f6f0515), A30
(832e9d3).

Against the manual audit:
- True positive for every shipped row in section 1 except A14. A14's
  commit names it only in the body.
- The one questionable hit is `db747cc` on A18/A20. The commit names
  a18-scope in its subject but actually carries A8-R code. It still
  deserves a loud flag, since it is the mislabelled commit this audit was
  warned about.
- An earlier variant also excluded only `docs/`. It raised false positives
  from row-filing commits (1231452, 4abcf7b, ddb2760) and one
  `.claude/agents` commit (94f1e77). The path exclusions in rule 2 remove
  all of them.
- Matching on the body as well would catch A14. It would also catch
  casual mentions: d077556 "unblocks A7", 81e63d1 names L13, and 38f0e95
  uses "G2" for guard 2. So body matching is not recommended without a
  trailer convention.

### 6.4 Cost

- **Runtime:** measured, not estimated. The single-pass
  `git log --since=2026-09-14 --name-only` over 275 commits took 0.27s
  real (`time (... | wc -l)`). My dry run took 28.3s only because it ran
  `git show` once per commit per row. A real build must use the single
  pass.
- **Code:** my estimate, not measured. About 60-90 lines for the pure
  function, plus a fixture test with a firing canary and one sabotage,
  plus about 10 lines in cli.ts. The write set is
  src/tools/backlog/stop-guard.ts or a new leaf, cli.ts, and their tests.
  It shares files with L16, so sequence the two, or decide them together
  as L16's note already asks for L14/L15/L16.
- **New dependency:** this would be the first backlog-tool code to spawn
  `git`. A shallow or absent `.git` must fail OPEN with a printed warning,
  never crash the Stop hook. A crashing hook is worse than none.
- **Friction:** every legitimate ship would block once until the row
  cites the hash. That friction is the purpose, and escape 2 bounds it to
  once per turn.
- **What it cannot do:** it cannot see work whose commit message names no
  id (the A8-R-in-db747cc shape if the subject had named nothing), and it
  cannot judge whether the row's update is correct, only that one
  happened.

An alternative I rejected is putting the check in
backlog-file.structure.test.ts. It would run only when someone runs the
full suite. It would add the first git spawn to `npm test`, and history
in a test makes the suite depend on clone depth. The Stop hook already
runs every turn, which is when the omission happens.

---

## 7. Residual register (what this report knowingly did not prove)

| Id | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| RR-1 | Whether A8-R wave 2 really renders "Submission" for every unconfirmed row (2.1). I read the label Records, not every consumer | The orchestrator's checker of this report | `git show db747cc`, then read GradingTableRow.tsx:260-310 and grading-feedback-prompt.ts:120-135 | Before any edit to A8's row |
| RR-2 | Whether any REGRESSION entry covers the 13 rows in 2.2 under a different name | Checker of this report | Read REGRESSION.md entries 429-434 by hand | Before recording any "REGRESSION owed" residual |
| RR-3 | The reverse direction: rows asserting absences that are false today. I checked the cites each row leans on (section 3). I did not re-grep every absence claim in A3, A4, N15a, N13b, R2's unverified "canvas-core.ts has zero guard calls", or G4's route list | Orchestrator, at each row's next scoping pass | The row's own named instrument, plus a canary | That row's scoping pass |
| RR-4 | Red-before claims in 3366654 (6 of 7), f6f0515 (5 of 18) and d62aea3 (33 of 254). I read these in commit messages and did not reproduce them | Test seat, if any of these rows is closed on the strength of its test | Revert the production file to its parent in a scratch copy and run the paths wrapper | Before deleting A27 or A30 |
| RR-5 | Whether A23's directoryRoots enumerates .js files and subdirectories, which would settle RES-A22-3 | Orchestrator, when A22 is closed | Read src/lib/module-graph/runtime-import-graph.ts `directoryRoots` | A22's closure |

### What I could not determine at all

- Whether any rendered surface looks or behaves as the rows claim. No
  component renders here (docs/loop/this-repo.md section 6).
- Whether A12/A13 RES-5 contrast, A26 RR-1, or any owner browser check was
  ever carried out. The repo holds no such record, and one could not be
  made here.

---

## 8. Tests run, and tree state

One test run, through the wrapper, covering six test files from shipped
rows. This proves only that they pass now, not that they can fail:

`npm run --silent test:paths src/app/components/repo-grades/useRepoGradesBulkGrade.lifecycle.test.ts src/app/components/grading-results/ungradedDisclosure.test.ts src/app/components/grading-results/ungradedRowLabel.test.ts src/lib/module-graph/runtime-import-graph.test.ts src/tools/vitest-paths/paths-gate.test.ts src/lib/grade/submission-kind.test.ts`

```
Test Files  6 passed (6)
     Tests  282 passed (282)
COVERED src/app/components/repo-grades/useRepoGradesBulkGrade.lifecycle.test.ts files=1 passed=22
COVERED src/app/components/grading-results/ungradedDisclosure.test.ts files=1 passed=41
COVERED src/app/components/grading-results/ungradedRowLabel.test.ts files=1 passed=13
COVERED src/lib/module-graph/runtime-import-graph.test.ts files=1 passed=172
COVERED src/tools/vitest-paths/paths-gate.test.ts files=1 passed=24
COVERED src/lib/grade/submission-kind.test.ts files=1 passed=10
exit=0
```

`git status --short`, run before writing this file, showed only
` M docs/css-orphans.md`, which was pre-existing and left alone. Scratch
files (rows.txt, rows2.txt, dryrun.py) are in the session scratchpad,
not the repo.
