# A16 wave 3, as-built verification of `e57b1c5`

Verification seat, 2026-09-21. I did not build this. I read
`docs/a16-wave3-scope.md` (revision 1, all of it), `git show e57b1c5`, the
eight files it touches as they stand at HEAD `0b96cab`, and the round-1
checker's replica detectors in the session scratchpad (`w3/detectors.cjs`).
Then I executed every sabotage in scope section 13.4 against the shipped code,
ran `tsc` on S-2 and S-16 myself, and attacked the instruments with new
shapes.

**Headline.**

1. **All 29 of the builder's sabotages go red on the shipped code.** Each is
   killed by the detector the scope names for it. S-2 and S-16 are also
   `tsc` kills, which I reproduced myself (TS2339; TS2345 plus TS2322).
2. **Eighteen fresh mutations survive every test in the four directories
   that could see them, and every one I type-checked passes `tsc`.**
   - Fifteen also survived the WHOLE suite (22140/22140, in two combined
     runs).
   - Three were run against the four directories only (1261/1261).
   - Two of the eighteen leave a lint warning; the other sixteen leave no signal at all.
   - Several are the same failure this row has now shipped four times: the
     panel never shows, or it shows the wrong thing, with every gate green.
3. **The two holes the pre-build check found are only partly closed.**
   - The `if`-count rule counts `IfStatement` and nothing else. An exit
     through `while`, `switch`, a short-circuit `throw`, or a third `if` in
     `gradeOneTarget` all pass.
   - The only writer-count rule counts direct CALLS of `setLastRunCohort`, so
     an alias walks past it.
   - The collector `runResults` has no reference count at all.
4. **Three rules are looser than scope revision 1 specifies:**
   - A-6 never checks that the `return` belongs to the default-exported
     component;
   - A-3(c) never checks that `<r>` is a `const`;
   - A-8 counts binding elements instead of checking that the binding is the
     hook call's.

   The checker's own replica had the first two.
5. **The leverage removal test catches DELETION, not REMOVAL.** S-13
   (delete the tag) is red. Hiding the same tag with `<div hidden>` (F-9)
   is green everywhere. So is a second, ungated `<ClassTrendsPanel entry=
   {trendsEntry!}>` that crashes the view before any run (F-16).
6. **The label passes on both counts.** Its folder is the handler's own
   argument, and the copy matches section 7.3.1 word for word. There is one
   new by-reading finding: when one repo's model call fails, the label's
   count and the status line's "graded" count differ (section 5.2).
7. **The addition caps hold.** Both counters agree on all eight files. One
   file sits exactly at its cap.

---

## 0. What this verification CANNOT establish

- **No component is rendered by any test in this repo.** `vitest.config.ts:28`
  is `include: ["src/**/*.test.ts"]` and `:29` is `environment: "node"`. So
  none of the following is established by anything here, including by me.
  Each is a READING CLAIM about source expressions:
  - that the panel appears above the grid after a run;
  - that `defaultExpanded` opens it;
  - that the label reads correctly on screen;
  - that a "Nothing to grade" click leaves the previous trends in place;
  - that a new run unmounts the old panel.

  The same applies to what each fresh survivor below "does to the user"
  (hides the panel, blanks the view, crashes it). I say "by reading"
  wherever that is the only basis.
- **Nothing executes `handleGradeColumn` or `runBulkGrade`.** Both are
  reached only from a `.tsx` onClick. Every wiring claim rests on the AST pins
  in `repoGradesClassTrends.wiring.test.ts` and on `tsc`.
- **No `.env`, no API key, network blocked** (`vitest.setup.ts`). The
  RES-W3-8 probe (section 8) mocks `callLlm`. How often a REAL model
  rewords area names is not measurable here.
- **I did not run `npm run lint` over the repo or `npm run build`.** I ran
  `eslint` directly on the four production files (section 1). I ran
  `npx tsc --noEmit` nine times, one at a time and never alongside a sabotage
  run.
- **I did not run the UNMUTATED whole suite.** Both whole-suite runs were
  with mutants applied, and both were 22140/22140 green.
- **I could not read the orchestrator's dispatch to the builder.** Its
  "counting rules" and "Tightening 3" are not on disk: `Grep "Tightening"`
  over `src/` hits only `repoGradesClassTrends.wiring.test.ts:369`, and
  over `docs/` it hits only files from other items. So I judge the rules
  against two sources, cited per finding:
  - scope revision 1 as it stands on disk;
  - the checker's replica `scratchpad/w3/detectors.cjs`.

---

## 1. Measurements

`$S` is `C:\Users\alexa\AppData\Local\Temp\claude\C--Users-alexa-OneDrive-Documents-Projects-teaching-assistant\e8e96e62-aa3d-4508-b28a-354d4d297572\scratchpad\w3verify`.
The mutation driver is `$S\mut.mjs`. It applies each edit only if its search
string occurs exactly once, runs vitest with the JSON reporter, restores from
a `.orig` copy made with `Copy-Item`, and asserts byte equality.

