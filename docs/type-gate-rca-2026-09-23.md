# RCA: five type-gate defects that a green suite could not see

**Date:** 2026-09-23. **Seat:** `loop-seat` (Sonnet), authored for a
`loop-checker` read before the orchestrator acts on it.
**Scope of edits:** this file only. `git status --short` at hand-off is in
section 11.

**Prior version:** none. `ls docs/type-gate*` returned
`No such file or directory` before this file was written, so there is no
disposition table to produce - nothing was restructured, kept, handed over or
withdrawn.

**Standing correction to the brief, stated up front because the rest of this
document depends on it.** The brief says all five were "a defect that
`npx tsc --noEmit` caught and the test suite could not". Measured, that is true
of three of them and false of two. Defect 4 (the `status`/`body` fixture) is a
defect `tsc` *structurally cannot catch* - the file's own comment says so, and I
reproduced it - and it was not found during the A34 build at all; it was found
and fixed on 2026-09-01. Defect 3 (the `as GradeResult` cast) is not a `tsc`
error at the cast site either, measured. The corrected tally changes the
recommendation, so it is not a footnote.

---

## 1. The mechanism, in one sentence

> **Vitest never typechecks: `vite@8.1.0` hands every `.ts` file to rolldown's
> Oxc transform, which ERASES type annotations without reading them, so the
> entire type system is invisible to `npm test` - and the three shapes that
> defeated `tsc` as well all did it the same way, by a fixture reaching a typed
> slot through a value whose type the test author had personally disabled the
> check on (an `as` cast, or an un-annotated helper's inferred return type).**

The sentence a future implementer should remember is the short half:

> **`npm test` green means the code RAN. It says nothing about whether any type
> in it is correct - not one annotation is read.**

---

## 2. Why vitest does not see these: what the runner does with types

### 2.1 The transform, established from the installed tree

| Fact | Command that produced it | Value |
|---|---|---|
| Vitest version | `node -e "console.log(require('./node_modules/vitest/package.json').version)"` | `4.1.9` |
| Vite version actually used | `node -e "const p=require.resolve('vite/package.json',{paths:['./node_modules/vitest']});console.log(p, require(p).version)"` | `node_modules/vitest/node_modules/vite/package.json`, `8.1.0` |
| Vite's bundler/transform dependency | `node -e "console.log(JSON.stringify(require('./node_modules/vitest/node_modules/vite/package.json').dependencies))"` | `{"lightningcss","picomatch","postcss","rolldown":"~1.1.2","tinyglobby"}` - **no esbuild** |
| Rolldown's own resolved version and deps | `node -e "const p=require.resolve('rolldown/package.json',{paths:['./node_modules/vitest/node_modules/vite']});console.log(require(p).version, JSON.stringify(require(p).dependencies))"` | `1.1.3`, `{"@oxc-project/types":"=0.137.0","@rolldown/pluginutils":"^1.0.0"}` |
| Config governing collection | `Read vitest.config.ts` | `include: ["src/**/*.test.ts"]`, `environment: "node"`, no `typecheck` block |

There is no `test.typecheck` key in `vitest.config.ts` (read in full, 41 lines),
so vitest's own optional `--typecheck` mode is off and no `tsc` ever runs under
`npm test`.

**A correction the tree owes itself:**
`src/app/components/grading-recording/classTrendsRunCohort.test.ts:132` calls
this "vitest's type-stripping esbuild transform". The transform is Oxc via
rolldown, not esbuild, on the installed version. The *conclusion* in that
comment is right and the *mechanism named* is wrong. Read-only seat; I did not
edit it. Filed as **RES-3** below.

### 2.2 The canary: vitest runs green on three real type errors

I did not infer this. I built the file and ran the repo's own vitest binary
against it in the session scratchpad (never in the repo).

Probe file `src/matrix.ts` (full text in Appendix A) mirrors all five defect
shapes. A companion `src/canary.test.ts` carried three of them inside a real
`it()` block. Command and result:

```
node C:/Users/alexa/OneDrive/Documents/Projects/teaching-assistant/node_modules/vitest/vitest.mjs run --root .
  ->  Test Files  1 passed (1)
      Tests  1 passed (1)
      VITEST_EXIT=0
```

The same file, same directory, under the compiler:

```
node .../node_modules/typescript/bin/tsc --noEmit --incremental false
  ->  TSC_EXIT=2, with TS2554 on the arity defect
```

`tsc --version` -> `Version 5.9.3`.

**So the rule is not "tests are weak here". The rule is that the two gates read
different artifacts: vitest reads the erased JavaScript, `tsc` reads the
TypeScript. A defect that lives only in the annotations is invisible to one of
them by construction, and there is no configuration in this repo that makes
vitest see it.**

---

## 3. What `tsc` itself can and cannot see: the measured matrix

This is the load-bearing measurement of the whole RCA. One file, all five
shapes, one compiler invocation. Full probe source in Appendix A; raw compiler
output in Appendix B.

| # | Shape, named after the defect it mirrors | Probe line | `tsc 5.9.3` verdict |
|---|---|---|---|
| S1 | A16: `"ungraded" in result` then `result.ungraded.kind`, where the graded branch declares `ungraded?: undefined` | `12` | **TS18048** `'result.ungraded' is possibly 'undefined'` |
| S2a | A28: `identity: null` in a literal annotated `Partial<Rubric>` | `18` | **TS2322** `Type 'null' is not assignable to type 'string \| undefined'` |
| S2b | A28 variant: the same literal un-annotated, then passed to a `Partial<Rubric>` parameter | `21` | **TS2345** (same root cause, reported at the call) |
| **S3** | **A31: `{ total: "10/10" } as Result` - a cast to a domain type, omitting the required `student`** | **`24`** | **NO DIAGNOSTIC. Silent.** |
| S3' | The same object ANNOTATED `: Result` instead of cast | `25` | **TS2322** ... `Property 'student' is missing` |
| S3'' | The same object with `satisfies Result` | `26` | **TS1360** ... `Property 'student' is missing` |
| **S4** | **A34: an un-annotated helper returning `{ok, text, status, body}`, whose value is then passed to an `LlmResult`-typed slot** | **`30`, consumed at `36`** | **NO DIAGNOSTIC at either line. Silent.** |
| S4' | The same helper with an explicit `: Res` return type | `33` | **TS2353** `Object literal may only specify known properties, and 'status' does not exist` |
| S4'' | The same object literal passed DIRECTLY (fresh) to the typed parameter | `38` | **TS2353** |
| S5 | A36: calling a two-parameter function with one argument | `42` | **TS2554** `Expected 2 arguments, but got 1` |

**Read the table as one finding.** S3 and S4 are not places where TypeScript is
weak. They are places where **the test author's own construction switched the
check off**, and the SAME value one line away, written without the cast or with
the annotation, is a hard compile error. That is the difference between a
defect you must hunt for and a defect that cannot be written down.

The three real types behind S1/S3/S4 were opened to confirm the mirror is
faithful:

- `src/lib/grade/types.ts:212-213` - `interface GradeResultBase { student: string; ... }`, required.
- `src/lib/grade/types.ts:277-280` - `GradedResult extends GradeResultBase { readonly userId?: number; readonly ungraded?: undefined }` - the optional-`undefined` key that makes `in` fail to narrow (S1).
- `src/lib/grade/types.ts:294` - `export type GradeResult = GradedResult | UngradedResult`.
- `src/lib/llm.ts:200-202` - `LlmResult`'s success branch is `{ ok: true; text: string; sources?; finishReason?; usage?; elapsedMs? }`; `status`/`body` exist ONLY on the `ok: false` branch (S4).
- `src/app/components/repo-grades/useRepoGradesRubricSource.ts:90-95` - `ResolvedRubric { text: string; source: ...; identity: string; failureReason: string | null }`; `identity` is `string`, so `null` is type-illegal (S2).

---

## 4. Classification of all five

I read each diff with `git show <hash>`. Where the defect was fixed BEFORE the
commit landed (the wave gate is where it was caught), the diff shows the repair
and not the defect; I say so rather than inventing the defect's text.

| # | Item / commit | The defect | Shape class | Was `tsc` able to see it? | Evidence |
|---|---|---|---|---|---|
| 1 | A16 wave 2, `cbe84e2` | A result read through `"ungraded" in result` without the sanctioned `isUngraded` predicate | **NARROWING**, not a fixture | **Yes - TS18048** (S1, reproduced) | The repair is in the tree with the error code named: `classTrendsRunCohort.test.ts:127-136` and `:156-159`, both citing TS18048 |
| 2 | A28, `f6f0515` | Builder fixture used `identity: null` where `ResolvedRubric.identity` is `string` | **TYPE-ILLEGAL FIXTURE** | **Yes - TS2322/TS2345** (S2, reproduced) | Commit message; repaired line `M7_RUBRIC_OVERRIDES: Partial<ResolvedRubric> = { text: "", source: "generate", identity: "" }` (`git show f6f0515 \| grep "^[+-].*identity"`, one hit). The repair ADDED the annotation, which is what makes the type-illegality visible |
| 3 | A31, `72058f9` | Insight fixture built through a cast, omitting the required `student` | **TYPE-ILLEGAL FIXTURE, CAST-SUPPRESSED** | **NO, not at the cast site** (S3, reproduced silent). Whatever `tsc` reported was a downstream consequence; I could not recover the diagnostic and do not guess it | Commit message: "built through a cast and omitted the student field ... it is now typed and the cast is gone". Repair: `function makeNotAttemptedResult(student: string): GradeResult {` - an ANNOTATED factory (`git show 72058f9 -- src/lib/grade/class-trends-insight.test.ts`) |
| 4 | attributed to A34, `9eade3e` | Every success fixture carried `status`/`body`, which `LlmResult`'s success branch cannot have | **TYPE-ILLEGAL FIXTURE, INFERENCE-SUPPRESSED** | **NO - structurally invisible** (S4, reproduced silent, both at the helper and at the consumer) | See 4.1: the attribution is wrong |
| 5 | A36, `6aa8e29` | A caller still used the pre-change arity after `gradingResultsEditsKey`/`loadGradingResultsEdits`/`persistGradingResultsEdits` each gained a required parameter | **STALE SIGNATURE** | **Yes - TS2554** (S5, reproduced) | `git show 6aa8e29 -- src/app/components/grading-results/gradingResultsHelpers.ts`: three signatures gained a parameter. Every caller in the tree is now updated (`grep -rn "gradingResultsEditsKey\|loadGradingResultsEdits\|persistGradingResultsEdits" src/`, 40 lines, all three-argument) |

So: **three of five are fixture defects; two of those three are the ones `tsc`
cannot see; and the two `tsc` CAN see are the two that were written as plain
annotated values.** The brief's estimate of "at least three are fixture
defects" is confirmed at exactly three (#2, #3, #4).

### 4.1 Defect 4's commit attribution does not survive checking

The brief and the commit body of `9eade3e` both say the `status`/`body` fixture
was "found while there, and fixed" during A34. It was not. Measured:

```
git show --stat 9eade3e -- src/app/actions/grading-submission-grade.test.ts
  ->  1 file changed, 13 insertions(+), 2 deletions(-)
```

and the full diff of that file in `9eade3e` contains exactly one added import and
one changed assertion block. The `FIXTURE FIX` comment and the corrected
`gradeResponse` helper are not in it. They were already there:

```
git log --oneline -S 'FIXTURE FIX' --all -- src/app/actions/grading-submission-grade.test.ts
  ->  85ecc72 feat: grade a class from a screen recording
git log --format='%h author=%ad committer=%cd %s' --date=iso -1 85ecc72
  ->  85ecc72 author=2026-09-01 12:46:05 committer=2026-09-01 12:46:05
git show --stat 85ecc72 | grep grading-submission-grade
  ->  src/app/actions/grading-submission-grade.test.ts | 358 ++++++
```

`85ecc72` CREATED the file, on 2026-09-01, with the repair already applied.
`git show 85ecc72:src/app/actions/grading-submission-grade.test.ts | sed -n '28,60p'`
is byte-identical to the current file's lines 30-57.

Two consequences, and both matter more than the bookkeeping:

1. **Defect 4 is not part of the 2026-09-22/23 cluster.** The pattern the brief
   set out to explain is four items over two days; defect 4 is a three-week-old
   finding that a commit body re-narrated in the present tense. The cluster is
   really A16-2, A28, A31, A36 - and of those, three were `tsc`-visible.
2. **The repair is incomplete and the defect is still representable in that
   file today.** `src/app/actions/grading-submission-grade.test.ts:48` is still
   `function gradeResponse(overallComment: string, improvements: string, score: string) {`
   with **no return type annotation**. The bad fields were deleted; the thing
   that permitted them was not. Per the S4 row of the matrix, re-adding
   `status: 200` to that helper's returned literal would be accepted by `tsc`
   today, exactly as before. The comment at `:43-45` says this in so many
   words and then does not act on it. Filed as **RES-1**.

A third, smaller note: that comment's citations have drifted. It cites
"src/lib/llm.ts:165" for `LlmResult` and ":439-442" for `callGemini`'s success
return; `LlmResult` is at `src/lib/llm.ts:200-202` and line 165 is inside an
unrelated `LlmUsage` doc comment (`sed -n '155,180p' src/lib/llm.ts`). The claim
is correct, the addresses are stale. Filed under **RES-3**.

---

## 5. Is this the same class as the `fixtures-must-match-emitted-shape` memory?

**It is a distinct SUB-class, sharing the symptom and not the mechanism, and it
is the sub-class that has a free instrument.** They must not be merged.

The memory (read in full; `originSessionId fce26417`, modified 2026-08-21) is
about `course-canvas-url-match.test.ts` and friends using
`https://school.instructure.com/courses/1` where `CoursePicker` only ever emits
`/courses/<id>`. Both values are `string`. **No type system anywhere can see
that difference.** The memory's own instrument is correspondingly expensive and
human: "trace back to the emitter and copy its actual output into at least one
fixture".

Defects 2, 3 and 4 share the sentence "a fixture describes a shape the code
never emits", but the reason it was never emitted is different: **the type
already forbade the value.** `identity: null` against `identity: string`; a
`GradeResult` with no `student`; an `LlmResult` success with `status`. Nobody
had to trace an emitter - the constraint was already written down in
`types.ts`, `llm.ts` and `useRepoGradesRubricSource.ts`. It went unenforced
because the fixture author reached the typed slot through a cast (#3) or
through an un-annotated helper (#4), or because nobody ran the gate that reads
annotations (#2).

Naming them apart, for whoever writes the next memory:

- **Class E (emitted-shape drift)** - the existing memory. Fixture value is
  type-legal but production-impossible. Instrument: read the producer. Cost:
  high, per-fixture, human.
- **Class T (type-illegal fixture)** - this cluster. Fixture value is forbidden
  by the type. Instrument: the compiler. Cost: zero, if the construction does
  not disable it.

Collapsing T into E would be the expensive mistake: it would prescribe emitter
tracing for a class that a return-type annotation makes unrepresentable.

---

## 6. Is the instruction the problem? Measured.

Every implementer brief in this loop forbids `npx tsc --noEmit`. The stated
reason is real and I confirmed its premises:

- `tsconfig.json:15` sets `"incremental": true`.
- `.gitignore:41` is `*.tsbuildinfo`.
- `tsconfig.tsbuildinfo` exists in the repo root right now, 887471 bytes,
  mtime 2026-09-23 01:39 (`ls -la tsconfig.tsbuildinfo`).
- `docs/loop/this-repo.md:131-137` states the single-caller rule from those
  facts.

So the ban is not superstition. The question is whether the ban has to cover
EVERY form of `tsc`. **It does not.** Measured in a minimal probe project in the
session scratchpad, carrying a byte-copy of this repo's `compilerOptions`
(`"incremental": true`, `strict`, `bundler` resolution, the `@/*` path). I did
not run `tsc` against the repo at any point.

| Form | Diagnostics reported | `tsconfig.tsbuildinfo` written? | Verdict |
|---|---|---|---|
| `tsc --noEmit` (the wave gate) | correct, TS2741 | **YES**, 20798 bytes | races - keep the single-caller rule |
| **`tsc --noEmit --incremental false`** | **correct, TS2741, exit 2** | **NO** (`ls: cannot access '*.tsbuildinfo'`) | **safe and complete** |
| `tsc --noEmit --tsBuildInfoFile <path outside the repo>` | correct, TS2741 | written only to the given path | safe, but the path can be got wrong |
| `tsc --noEmit src/bad.ts` (explicit file args) | **WRONG: TS2307 `Cannot find module '@/ok'`, and the REAL error TS2741 was never reported** | no | **actively harmful - do not use** |
| `tsc --noEmit src/ok.ts src/bad.ts` | identical wrong output | no | same |

**The explicit-file-args form is the trap, and the brief's question about it has
a firm answer: no.** Passing file names on the command line makes `tsc` ignore
`tsconfig.json` entirely. It loses `paths`, so `@/...` imports become TS2307
noise, and it loses the surrounding program, so the real diagnostic disappears.
It is not merely incomplete - it substitutes false errors for true ones. Nobody
should be told to run it.

Two further probes, because a safe form is only safe if it is safe against a
CONCURRENT wave gate:

- With a clean `tsconfig.tsbuildinfo` on disk describing an error-free tree, and
  the error then reintroduced, `tsc --noEmit --incremental false` still reported
  it. It does not consult the cache for a false green.
- With the file overwritten by the literal bytes `GARBAGE-NOT-JSON`,
  `tsc --noEmit --incremental false` still reported the error correctly, exit 2,
  **and the file still contained `GARBAGE-NOT-JSON` afterwards** - it neither
  read it nor wrote it. A control run of plain `tsc --noEmit` immediately after
  replaced those bytes with real build info, confirming the probe was
  discriminating and not just inert.

So the reasoning behind the ban holds for `npx tsc --noEmit` and does not extend
to `npx tsc --noEmit --incremental false`, which reads and writes nothing shared
and produces the identical diagnostic set.

**What it would still not have caught: defects 3 and 4.** An implementer running
the safe form on the A31 or A34 work would have seen exit 0 and reported green
in perfect good faith. Section 7 is where that is addressed.

---

## 7. The cheapest instrument that would have failed, per defect

Preferring constructions that make the defect unrepresentable over checks that
look for it, as the brief asks.

| # | Defect | Cheapest instrument that FAILS | Why this one |
|---|---|---|---|
| 1 | A16 narrowing | `npx tsc --noEmit --incremental false` at the implementer's desk | TS18048 fires unconditionally. The construction already exists and is already the repo's rule - `types.ts:198-200`, `isUngraded` is "the one place any consumer asks the question". The implementer simply could not run the gate that says so |
| 2 | A28 `identity: null` | The same command | TS2322 fires on the annotated form. The eventual repair (`Partial<ResolvedRubric>`) is the construction; note it was the annotation, not the value, that was missing |
| 3 | A31 cast omitting `student` | **Delete the cast.** `{...} as GradeResult` -> `const x: GradeResult = {...}` or a factory `function make(...): GradeResult`. `tsc` then reports TS2741 with no new tooling at all | Measured: probe line 24 silent, line 25 TS2322, line 26 TS1360. Identical value, three spellings, two of which are compile errors. This is the definition of a construction over a check. It is also what the A31 fix actually did |
| 4 | A34 `status`/`body` | **Annotate the fixture helper's return type.** `function gradeResponse(...): LlmResult` | Measured: probe line 30 silent, line 33 TS2353. One annotation on one helper converts every one of that file's ~16 fixture uses from unchecked to checked. Nothing else in this repo can see it: no lint rule reads types here, and no test renders or type-inspects |
| 5 | A36 stale arity | The same `tsc` command. Second-cheapest and already partly present: a source-text pin. `ungradedDisclosure.test.ts:539-543` pins the literal call shape `correctUngradedSeeds(run, loadGradingResultsEdits(canvasUrl, run, editsSurface))` and goes red on a signature change at THAT site | Source-text pins cover only the sites someone thought to pin; `tsc` covers all of them. The pin is a useful second instrument, not a substitute |

Note what is absent from this table: **a new test.** None of the five would have
been caught by writing another `it()`. Four of them are invisible to a running
program, and the fifth (#5) ran fine with `surface === undefined` because load
and persist agreed on the wrong key inside the test's own round trip.

---

## 8. The single recommendation

> **Amend the implementer brief: replace "DO NOT RUN `npx tsc --noEmit`" with
> "run `npx tsc --noEmit --incremental false` before reporting; never
> `npx tsc --noEmit`, and never `tsc` with file arguments."**

One sentence in the brief template. No code, no migration, no new dependency,
no lint-baseline change.

**Pass condition, in the three-part form.**

- *Object under comparison:* the set of type diagnostics an implementer sees at
  its own desk, against the set the orchestrator's wave gate sees minutes later.
- *Instrument producing each quantity:* `npx tsc --noEmit --incremental false`
  run by the implementer (its stdout and exit code), and `npx tsc --noEmit` run
  by the orchestrator as the wave gate (unchanged, still exactly one caller).
- *Direction of failure:* the change has FAILED if the wave gate ever reports a
  diagnostic the implementer's run did not, or if `git status --short` in the
  repo root shows a `tsbuildinfo` or any other new untracked artifact after an
  implementer wave. Either observation means the implementer ran the wrong form
  or the flag does not behave on this repo as it behaved in the probe, and the
  amendment is withdrawn.

**Why this one and not the other three candidates.**

- *A `satisfies`/annotation convention for fixtures.* It is the right
  construction - section 7 recommends it per-defect - but as the single change
  it is a convention with no enforcer, and this repo has already proved what
  that is worth: `src/lib/grade/types.ts:283-288` ALREADY rules that "no
  construction anywhere in this tree may produce an object carrying both
  `userId` and `ungraded` - not by cast ... The sanctioned repairs are a branch
  or a conditional spread, never a cast back to `GradeResult`." No test enforces
  it (`grep -rln "as GradeResult\|TSAsExpression\|no-cast" --include="*.structure.test.ts" src`
  returns nothing, against a canary confirming 22 structure-test files exist by
  `find src -name "*.structure.test.ts" | wc -l`), and `as GradeResult` appears
  13 times across 7 files today, 3 of them non-test source
  (`grep -ro "as GradeResult" src | wc -l`; per-file `grep -rc`:
  `classTrendsRunCohort.test.ts` 5, `classTrendsFolderEntry.test.ts` 2,
  `github-grading-run-store.test.ts` 2, `classTrendsEntry.test.ts` 1,
  `github-grading-run-store.ts` 1, `grading-drafts.ts` 1,
  `grading-review-rows.ts` 1). A written rule with no instrument is what this
  cluster is made of; adding another is not the fix.
- *A lint rule banning `as <DomainType>` in test files.* Real coverage of
  defect 3, but the blast radius is 308 of 1107 test files
  (`grep -rElE " as [A-Z][A-Za-z0-9_]*" --include="*.test.ts" src | wc -l` and
  `find src -name "*.test.ts" | wc -l`; 736 occurrences by
  `grep -rEo | wc -l`, against a canary pattern returning 0). `npm run lint` is
  the 104.9s gate with a pinned 4-warning baseline
  (`docs/loop/this-repo.md:22,78-83`), and `eslint.config.mjs` is 20 lines with
  no custom rules and no type-aware setup - this is a multi-wave project, not a
  change. It also catches nothing in defect 4, which has no cast.
- *A shared typed fixture factory per domain type.* Strongest construction,
  largest cost, and it protects only the domain types someone has written a
  factory for. It is the right SECOND change; it is not the cheapest first one.

The amendment wins on a simple count: of the four defects that actually belong
to the 2026-09-22/23 cluster (#1, #2, #3, #5), **three would have gone red on
the implementer's own screen**, before the hand-off, at a cost of one sentence.

**What it would NOT catch - stated plainly, because this is the half that gets
dropped.**

1. **Defect 3 and defect 4 both survive it.** Measured silent, probe lines 24
   and 30/36. An implementer running the recommended command on either would
   have seen exit 0. The amendment reduces round trips; it does not touch the
   cast/inference class at all.
2. **Class E from section 5 is untouched** - a type-legal, production-impossible
   fixture value is invisible to every compiler.
3. **It does not make the implementer's report trustworthy.** It makes one more
   gate available to them. The orchestrator's wave gate stays exactly where it
   is, and `git status --short` remains the proof of a wave, per
   `docs/DEV_LOOP.md` "Gate the wave on the tree".
4. **The wall-clock cost is not measured on this repo.** See RES-2.

---

## 9. Findings for the orchestrator, not part of the recommendation

Ranked. None of these is an action I took; this seat is read-only outside this
file.

1. **`9eade3e`'s commit body claims a fix that is not in its diff** (section
   4.1). The claim is true about the codebase and false about that commit. The
   backlog row `dce2035` records A34 as shipped at `9eade3e`; anyone auditing
   the fixture claim against that commit will find nothing and may conclude the
   fix never happened.
2. **The A34 fixture defect is still representable** in
   `src/app/actions/grading-submission-grade.test.ts:48`. One annotation closes
   it (RES-1).
3. **Three PRODUCTION files cast to `GradeResult`** -
   `src/lib/github-grading-run-store.ts`, `src/lib/grading-drafts.ts`,
   `src/lib/workflows/grading-review-rows.ts`, one occurrence each - against the
   explicit ruling at `src/lib/grade/types.ts:283-288`. I did not open each cast
   to judge whether any produces the forbidden `userId`+`ungraded` object, so
   this is a location list, not a defect claim (RES-4).

---

## 10. Residual register

Every entry names an owner, an instrument, and the step that will measure it.
An entry missing any of the three is a deletion and I would call it that.

| ID | Residual | Owner | Instrument | Step that will measure it |
|---|---|---|---|---|
| **RES-1** | `gradeResponse` at `src/app/actions/grading-submission-grade.test.ts:48` still has an inferred return type, so the S4 shape its own comment describes remains writable in that file | **A `loop-implementer`**, one-line change: annotate `: LlmResult` and import the type | after the annotation, temporarily re-add `status: 200` to the returned literal and run `npx tsc --noEmit --incremental false`; it must report TS2353 and must report nothing once removed | The next wave that writes any file under `src/app/actions/` |
| **RES-2** | The wall-clock cost of `npx tsc --noEmit --incremental false` on THIS repo is unmeasured. `docs/loop/this-repo.md:21` gives 10.2s for the incremental form, warm-or-cold unstated, and section 8's recommendation adds one full cold check per implementer, up to the 2-3 concurrent cap | **The orchestrator**, as the single sanctioned `tsc` caller | `Measure-Command { npx tsc --noEmit --incremental false }` in the repo root, against `Measure-Command { npx tsc --noEmit }`, both run when no agent is working | Before the brief amendment is issued to the first concurrent wave. If the cold form exceeds roughly 60s the amendment should switch to the per-agent `--tsBuildInfoFile` form, which section 6 proved equally safe |
| **RES-3** | `classTrendsRunCohort.test.ts:132` names esbuild as vitest's transform (it is rolldown/Oxc on `vite@8.1.0`), and `grading-submission-grade.test.ts:34-40` cites `src/lib/llm.ts:165` and `:439-442` for a type that is at `:200-202` | **A `loop-implementer`**, comment-only edit | re-resolve each cited address with `sed -n` and confirm the symbol named is at the line given | The next wave that writes either file |
| **RES-4** | Three production casts to `GradeResult` exist against the standing ruling at `types.ts:283-288`; whether any constructs the forbidden `userId`+`ungraded` object is unexamined | **A `loop-checker` or `loop-architect`**, as a scoped read | open each of the 3 sites and check whether the cast's source object can carry `userId` while `ungraded` is set | The next chunk that touches grading result construction |
| **RES-5** | The exact `tsc` diagnostic that fired on the A31 build is unrecoverable. It lived in the orchestrator's session, not the tree; the cast site itself is silent (probe line 24), so the classification in row 3 of section 4 rests on the commit message plus the reproduced shape | **The orchestrator**, who holds the session record | the wave-gate transcript for `72058f9` | Only if the A31 classification is ever disputed; otherwise accept the row as stated and unproven at the diagnostic level |

**What this environment cannot settle at all**, per
`docs/loop/this-repo.md` section 6, and which nothing above should be read as
having settled: no component is rendered by any test here, so none of these
defects' USER-VISIBLE consequences were verified; there is no live database and
no API key, so no claim about what the model or Supabase actually returned is
made anywhere in this document.

---

## 11. Verification of this artifact

Working tree at hand-off:

```
git status --short
 M docs/css-orphans.md
```

`docs/css-orphans.md` was modified before this session began (it is listed as
modified in the session's opening git snapshot) and was not touched by any
command in this RCA. No file in the repo other than
`docs/type-gate-rca-2026-09-23.md` was created or edited. All probe files live
in the session scratchpad at
`.../e8e96e62-aa3d-4508-b28a-354d4d297572/scratchpad/p2` and `/vprobe`, never in
the repo, and none is in the repo root.

**Test evidence.** The five test files named in this RCA were run together
through the multi-path wrapper - never a raw multi-path `vitest` or `npm test`,
which silently drops unmatched arguments
(`docs/loop/this-repo.md:29-41`). Exit code read from a file, not a pipe.

```
npm run test:paths src/app/components/grading-recording/classTrendsRunCohort.test.ts \
  src/app/components/repo-grades/repoGradesBulkGrade.test.ts \
  src/lib/grade/class-trends-insight.test.ts \
  src/app/actions/grading-submission-grade.test.ts \
  src/app/components/grading-results/gradingResultsHelpersEditState.test.ts

 Test Files  5 passed (5)
      Tests  106 passed (106)
COVERED src/app/components/grading-recording/classTrendsRunCohort.test.ts files=1 passed=23
COVERED src/app/components/repo-grades/repoGradesBulkGrade.test.ts files=1 passed=23
COVERED src/lib/grade/class-trends-insight.test.ts files=1 passed=16
COVERED src/app/actions/grading-submission-grade.test.ts files=1 passed=16
COVERED src/app/components/grading-results/gradingResultsHelpersEditState.test.ts files=1 passed=28
```

Exit code, written to a file by the runner and read back:
`$LASTEXITCODE | Out-File <scratchpad>/tp.exit` -> `0`.

All five are green today, which is the point of the whole document: they were
green on the day each defect was live, too.

**`tsc` was never run against this repository by this seat.** Every compiler
measurement in sections 3 and 6 comes from the scratchpad probes. The repo's
`tsconfig.tsbuildinfo` was read with `ls -la` and not otherwise touched; its
mtime at the time of reading was 2026-09-23 01:39, which predates every command
in this session.

---

## Appendix A - the probe file, verbatim

Saved as `<scratchpad>/vprobe/src/matrix.ts`. Compiled with the tsconfig in
Appendix C. Line numbers in section 3 refer to this file.

```ts
// Shapes mirrored from the five defects. No vitest import, so the only
// diagnostics reported are the ones under test.
export type Rubric = { text: string; source: string; identity: string };
export type Ungraded = { kind: string; message: string };
export type Graded = { student: string; total: string; ungraded?: undefined };
export type Result = Graded | (Omit<Graded, "ungraded"> & { ungraded: Ungraded });
export type Res = { ok: true; text: string } | { ok: false; status: number; body: string };

// ---- S1 (A16 shape): `in` does not narrow an optional-undefined key ----
export function s1(result: Result): string {
  if ("ungraded" in result) {
    return result.ungraded.kind; // expect TS18048
  }
  return "";
}

// ---- S2 (A28 shape): null where the type says string ----
export const s2_annotated: Partial<Rubric> = { text: "", source: "generate", identity: null }; // expect TS2322
const s2_inferred = { text: "", source: "generate", identity: null };
export function s2_consume(r: Partial<Rubric>): string { return r.identity ?? ""; }
export const s2_via_variable = s2_consume(s2_inferred); // expect TS2345 (null not assignable)

// ---- S3 (A31 shape): cast to a domain type, omitting a required field ----
export const s3_cast = { total: "10/10" } as Result;      // omits `student`
export const s3_annotated: Result = { total: "10/10" };   // expect TS2741
export const s3_satisfies = { total: "10/10" } satisfies Result; // expect error too

// ---- S4 (A34 shape): inferred return type, excess props reach a typed slot ----
function s4_fixture_inferred() {
  return { ok: true as const, text: "hi", status: 200, body: "" };
}
function s4_fixture_annotated(): Res {
  return { ok: true as const, text: "hi", status: 200, body: "" }; // expect TS2353/excess
}
export function s4_take(r: Res): string { return r.ok ? r.text : r.body; }
export const s4_a = s4_take(s4_fixture_inferred());
export const s4_b = s4_take(s4_fixture_annotated());
export const s4_direct = s4_take({ ok: true, text: "hi", status: 200, body: "" }); // expect excess-property error

// ---- S5 (A36 shape): stale arity ----
export function s5_key(url: string, surface: string): string { return `${url}::${surface}`; }
export const s5_stale = s5_key("u"); // expect TS2554
```

## Appendix B - the compiler's raw output on Appendix A

`node <repo>/node_modules/typescript/bin/tsc --noEmit --incremental false`, exit 2:

```
src/matrix.ts(12,12): error TS18048: 'result.ungraded' is possibly 'undefined'.
src/matrix.ts(18,78): error TS2322: Type 'null' is not assignable to type 'string | undefined'.
src/matrix.ts(21,43): error TS2345: Argument of type '{ text: string; source: string; identity: null; }' is not assignable to parameter of type 'Partial<Rubric>'.
  Types of property 'identity' are incompatible.
    Type 'null' is not assignable to type 'string | undefined'.
src/matrix.ts(25,14): error TS2322: Type '{ total: string; }' is not assignable to type 'Result'.
  Type '{ total: string; }' is not assignable to type 'Omit<Graded, "ungraded"> & { ungraded: Ungraded; }'.
    Property 'student' is missing in type '{ total: string; }' but required in type 'Omit<Graded, "ungraded">'.
src/matrix.ts(26,48): error TS1360: Type '{ total: string; }' does not satisfy the expected type 'Result'.
  Type '{ total: string; }' is not assignable to type 'Omit<Graded, "ungraded"> & { ungraded: Ungraded; }'.
    Property 'student' is missing in type '{ total: string; }' but required in type 'Omit<Graded, "ungraded">'.
src/matrix.ts(33,43): error TS2353: Object literal may only specify known properties, and 'status' does not exist in type '{ ok: true; text: string; }'.
src/matrix.ts(38,58): error TS2353: Object literal may only specify known properties, and 'status' does not exist in type '{ ok: true; text: string; }'.
src/matrix.ts(42,25): error TS2554: Expected 2 arguments, but got 1.
```

Lines 24, 30 and 36 produce nothing. Those are S3 and S4.

## Appendix C - the probe tsconfig

A byte-copy of this repo's `compilerOptions` (`tsconfig.json:2-23`) minus the
`next` plugin, with `"types": []` so the probe needs no `@types` packages, and
with `include` narrowed to the probe's own sources.

```json
{
  "compilerOptions": {
    "target": "ES2017", "lib": ["dom","dom.iterable","esnext"], "allowJs": true,
    "skipLibCheck": true, "strict": true, "noEmit": true, "esModuleInterop": true,
    "module": "esnext", "moduleResolution": "bundler", "resolveJsonModule": true,
    "isolatedModules": true, "jsx": "react-jsx", "incremental": true,
    "types": [],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src/**/*.ts"], "exclude": ["node_modules"]
}
```

The `strict: true` and `incremental: true` settings are the two that matter:
`strict` is what makes S1/S2/S3' fire at all, and `incremental` is the setting
the `--incremental false` probe in section 6 was testing against.