| Quantity | Value | Command |
|---|---|---|
| Wave-3 source files changed since `e57b1c5` | 0 (only `docs/` moved) | `git diff --stat e57b1c5 HEAD` |
| WS-3 baseline | 24 passed (24) | `npx vitest run src/app/components/repo-grades/repoGradesClassTrends.wiring.test.ts` |
| WS-2 baseline | 27 passed (27) | `npx vitest run src/app/components/repo-grades/classTrendsFolderEntry.test.ts` |
| `tsc`, clean tree | exit 0, no output, 13 s; run twice | `npx tsc --noEmit` |
| `eslint`, clean tree, on the four production files | exit 0, no output | `node node_modules/eslint/bin/eslint.js <the four files>`. Canary: the same command printed a warning under two mutants (section 4), so it lints these files |
| All 29 builder sabotages plus 16 fresh mutants, against WS-2 and WS-3 | section 2 and section 4 | `node $S\mut.mjs all` (output in `$S\run-all.txt`), plus separate runs for S-2, F-10b, F-11b and F-16 |
| Fresh set A (11 mutants combined), whole suite | 22140 / 22140 passed | `node $S\mut.mjs "F-1+F-3+F-4+F-5+F-7+F-8+F-9+F-10+F-11+F-13+F-14" --whole` |
| Fresh set B (5 mutants combined), whole suite | 22140 / 22140 passed | `node $S\mut.mjs "F-2+F-5b+F-6+F-15+F-12" --whole` |
| F-10b, F-11b and F-16, four directories (`repo-grades`, `drafted-grades`, `grading-results`, `lib/module-graph`) | 1261 / 1261 each | `node $S\mut.mjs <id> --full` |
| Byte identity after every restore | SHA-256 identical to the pre-verification hashes of all four files | `Get-FileHash`: `2A9DAC19...` bulk hook, `DCD5EDFC...` actions hook, `8304C528...` index, `91C828AF...` leaf; before and after |
| `index.tsx` line endings | index blob LF, working copy CRLF | `git ls-files --eol`: `i/lf w/crlf`. `core.autocrlf` is `true`. The committed blob is LF, so nothing shipped is wrong. The driver converts its search strings to CRLF for this file |

---

## 2. The 29 builder sabotages: verdict and killing detector

The object is each mutant applied to the SHIPPED file. The instrument is
WS-2 plus WS-3, plus canary 3
(`classTrendsDraft.not-postable.test.ts`) for S-17 and S-21. The direction of
failure: a mutant PASSES this table only if at least one assertion goes red
AND that assertion is the detector the scope names. A kill by some other
assertion is reported as a mis-attribution.

| # | Mutation as executed | Verdict | Red assertions (WS-3 or WS-2 title) | Attribution |
|---|---|---|---|---|
| S-1 | delete `runResults.push(...)` | KILLED | A-1 "a direct statement spreads..." | as named |
| S-2 | push moved into the `"noSubmission"` branch | KILLED | A-1; **`tsc` TS2339** (section 3) | as named, both |
| S-3 | `return runResults;` moved above `await Promise.all` | KILLED | A-2(d) | as named |
| S-4 | delete the attempt-time clear | KILLED | A-3(a), A-3(b) (2 calls expected), A-5 (3 call sites) | A-3(a) named. The other two are count side-effects of the same deletion, not wrong detectors |
| S-5 | clear moved above the empty-plan `if` | KILLED | A-3(a) only | as named: the order clause alone |
| S-6 | `results: []` | KILLED | A-3(c) | as named |
| S-7 | `if (runResults === null) setLastRunCohort(...)` | KILLED | A-3 one-`if`, A-3(b), A-3(c) | as named |
| S-8 | delete the course-switch clear | KILLED | A-4, A-5 count | A-4 named |
| S-9 | leaf drops the `courseId` comparison | KILLED | L-3 c1 | as named |
| S-10 | `? null : entry` | KILLED | L-3 c2 to c6, L-4, L-5, L-6 (14 red) | as named |
| S-11 | `assignmentName: cohort.courseName` | KILLED | L-4, L-6(a) | as named |
| S-12 | entry built from a fresh `buildRepoRunCohort({ results: [] ...})` | KILLED | A-5 initializer | as named |
| S-13 | delete `<ClassTrendsPanel .../>` (the leverage removal test) | KILLED | A-6 "exactly one", A-6 path, A-7, A-8 | as named |
| S-14 | ungated, `trendsEntry!` | KILLED | A-6 bare-`entry`, A-6 path, A-7, A-8 | as named |
| S-15 | label omits the folder | KILLED | L-6(a) | as named |
| S-15b | delete the label `<p>` | KILLED | A-7 | as named |
| S-16 | `!trendsEntry && (...)` | KILLED | A-6 path, A-8; **`tsc` TS2345 + TS2322** (section 3) | as named, both |
| S-17 | value import `BulkGradePlan` from `./repoGradesBulkGrade` | KILLED | canary 3; L-7 specifier set; L-7 no-`./repoGrades` | as named |
| S-18 | `folder: courseId, courseId: folder` | KILLED | A-3(c) | as named |
| S-19 | `const isTrendable = hasTrendableResults;` in the leaf | KILLED | L-7 name rule | as named |
| S-20 | refusal returns `[]` | KILLED | A-2(a) | as named |
| S-21 | leaf imports `callLlm` from `@/lib/llm` | KILLED | canary 3; L-7 specifier set | as named |
| S-22 | negated gate nested inside the correct one | KILLED | A-6 path, A-7, A-8 | as named |
| S-23 | `model && trendsEntry && (...)` | KILLED | A-6 path, A-8 | as named |
| S-24 | final set wrapped in `if (runResults?.length === 0)` | KILLED | A-3 one-`if`, A-3(b), A-3(c) | as named |
| S-25 | push wrapped in `if (first)` | KILLED | A-1 | as named |
| S-26 | `runResults = collectorRef.current` | KILLED | A-2(b) | as named |
| S-28 | leaf null test inverted | KILLED | L-0 (all three cells), L-1, L-2, L-4 | as named |
| S-29 | label omits the count | KILLED | L-6(b) both cells, L-6(e) | as named |

**No mutant wears a kill it did not earn.** Two instrument notes, neither of
which un-kills anything:

- **The S-26 canary does not exercise the S-26 detector.** The detector is
  `collectorDecl()` at `repoGradesClassTrends.wiring.test.ts:154-161`, closed
  over the REAL file. The canary at `:181-191` re-implements a looser
  predicate inline ("any const with an array-literal initializer"). So the
  canary proves the inline copy discriminates, not the shipped detector. The
  S-26 kill above was produced by the real detector on the real file, so the
  kill stands. The canary is decorative.
- **The L-6(b) "c6-shaped" cell is not c6.** Scope L-6 requires the `"1"` to
  come from the c6 fixture, which is one graded plus one UNGRADED result
  (`docs/a16-wave3-scope.md:848`). The shipped cell at
  `classTrendsFolderEntry.test.ts:179-184` calls `entryFor("linked-lists", 1)`
  (`:165-169`), which builds only graded results. Its title still says
  "c6-shaped". That substitution is what lets F-11b survive (section 4).

---

## 3. The two type-checker kills, run by me

The object is each mutant on the shipped tree. The instrument is
`npx tsc --noEmit`, run once per mutant, with a restore and a byte check
between runs. The direction of failure: a claimed `tsc` kill FAILS if `tsc`
exits 0 with the mutant applied. vitest strips types and proves nothing here.

| Mutant | Diff applied (`git diff -U1 -- src`) | `tsc` result |
|---|---|---|
| S-2 | `runResults.push(...result.run.results);` added after the `no-submission` `outcomes.push` (`useRepoGradesBulkGrade.ts:227`), and removed at `:306` | **exit 2**: `useRepoGradesBulkGrade.ts(227,35): error TS2339: Property 'run' does not exist on type '{ noSubmission: true; ... }'` |
| S-16 | `{trendsEntry && (` becomes `{!trendsEntry && (` at `index.tsx:853` | **exit 2**: `index.tsx(855,67): error TS2345: Argument of type 'null' is not assignable to parameter of type 'GradingRunEntry'` and `index.tsx(856,29): error TS2322: Type 'null' is not assignable to type 'GradingRunEntry'` |

Both confirmed. S-16 is ALSO killed by the A-6 path detector (section 2), so
the builder's "also caught by a detector" is true. The first S-2 attempt
never ran: my heredoc halved a backslash, and the driver failed to parse, so
that `tsc` run was a second clean baseline (exit 0). I fixed the driver and
re-ran.

---

## 4. FRESH ATTACK: mutations no shipped instrument kills

The object is each mutant on the shipped files. The instruments and their
directions of failure:

- **(i)** WS-2 plus WS-3; a mutant survives if 51/51 stay green;
- **(ii)** the whole suite, or the four directories where stated;
- **(iii)** `npx tsc --noEmit`, run on the combined sets. **tsc reports every
  error in one pass, so a clean combined run means each member type-checks**;
- **(iv)** `eslint` on the four files.

A mutant is a SURVIVOR only if (i), (ii) and (iii) are all green. The column
"Runtime effect" is a reading claim (section 0).

| # | Mutation | Rule it slips past | Runtime effect (BY READING) | (i) | (ii) | (iii) tsc | (iv) eslint |
|---|---|---|---|---|---|---|---|
| F-1 | `runResults.length = 0;` before `onOutcomes` | A-2(c) checks only `=` with the bare identifier on the left (`wiring.test.ts:168`); the collector has no reference count | every run's cohort is empty: the panel never shows | green | whole 22140 | clean | clean |
| F-2 | `runResults.splice(0);` at the same place | same (a writer through a method) | same | green | whole | clean | clean |
| F-3 | the push line duplicated | A-1 finds the FIRST matching push (`:119`) and counts none | every result is counted twice: the label says 6 for 3 repos, and area averages are unchanged but coverage is doubled | green | whole | clean | clean |
| F-4 | `let runResults = await runBulkGrade(...); runResults = [];` in the handler | A-3(c) accepts any `VariableStatement` (`:247-253`). **The scope says `const` (`a16-wave3-scope.md:857`), and the checker replica requires `NodeFlags.Const` (`w3/detectors.cjs:120`)** | panel never shows | green | whole | clean | clean |
| F-5 | `while (runResults?.length) return;` before the final set | A-3's one-`if` count uses `countIfStatements` (`:89-96`, `:208`); loops are not counted | cohort set only on EMPTY runs: panel never shows. This is S-24 again, in loop form | green | whole | clean | clean |
| F-5b | `switch (runResults?.length) { case 0: break; default: return; }` | same | same | green | whole | clean | clean |
| F-6 | `runResults?.length && (() => { throw new Error("x"); })();` | same (a short-circuit exit) | same, plus an unhandled rejection | green | whole | clean | **1 warning**: `no-unused-expressions` at `useRepoGradesGradingActions.ts:778`. Scope 13.3 counts a rising warning as a gate failure, so the lint gate would catch this one |
| F-7 | `if (first?.rubricAreas?.length) return { rubricUsed: result.rubric };` in `gradeOneTarget` before the push | A-1 requires `>= 2` ifs before the push (`:121`), not exactly two. The replica (`detectors.cjs:39-42`) has the same hole | only area-LESS results are collected: panel never shows | green | whole | clean | clean |
| F-8 | `if (!trendsEntry) return (` in place of `return (` at `index.tsx:704` | `gatePathFromWrapper` stops at "parent is a `ReturnStatement`" (`:329`). **The scope requires a direct statement of the default-exported component (`:860`), and the replica checks exactly that (`detectors.cjs:172-175`)** | after any run with trends, the WHOLE Repo Grades view renders nothing | green | whole | clean | clean |
| F-9 | `<div hidden>` wrapper | no rule on the wrapper's tag or attributes (`grep -n attributes` on WS-3: only `:372`, `:374` on the panel and `:409` on the `<p>`) | label and panel present but hidden. **This is the leverage removed without deleting the tag** | green | whole | clean | clean |
| F-10 | `{...{ defaultExpanded: false }}` after `defaultExpanded` | (none: tsc kills it) | - | green | whole | **TS2783, a KILL** | - |
| F-10b | `{...({ defaultExpanded: false } as { defaultExpanded?: boolean })}` | the no-initializer rule ("Tightening 3", `:374-375`) looks at the named attribute only, never at a later spread | panel mounts collapsed, adding a click | green | four dirs 1261 | clean | clean |
| F-11 | label count from `entry.run.results.length` (import left in) | L-6(b)'s "c6" cell has no ungraded result (section 2) | label overcounts whenever a run has a failed-model row (section 5.2) | green | whole | clean | **1 warning** (`gradedResults` unused), an artefact of my edit |
| F-11b | F-11 with the unused import removed | same | same | green | four dirs 1261 | clean | **clean** |
| F-12 | `trendsEntry` removed from the hook destructure; `const { trendsEntry } = { trendsEntry: null };` added before `return` | A-8 counts `BindingElement`s named `trendsEntry` (`:431-440`). **The scope requires the binding to be the hook call's (`:862`)**. tsc passes because `null &&` narrows the right side to `never` | panel never shows | green | whole | clean | clean |
| F-13 | `const clearTrends = setLastRunCohort;`, then `clearTrends(null);` in the empty-plan branch | "exactly 3 call sites" counts direct calls of the identifier (`countCallsTo`, `:81-88`, `:305`), and A-3's then-block check matches the identifier too (`:105-109`, `:211`) | **S-5's behaviour through an alias**: a "Nothing to grade" click wipes the trends, the exact ruling W3-4 forbids | green | whole | clean | clean |
| F-14 | `<p hidden className=...>` | A-7 bans only `role` and `aria-*` (`:409`) | label hidden: trends show with no folder named | green | whole | clean | clean |
| F-15 | `folder = columns[0]?.folder ?? folder;` before the final set | A-3(c) checks the key binds the identifier `folder`, not that `folder` is still the unmodified parameter | label names the FIRST column's folder, not the clicked one: the live-value class section 9 exists to prevent | green | whole | clean | clean |
| F-16 | a second `<ClassTrendsPanel entry={trendsEntry!} defaultExpanded></ClassTrendsPanel>` before the grid | "exactly one" counts only `JsxSelfClosingElement`s (`findJsxSelfClosing`, `:331-338`) | `computeClassTrends(null)` dereferences `entry.run` (`class-trends.ts:272`, via `ClassTrendsPanel.tsx:91`), so the view crashes whenever no run has trends: on first load | green | four dirs 1261 | clean | clean |

That is **18 survivors** (F-1 to F-16, plus F-5b, F-10b and F-11b, less F-10, which
`tsc` kills). **Two leave a lint warning** (F-6, and F-11 only as I wrote it),
and the other 16 leave no signal at all. `tsc` was run on set A (with F-10
swapped for F-10b), on set B, and on F-11b and F-16 alone; all exited 0.

### 4.1 The rules the brief asked about, built vs specified

| Rule | Specified where | Built? | Evidence |
|---|---|---|---|
| Statement-level exits closed by counting | scope A-3 "EXACTLY ONE `IfStatement`" (`:857`) | **Built as written, and the rule as written is too narrow.** It counts `IfStatement` only. `grep -cE "isSwitchStatement\|isWhileStatement\|isForStatement\|isForOfStatement\|isDoStatement\|isThrowStatement"` on WS-3 returns 0 (canary: `grep -c isIfStatement` returns 7) | F-5, F-5b, F-6 |
| The push is a direct statement after both early returns | A-1 (`:855`) | Built, but the "direct statement" rule proves only where the push SITS, not that it is REACHED. `>= 2` admits a third exit | F-7 |
| Collector writers | A-2(c) "never the left side of an assignment" (`:856`) | Built as written. It adds nothing a `const` does not already enforce, and it counts no references, so mutation through `.length`, `.splice` or a second push is invisible | F-1, F-2, F-3 |
| Cohort writers: "exactly three places" | A-5 (`:859`) | **Built as CALLS of the identifier `setLastRunCohort`, not as references.** An alias (F-13) passes. A destructure (`const cohortState = useState(...); cohortState[1](null)`) and a property access through another name have the same shape. I executed only the alias | F-13 |
| Wrapper attributes | brief ("wrapper-attribute rule"); not in scope rev 1 | **Not built.** No check on the wrapper's tag or attributes, nor on the label `<p>`'s non-ARIA attributes | F-9, F-14 |
| `defaultExpanded` with no value | "Tightening 3", `:369-375` | **Built.** A literal `defaultExpanded={false}` fails it. A later literal spread is a `tsc` kill (F-10). A typed spread survives (F-10b) | F-10b |
| A-6 path ends in the default component's direct `return` | scope A-6 (`:860`) | **Loosened**: checks only `isReturnStatement(parent)` (`:329`). The replica checked the default-export modifier (`detectors.cjs:173-175`) | F-8 |
| A-3(c) `<r>` is a `const` | scope A-3(c) (`:857`) | **Loosened**: no `NodeFlags.Const` check (`:247-253`). The replica required it (`detectors.cjs:120`) | F-4 |
| A-8 binding is the hook call's destructure | scope A-8 (`:862`) | **Loosened** to "one `BindingElement` named `trendsEntry` anywhere" | F-12 |
| L-6(b) singular cell is c6 | scope L-6 (`:848`) | **Substituted**: an all-graded fixture | F-11b |

### 4.2 What the fresh attack shows

Every instrument here asks about the SHAPE AROUND a node:
- whether it is a direct statement;
- whether its ancestors are the one gate;
- whether it is called N times.

None of them asks about what reaches or modifies the node through a path the
shape does not name: an earlier exit of a different syntax kind, an alias, a
method call on the collector, a sibling mount, or an attribute. Revision 1
correctly moved from "is a correct gate present" to "does anything else
control the node". But it enumerated the controlling node KINDS it thought of
(`IfStatement`, `&&`, `?:`), and each survivor uses one it did not. The
closure is the same move one level further:

- count every `ReturnStatement`/`ThrowStatement`/loop/`switch` in the
  handler and in `gradeOneTarget`, not only `IfStatement`s;
- count every REFERENCE to `runResults` and `setLastRunCohort`, not calls;
- pin the wrapper's tag and its complete attribute list;
- walk to the default export.

That is the test seat's to design, not mine. This section is the evidence it
needs.

---

## 5. The label

### 5.1 Source and copy: both as specified

The object is the folder in the label's text. The instruments are reading
plus the AST pins. The direction of failure: FAILS if the folder can come
from anything but the clicked column.

Hop by hop, all opened:

1. `RepoGradesGrid.tsx:423`: the button calls `onGradeColumn(column.folder)`.
2. `index.tsx:898`: passes `onGradeColumn={handleGradeColumn}`.
3. `useRepoGradesGradingActions.ts:760`: `handleGradeColumn = async (folder: string) =>`.
4. `:777`: `buildRepoRunCohort({ results: runResults, folder, courseId, course })`.
5. `classTrendsFolderEntry.ts:71`: `folder: input.folder`.
6. `:86`: `assignmentName: cohort.folder`.
7. `:104`: the template interpolates `entry.assignmentName`.

`folder` is never reassigned in the handler (`grep -n folder` over the file
shows no `folder =`). No live control is read. The binding in step 4 is
pinned by A-3(c), step 6 by L-4, and step 7 by L-6(a) and (c). The
parameter's IMMUTABILITY is not pinned (F-15).

**Copy.** `classTrendsFolderEntry.ts:104` produces
`Trends for "<folder>" from the last Grade all run, covering the <n> repo[s] it graded.`
Its `noun` is `repo` exactly when `count === 1` (`:103`). That is character
for character both lines of scope section 7.3.1 (`a16-wave3-scope.md:415-416`),
with straight double quotes. It names the FOLDER, not a Canvas assignment
title, as the owner confirmed (Q3, scope section 17). It carries no role or
aria attribute (`index.tsx:855`, pinned by A-7).

### 5.2 By reading: two "graded" counts can disagree on one screen

The object is the label's count against the status line's count after a run
in which one repo's model call throws. Instrument: reading. Direction: a
finding if the two numbers differ.

- `engine.ts:248-268`: a throw inside grading becomes an UNGRADED row
  (`kind: "grading-failed"`).
- `github-repos.ts:839-840` returns that run as SUCCESS.
- `useRepoGradesBulkGrade.ts:303` then records the target as
  `status: "graded"`, and `:306` collects the ungraded result.
- `bulkGradeSummaryLine` counts `status === "graded"`
  (`repoGradesBulkGrade.ts:170`), so the status line reads, for example,
  "Bulk grading finished: 3 graded."
- The label counts `gradedResults` (`classTrendsFolderEntry.ts:102`), which
  excludes ungraded rows (`types.ts:180-181`), so it reads "covering the 2
  repos it graded."

The label is the accurate one. The status line's meaning predates wave 3.
But wave 3 put a second, differently-computed "graded" count on the same
screen. Routed as RES-W3V-3. F-11b shows the label's correct count is
itself unpinned.

---

## 6. Reachability: from the control to the new code

The object is the chain from a clickable control to the mounted panel. The
instrument is reading each hop, every one opened. The direction of failure:
FAILS if any hop is conditional on something the instructor cannot reach.

1. Tools tab: `tabs/tab-sections.ts:40` (`manual: "Tools"`). Rail item:
   `manual/manual-rail.ts:88` (`id: "repo-grades"`). A rail click sets
   `manualView` (`page.tsx:338-340`).
2. `page.tsx:578-580`: `manualView === "repo-grades"` renders `<RepoGradesTab />`.
3. `index.tsx:878`: `{model && (<RepoGradesGrid ... />)}`. At `:898` it
   passes `onGradeColumn={handleGradeColumn}`.
4. `RepoGradesGrid.tsx:505-520`: `columns.map` renders one
   `<ColumnHeaderControls onGradeColumn={onGradeColumn}>` per column.
5. `RepoGradesGrid.tsx:416-426`: an MUI `Button`, `disabled={bulkRunning}`,
   whose `onClick` calls `onGradeColumn(column.folder)` (`:423`).
6. `useRepoGradesGradingActions.ts:760-778`:
   - the plan;
   - the empty-plan return (`:762-768`, with no clear);
   - `setLastRunCohort(null)` (`:771`);
   - the awaited resolve;
   - `const runResults = await runBulkGrade(plan, resolved)` (`:774`);
   - the unconditional set (`:777`).
7. `useRepoGradesBulkGrade.ts:174-389`:
   - the refusal returns `null` (`:178`);
   - the collector is declared at `:189`;
   - the push is at `:306`, reached through the prologue and every pool
     worker via `gradeOneTarget`;
   - `return runResults` is at `:389`, after `await Promise.all` (`:383`).
8. `useRepoGradesGradingActions.ts:782`: `trendsEntry =
   repoRunTrendsEntry(lastRunCohort, courseId)`, returned at `:794`.
9. `index.tsx:677` destructures it. `:853-858` renders the gated wrapper with
   the label and `<ClassTrendsPanel entry={trendsEntry} defaultExpanded />`.

**Reachable, by reading, with zero added clicks** over today's run. The
mount at `:853` sits OUTSIDE the `model &&` that gates the grid (`:878`). So
trends stay visible while the grid is not, until a course switch clears
them. That is harmless, and it is stated so nobody reads it as a gate.

**Leverage re-judged against the as-built diff.** Scope section 14 claims no
categorical advantage; this is a reachability change, owner-confirmed (Q2).
As built, that stands. But its removal test (S-13, A-6's "exactly one")
fails only on DELETION. F-9 removes the reachability with the tag still in
place, and F-8 and F-16 destroy the whole view. All three are green. The
recorded shape is "a removal test that fails on removal, not only on
breakage" (`seats.md:468-474`), and it is not met. RES-W3V-1.

---

## 7. The addition caps, re-measured

The object is each file's net addition against the pinned base. The
instruments:
- the base copy is `git show <B>:<f> > $S\base\<name>` in the Bash tool;
- the before-count is `wc -l` and `@(Get-Content <base copy>).Count`;
- the after-count is `wc -l <f>` and `@(Get-Content <f>).Count`.

The direction of failure: FAILS if the counters disagree, or if any addition
exceeds its cap in scope section 12.

`B = 0618b4c16b2d176f8ab80c4a356ab6d8e2c7eb28` (`$S\..\w3b-base.txt`).
`git merge-base --is-ancestor $B HEAD` succeeds. `e57b1c5^` is `e757702`.
`git diff --numstat 0618b4c e57b1c5` over the eight paths equals
`git show --stat e57b1c5`, so no intervening commit touched them. For the
three NEW paths, `git cat-file -e $B:<f>` fails, so their base is 0.

| File | Base (wc / Get-Content) | After (wc / Get-Content) | Added | Cap | Verdict |
|---|---|---|---|---|---|
| `index.tsx` | 913 / 913 | 930 / 930 | 17 | +20 | under |
| `useRepoGradesGradingActions.ts` | 770 / 770 | 796 / 796 | 26 | +30 | under |
| `useRepoGradesBulkGrade.ts` | 381 / 381 | 393 / 393 | 12 | +20 | under |
| `repoGradesFeedbackAndFiles.wiring.test.ts` | 441 / 441 | 444 / 444 | 3 | +3 | **AT cap** |
| `classTrendsDraft.not-postable.test.ts` | 237 / 237 | 242 / 242 | 5 | +8 | under |
| `classTrendsFolderEntry.ts` [NEW] | 0 | 105 / 105 | 105 | <= 120 | under |
| `classTrendsFolderEntry.test.ts` [NEW] | 0 | 237 / 237 | 237 | <= 340 | under |
| `repoGradesClassTrends.wiring.test.ts` [NEW] | 0 | 441 / 441 | 441 | <= 450 | under |

Both counters agree on every file. The cap is a net line delta, as section 12
defines it. `git diff --numstat` shows gross insertions, which differ where
lines were rewritten: the bulk hook is +17/-5 and the census file +5/-2.
The census file is +5 GROSS against a +3 cap, and +3 NET, so it passes only
under the net reading the scope specifies. Every file is under the
1000-line ceiling. The largest is `index.tsx` at 930.

---

## 8. RES-W3-8: discharged as a mechanism measurement, magnitude still open

The scope makes this seat the owner (`a16-wave3-scope.md:1077`). The object
is `computeClassTrends` over a two-repo Repo Grades cohort. The instrument
is a scratch test, `$S\res-w3-8.probe.test.ts`, run under
`$S\vitest.probe.config.mts`:
- the repo's `vitest.setup.ts` is loaded, so the network is blocked;
- `callLlm`, `../gemini` and `../code-runner` are mocked;
- it makes two `gradeEntries([entry], ...)` calls, one per repo, as
  `github-repos.ts:839` does;
- the results go through the REAL `buildRepoRunCohort` and
  `repoRunTrendsEntry`.

Command: `node node_modules/vitest/vitest.mjs run --config
$S/vitest.probe.config.mts --silent=false --reporter=verbose`, 9/9
passed. Canaries: `callLlm` was called exactly twice per case, and the
parseable rubric parses to 2 criteria.

`extractRubricCriteria` returns **0** for the prose fixture, **0** for the
no-points fixture, and **0** for the "(18-20 pts)" range fixture. It returns
2 for "(10 pts)".

| Rubric | Model wording | Areas | Each area: resultsWithArea / totalResults (scored) |
|---|---|---|---|
| prose, no-points, range (identical output for all three) | drifts ("Code Quality"/"Testing" vs "Quality of code"/"Tests") | **4** | 1/2 (1) for every area |
| same three | echoes the same names | 2 | 2/2 (2) |
| parseable | drifts | 2 | 2/2 (**1** scored each: the drifted repo's areas are folded into its comment and blank-filled) |
| parseable | echoes | 2 | 2/2 (2) |

**What this settles.** An unparseable rubric fragments trends EXACTLY when
the model varies its area names across repos, and never merges them falsely.
The coverage stays honest ("1 of 2").

**What it does not settle.** How often a real model varies them. That needs
a live key: RES-W3V-2, the owner's. The finding goes to the owner with these
numbers attached, as the scope asks.

---

## 9. Checked and CORRECT: do not re-litigate

- Every shipped statement matches the section 7.4 contract:
  - `runBulkGrade` returns `Promise<readonly GradeResult[] | null>`
    (`useRepoGradesBulkGrade.ts:157`, `:174`);
  - the refusal returns `null` (`:178`);
  - the collector is a `const` empty-array literal (`:189`);
  - the push is a direct statement after both early returns (`:306`);
  - `return runResults` comes after `await Promise.all` (`:389`);
  - the handler order is `:762-777`;
  - the course clear is at `:211`;
  - `trendsEntry` is at `:782`;
  - the mount and label are at `index.tsx:853-858`.
- The leaf's body matches section 7.2 step for step
  (`classTrendsFolderEntry.ts:82-88`). `buildRepoRunCohort` owns the null
  decision (`:68`).
- Imports: the leaf value-imports only `@/lib/grade/types` and
  `../grading-results/classTrendsEntry` (`:29-30`). Canary 3 has seven roots,
  and S-17/S-21 prove the seventh is load-bearing.
- WS-7's census is at 33 (the `it()` title and comment are updated).
- The label's count and the panel's `totalResults` both use `gradedResults`
  (`classTrendsFolderEntry.ts:102`, `class-trends.ts:272`).
- The empty-plan branch neither clears nor sets the cohort
  (`useRepoGradesGradingActions.ts:762-768`), and the only clear follows it
  (`:771`). So, by reading, a "Nothing to grade" click leaves the previous
  trends in place. Pinned by A-3(a) and A-3's then-block check, which F-13
  shows an alias can bypass.

---

## 10. Residual register

Each entry names an owner, an instrument and the step that measures it. **I
do not write `docs/backlog.yml`**: it is outside this seat's write set. Until
the orchestrator records these, they are deletions.

| ID | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| **RES-W3V-1** | 18 fresh survivors (section 4), including four that reproduce the "panel never shows" class and three that remove or crash the surface with the tag present. The leverage removal test does not fail on removal (section 6) | Orchestrator routes it; a test seat (`loop-test-author`) designs the closure; an implementer builds it | `node $S\mut.mjs F-1,F-2,F-3,F-4,F-5,F-5b,F-6,F-7,F-8,F-9,F-10b,F-11b,F-12,F-13,F-14,F-15,F-16` against the revised WS-2/WS-3. Every id must go red, and S-1 to S-29 must stay red. `tsc` on any the revised pins claim as type kills | A dedicated fix row filed before A16 closes, or the next wave that writes WS-3, whichever is first |
| **RES-W3V-2** | RES-W3-8's MAGNITUDE: how often a real model varies area names under an unparseable rubric (mechanism measured, section 8) | Repo owner | A real Repo Grades run on one folder with a prose rubric, reading the panel's area list and each "N of M" | Owner verification after the W3B push, alongside RES-W3-1 |
| **RES-W3V-3** | The label's count and the status line's "graded" count disagree when a model call fails (section 5.2, by reading) | Repo owner (a wording decision), then the UX seat | A unit test driving `bulkGradeSummaryLine` and `repoRunTrendsLabel` over one outcome set with a `grading-failed` result, asserting whatever the owner rules | The owner's next batched question |
| **RES-W3V-4** | The S-26 canary tests a re-implemented predicate, not `collectorDecl()`; the L-6(b) "c6-shaped" cell is not c6 (section 2) | The test seat, in RES-W3V-1's fix | The revised canary must call the shipped detector, and the L-6(b) singular cell must carry one ungraded result: F-11b goes red | Same step as RES-W3V-1 |

Still open, and not discharged by this verification: RES-W3-1 (all five
rendered behaviours), RES-W3-2, RES-W3-3, RES-W3-5, RES-W3-9, RES-W3-10 and
RES-W3-11, as registered in scope section 16. RES-W3-8's mechanism half is
discharged here (section 8); its magnitude half is RES-W3V-2.

---

## 11. Findings requiring a decision, ranked

1. **RES-W3V-1: the removal test and the "panel never shows" class.** F-9 (a
   hidden wrapper), F-8 (a blank view), F-16 (a crash on first load), and
   F-1/F-2/F-4/F-5/F-5b/F-7/F-12 (an empty cohort). Each is green on every
   gate. This is the fifth silent-green on this row, and the pattern is
   stated in section 4.2.
2. **F-13: ruling W3-4 is enforced only against the literal identifier.**
   An alias restores revision 0's behaviour.
3. **F-15: the label's folder can be rebound** inside the handler, which is
   the live-value class section 9 exists to prevent.
4. **RES-W3V-3: two "graded" counts** on one screen.
5. **F-3 and F-11b: the label's count** can be doubled or can include
   ungraded rows, and nothing pins it.

---

## 12. What I could not determine

- Everything in section 0.
- The exact text of the dispatch's "counting rules" and "Tightening" items.
  Section 4.1 judges against the scope and the checker's replica instead.
- I did not execute the destructure form (`cohortState[1](null)`) or the
  property-access form of F-13. I claim only the alias form.
- I did not execute a `<template>` or `<details>` wrapper. F-9's
  `hidden` form is the executed representative.
- Whether any F-mutant would trip `npm run build`. I did not run it. None
  touches a `"use server"` file or a module boundary.
- Whether `gradeRepoAction` ever returns more than one result per call. This
  is scope section 18's open item, unchanged.

---

## 13. Tree state at hand-off

- Every mutation was restored from a `Copy-Item` backup in `$S` and
  byte-checked (section 1). No `git checkout --` was used.
- The four production files' SHA-256 values after the last restore equal
  their values before the first mutation.
- All scratch files live in `$S`, outside the repo.
- `docs/css-orphans.md` was left alone.
- At one point `git status --short` also showed ` M docs/l14-scope.md`. I did
  not write that file; another agent's L14 work was in flight (HEAD moved to
  `7bda6ca`/`0b96cab` during this pass). The final `git status --short`
  follows in the report.
