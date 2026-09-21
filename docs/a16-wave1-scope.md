# A16 wave 1 scope: the panel-headroom extraction

**Seat:** architecture. **Consumes:** `docs/a16-plan.md` revision 4 (`2bfc3cc`)
sections 2, 3.3, 5.1-5.6, 7, 9.2, 12; `docs/a16-rulings.md` rounds 1-5 (which
overrides the plan); `docs/a8r-scope.md` section 7. **Produces:** the two paths
the plan deliberately left unfixed, the extraction decision, wave 1's gate rows,
its `owns` census, and its residuals.

**Tree state at authoring:** `git status --short` returns ` M docs/css-orphans.md`
only - the walker's own generated output, exempt under ruling 3. No source file
was edited by this pass. Every simulation below was written to the session
scratchpad, outside the repository.

---

## 0. VERDICT, stated before the working

**Thirty-two lines exist. Forty-nine come out, measured, not estimated, with the
comment count going UP by six.** The plan's three-step contingency is NOT
invoked. Wave 2 keeps its full 46-line budget and the margin stays at its
precedented 20.

| Quantity | Command | Value |
|---|---|---|
| Panel today | `wc -l src/app/components/grading-recording/GradingRecordingPanel.tsx` | **966** |
| Panel today | `@(Get-Content src\app\components\grading-recording\GradingRecordingPanel.tsx).Count` | **966** |
| Panel after the extraction | `wc -l <scratchpad>/panel-sim.tsx` | **917** |
| Panel after the extraction | `@(Get-Content <scratchpad>\panel-sim.tsx).Count` | **917** |
| Required | plan 5.4: `1000 - 46 - 20` | **<= 934** |
| Slack against the target | `934 - 917` | **17 lines** |
| Lines removed | `966 - 917` | **49** (required: at least 32) |

**What is extracted:** the panel's entire `Capture` fieldset - the course
`<TextField select>` with its loading / error / no-roster hints, and the D22b/D23e
assessment `<Autocomplete>` with its own hint - `GradingRecordingPanel.tsx:714-784`.

**Where it goes:** a NEW file,
`src/app/components/grading-recording/GradingCaptureSettings.tsx`, NOT the
existing `grading-recording-log.ts` leaf. Section 4 gives the reason and it is
not a preference.

**Who calls it:** `GradingRecordingPanel.tsx`, edited in the same wave, importing
`GradingCaptureSettings` and rendering `<GradingCaptureSettings ... />` in the
exact position the fieldset occupied. Gate row W1-G3 below.

---

## 1. The arithmetic, re-measured from the tree

Every number in the plan's 5.1-5.4 was re-run rather than carried. All agree.

```bash
wc -l src/app/components/grading-recording/GradingRecordingPanel.tsx   # 966
wc -l src/app/components/grading-recording/grading-recording-log.ts    # 496
```
```powershell
@(Get-Content src\app\components\grading-recording\GradingRecordingPanel.tsx).Count  # 966
@(Get-Content src\app\components\grading-recording\grading-recording-log.ts).Count   # 496
```

**The ceiling, read rather than recalled.** `src/file-size-ceiling.structure.test.ts`
declares `const LIMIT = 1000;` at **`:30`** and compares `if (lineCount > limit)`
at **`:129`** (both opened). Exactly 1000 passes. `ALLOWED_OVERAGE` is at `:64`
and contains no file in this wave.

**The comment floor, measured on the same instrument the gate uses.**

```bash
grep -c "^\s*\(//\|/\*\|\*\|{/\*\)" src/app/components/grading-recording/GradingRecordingPanel.tsx   # 298
```

298 of 966, 30.8 percent. This is the number 9.2's row pins as a floor.

**The prior extraction's 32, verified from the commit rather than from prose.**

```bash
git show 58a4254 --numstat -- src/app/components/grading-recording/GradingRecordingPanel.tsx
# 9  41  src/app/components/grading-recording/GradingRecordingPanel.tsx
```

41 removed, 9 added, net **-32**, 995 -> 963. The plan's claim that 32 is
demonstrated on this exact file is correct.

---

## 2. The candidate survey, and why A8-R section 7 is genuinely spent

`docs/a8r-scope.md:846-866` named two candidates. Both landed, and the check is
the current file, not the commit message:

| A8-R section 7 candidate | Disposition | Evidence in the tree today |
|---|---|---|
| Step 1 - `handleDownloadLog` plus the format/filename imports | **Landed** | `GradingRecordingPanel.tsx:622-625` is now four lines that call `buildGradingRecordingLogDownload(...)` and hand the Blob to `triggerFileDownload`. Nothing left to move without moving the side effect into a leaf whose own header (`grading-recording-log.ts:10-15`) forbids I/O |
| Step 2 - the four `setLogGradingRuns` blocks | **Landed** | `:545`, `:565-568`, `:587-590`, `:594-597` are now one-to-four-line calls to `blockedGradingRun` / `erroredGradingRun` / `completedGradingRun`, imported at `:137-139` |

So the plan's statement is right: **zero remaining named candidates.** I
re-derived from the 966-line file.

**The derivation.** The panel is hooks, `useCallback` handlers, and JSX. The
non-hook, non-JSX surface left after A8-R is `fmt` (`:168-172`, 5 lines), the
`Notice` interface (`:164-166`, 3 lines), two `STORAGE_KEY_*` consts, and the
`currentGradingLog` object literal (`:608-621`) whose nine fields A8-R already
priced as non-moving because the call site must still spell them. Summed, under
15 lines and not cohesive. **A 32-line pure-`.ts` extraction does not exist in
this file.** That is the finding that decides section 4.

What does exist is JSX. Ranked by size, measured with `sed -n 'A,Bp' <panel> | wc -l`:

| Region | Lines | Comment lines in it | Blocking facts |
|---|---|---|---|
| **`Capture` fieldset, `:714-784`** | **71** | **3** | none - see section 5 |
| `Context` fieldset, `:819-851` | 33 | 2 | `AddKnowledgePages.test.ts:275-288` asserts `<AddKnowledgePages` sits in **GradingRecordingPanel.tsx** after the `{knowledgeContext &&` block, by path. The sibling `DiscussionCaptureSettings.tsx:11-15` records leaving its own knowledge block behind for exactly this reason |
| status row + merged-readings line, `:885-937` | 53 | 3 | reads `previewRef` - `useDiscussionCapture`'s ref, assigned synchronously inside `start()` before `capturing` flips (`:890-895`). Passing a ref across a component boundary is the shape `this-repo.md:68-86` records going wrong; and wave 2's mount lands at `<GradingTable>` `:938`, immediately below |
| notices region, `:668-712` | 45 | 1 | 25 of the 45 are one JSX comment block; the markup itself is 20 lines. Net saving after a prop list is under 10 |
| run row, `:853-883` | 31 | 1 | carries two of the three primaries `buttonVariant.test.ts:157` pins; moving it forces a `FROZEN_PRIMARY_SITES` edit, and `GradingRecordingPanel.assessment.test.ts:85-88` matches the Start/Stop `<Button>` element in the panel by source text |

The `Capture` fieldset is the only region that is both large enough alone and
free of a test that pins it to this file by path.

---

## 3. Why this region, on reuse rather than on size

The panel's own comment at `:717-722` already names the precedent:

> the select used to UNMOUNT while courses were loading ... kept mounted and
> disabled instead, matching DiscussionCaptureSettings.tsx/ModuleDeckSettings.tsx's
> own shape

Both exist and both are the same extraction already performed on a sibling panel:

```bash
wc -l src/app/components/recording/DiscussionCaptureSettings.tsx   # 221
wc -l src/app/components/module-deck-capture/ModuleDeckSettings.tsx # 139
```

`DiscussionCaptureSettings.tsx:3-6` states its own reason verbatim: "the settings
block of the Discussion replies panel, extracted out of DiscussionRepliesPanel.tsx
once that file was pressing on recording-split.structure.test.ts's 1000-line
ceiling", and `:6-7` lists what moved - "the Capture section (course, save-video
checkbox, the course-loading/course-error hints)". **This wave performs the same
extraction, on the same block, in the sibling directory.** That is the vetted
reuse item, and there is a second one in this directory:
`GradingAssessmentDeclarationControls.tsx` (258 lines), whose existence the panel
explains at `:294-297` - "why this is a NEW component file rather than more
inline JSX here (this file's own 1000-line ceiling)".

**Do-not-reuse, with justification per entry:**

- **`DiscussionCaptureSettings.tsx` itself is NOT imported or generalised.** Its
  props carry `saveVideo`, `autoDownload`, `audience`, `redraftArmed`,
  `redraftConsequenceId`, `composition` - six fields that mean nothing on this
  surface - and it renders `<DiscussionReplyControls>` and
  `<DiscussionResourceSettings>`. Widening it to serve two panels would put a
  discussion-shaped component in the grading panel's render path and put this
  wave's write set across two feature directories. Copy the SHAPE, not the file.
- **`useGradingCourses`'s `GradingCourseOption` IS reused** as the new
  component's `courses` element type (`useGradingCourses.ts:23-29`, opened: `{ id,
  name, roster: string | null }`). Do not declare a second `{id, name}` structural
  type the way `DiscussionCaptureSettings.tsx:53` does - that file has no reach to
  `.roster` and this one does.

---

## 4. The destination: a new `.tsx`, not `grading-recording-log.ts`

The plan (2, 3.3) explicitly permits "add to the existing leaf" and calls it the
cheapest correct answer. **It is not available here, and the reason is mechanical
rather than stylistic.**

`grading-recording-log.ts` is a pure `.ts` module. Its own header, opened at
`:11-14`, states: "pure functions, no I/O, no clock reads ... so a test pins an
exact rendered CSV/JSON rather than asserting around 'now'".

```bash
grep -c "use client\|from \"react\"" src/app/components/grading-recording/grading-recording-log.ts   # 0
```

A `.ts` file cannot hold JSX, and section 2 establishes that **no 32-line pure
extraction exists** in the panel. So the two constraints compose to one answer:
the extraction must be JSX, JSX needs a `.tsx`, and no `.tsx` leaf exists in this
directory that this markup belongs to. `GradingAssessmentDeclarationControls.tsx`
owns the deadline/authoritative-tool declaration store and its test pins 8 facts
about that component's internals - putting a course select in it would be a
second responsibility in a file whose test asserts it derives everything from
`computeGradingDeclarationView`.

**Decision: a new file.** Estimated size, as arithmetic with named components,
NOT a measurement - nothing exists to measure yet:

| Part | Lines |
|---|---|
| `"use client";` + blank | 2 |
| header comment (modelled on `DiscussionCaptureSettings.tsx:3-27`, 25 lines) | 22-26 |
| imports (`@mui/material`, `page.module.css`, `RecordingControls.module.css`, `type { GradingCourseOption }`) + blanks | 6 |
| props interface, 10 fields with per-field doc comments | 18-22 |
| signature, destructure, `return (`, closers | 15 |
| the moved markup, `:715-783` verbatim at the same indentation | 69 |
| **Estimated total** | **132-140** |

Well under the 1000 ceiling with no ratchet entry needed.

---

## 5. THE COMMENT FLOOR - designed against, not around

The plan's honest warning (5.6) is that this file is 31 percent comment and the
likely extraction MOVES a commented block, dropping the panel's count. **It does
drop, and the design pays it back with interest in the same edit.**

Measured on the region:

```bash
sed -n '714,784p' src/app/components/grading-recording/GradingRecordingPanel.tsx \
  | grep -c "^\s*\(//\|/\*\|\*\|{/\*\)"      # 3
```

Three matching lines leave: `:714` (`{/* CC2: ...`), `:717` (`{/* Fixer pass
finding 2: ...`), `:754` (`{/* D22b/D23e: ...`). Note what the gate's regex does
and does not count: only the line that OPENS a comment matches. A 10-line JSX
comment contributes **1**, and its continuation and `*/}` lines contribute
**0**. A replacement written as one long `{/* ... */}` block therefore pays back
1 against the 3 removed and the floor breaks at 296.

**The shape that works, and it is the one the plan blessed ("add an equivalent
comment in the leaf and count both files"):**

1. The three explanatory comments MOVE WITH their markup into the leaf - a
   reason belongs beside the thing it explains, and `DiscussionCaptureSettings.tsx`
   carries its moved reasons the same way.
2. The panel gains a **9-line `//` comment block attached to the new import**,
   in the idiom this file already uses nine times (`:67-69`, `:70-71`, `:72-76`,
   `:86-91`, `:93-98`, `:100-105`, `:114-118`, `:124-130`). Every `//` line
   matches the gate's regex. It points at the leaf and names what moved.
3. The call site keeps a **one-line** `{/* CC2: settings grouped under named
   sections, run row last. */}`, which is the original `:714` verbatim and still
   true of the sections that remain.

Measured on the simulation:

```bash
grep -c "^\s*\(//\|/\*\|\*\|{/\*\)" <scratchpad>/panel-sim.tsx    # 304
```

**298 -> 304.** The floor holds with six lines to spare. **This wave deletes zero
comment lines from the panel.**

The 49-line saving decomposes, audited against the simulation:

| Change | Lines |
|---|---|
| `:714-784` removed | **-71** |
| import-attached `//` block + the `import` statement | +9 |
| `{/* CC2 ... */}` one-liner + `<GradingCaptureSettings>` with 10 props + `/>` | +13 |
| `:61` narrows to `import { Button } from "@mui/material";` | 0 (one line either way) |
| **Net** | **-49** |

---

## 6. The two published paths

Appended to `docs/a16-plan.md` section 3.3's ten, giving wave 1 a **12-path** set:

```
src/app/components/grading-recording/GradingCaptureSettings.tsx              [NEW - destination]
src/app/components/grading-recording/GradingCaptureSettings.wiring.test.ts   [NEW - its test]
```

**Collision check, run rather than asserted.** Compared by exact path against all
four published sets in the plan (3.3's ten, 3.4's six, 3.5's six, 3.6's six):

```bash
ls -1 src/app/components/grading-recording/GradingCaptureSettings.tsx \
      src/app/components/grading-recording/GradingCaptureSettings.wiring.test.ts
# ls: cannot access ...GradingCaptureSettings.tsx: No such file or directory
# ls: cannot access ...GradingCaptureSettings.wiring.test.ts: No such file or directory
ls -1 src/app/components/grading-recording/GradingRecordingPanel.tsx   # canary: this path DOES resolve
grep -rn "GradingCaptureSettings" src docs | wc -l                      # 0
```

Both names are unused anywhere in `src/` or `docs/`, and neither appears in wave
2's six (`classTrendsRunCohort.ts` / `.test.ts` and four existing paths), wave 3's
six (all under `repo-grades/` and `drafted-grades/`), or A18's six (all under
`src/lib/` and two other directories). **No collision.**

Naming: `*.wiring.test.ts`, not `*.test.tsx`. `vitest.config.ts` collects only
`src/**/*.test.ts`; a `.test.tsx` is never run at all, which is the silent-pass
shape this repo has already paid for.

---

## 7. What moves, what stays, and the caller

**Moves (the whole `:714-784` block, verbatim, re-indented):** the `<fieldset
className={controls.section}>` / `<legend>` pair, the course `<TextField select>`
with its `<MenuItem>` list, the `coursesLoading` spinner line, the `coursesError`
hint, the no-roster hint, the assessment `<Autocomplete freeSolo>` and its
`renderInput`, and the `assessmentId === ""` hint. Plus the three comments at
`:714`, `:717-722`, `:754-764`.

**The prop seam, ten fields, exact signature:**

```ts
export interface GradingCaptureSettingsProps {
  courseId: string;
  setCourseId: (next: string) => void;
  courses: GradingCourseOption[] | null;
  coursesLoading: boolean;
  coursesError: string | null;
  /** selectedCourse?.roster ?? null - the raw roster text, already resolved
   *  by the panel; only the hint gate reads it here. */
  selectedRosterText: string | null;
  assessmentOptions: string[];
  assessmentLabel: string;
  setAssessmentLabel: (next: string) => void;
  /** The TRIMMED label. The hint gates on this, never on assessmentLabel,
   *  so whitespace-only input still shows the hint. */
  assessmentId: string;
}
```

Every one of these ten is reachable from the panel today at the render position
the fieldset occupies: `courseId` `:246`, `setCourseId` `:250`, `courses` /
`coursesLoading` / `coursesError` `:244`, `selectedRosterText` `:262`,
`assessmentOptions` `:322`, `assessmentLabel` `:274`, `setAssessmentLabel`
`:278`, `assessmentId` `:292`. All opened.

**STAYS IN THE PANEL - NO HOOK MOVES.** `useState` for `courseId` and
`assessmentLabel`, both `useCallback` setters with their `localStorage` writes,
both `STORAGE_KEY_*` consts, `useGradingCourses(active)`, the `assessmentOptions`
`useMemo`, `selectedCourse`/`selectedRosterText`, and `const assessmentId =
assessmentLabel.trim();`. This satisfies 5.6's "Move pure assembly. Do not move a
hook." exactly: the component's hook count and shape are **unchanged**, which is
the variable `this-repo.md:68-86` records React Compiler's
`preserve-manual-memoization` reacting to. The recorded workaround (a ref plus its
effect kept in the panel) has nothing to apply to here, because no ref crosses the
seam.

`GradingRecordingPanel.tsx:61` narrows from
`import { Autocomplete, Button, MenuItem, TextField } from "@mui/material";` to
`import { Button } from "@mui/material";`. Verified: `grep -n
"TextField\|MenuItem\|Autocomplete\|<Button" <panel>` puts every `TextField`
(`:724`, `:774`), every `MenuItem` (`:733`, `:735`, `:737`), and the only
`Autocomplete` (`:766`) inside `:714-784`; the three `<Button`s (`:803`, `:861`,
`:869`) are all outside it.

**THE CALLER.** The panel renders `<GradingCaptureSettings ... />` at the exact
line the fieldset occupied - immediately above the existing
`<GradingAssessmentDeclarationControls>` at `:786`. Wave 1 does not ship a leaf
and a panel with no surface between them. W1-G3 is the row that proves it.

---

## 8. The test file the destination needs

`src/app/components/grading-recording/GradingCaptureSettings.wiring.test.ts`.
Shape only - full assertions are the test seat's job.

Model it on `src/app/components/recording/DiscussionCaptureSettings.wiring.test.ts`
(54 lines, opened): read the file, strip comments with a LOCAL copy of
`stripComments` (never import one from another `*.test.ts` - that re-runs its
`describe` blocks), anchor each assertion on the control's own visible label text,
and pin the FACT and the ORDERING, never the spelling.

What it must assert:

1. **Canary first.** `expect(source.length).toBeGreaterThan(1000)` - a renamed or
   moved file must not make the suite vacuously pass. This is the shape
   `GradingAssessmentDeclarationControls.test.ts:316-319` already uses.
2. **The course select stays MOUNTED and disabled while loading**, never swapped
   out behind a ternary - the Fixer-pass-2 fact at the old `:717-722`, which no
   test currently guards anywhere. Anchor on `label="Course (for roster matching)"`,
   assert `disabled={coursesLoading}` in the element and assert the element is not
   inside a `coursesLoading ?` ternary.
3. **The `<Autocomplete>` is `freeSolo`, options `assessmentOptions`, value
   `assessmentLabel`, `onInputChange` reaching `setAssessmentLabel`** - this is the
   assertion MOVED out of `GradingRecordingPanel.assessment.test.ts:70-72`, not a
   new one. Carry its title and its reason.
4. **The no-assessment hint gates on `assessmentId === ""`, never on
   `assessmentLabel`** - MOVED out of `GradingRecordingPanel.assessment.test.ts:74-76`.
   Include its negative: a gate on the raw label would stop showing the hint for
   whitespace-only input.
5. **The no-roster hint gates on `courseId && !selectedRosterText`** - the
   combination, not `courseId` alone.
6. **No primary-button spelling in this file.** `expect(stripped).not.toMatch(
   /variant="contained"|variantFor\(|idleVariant="contained"/)`. This is the
   assertion that keeps `buttonVariant.test.ts`'s `toEqual` from silently gaining
   an entry when someone later adds a filled Button to a settings block.
7. **No hook is declared here.** `expect(stripped).not.toMatch(
   /\buseState\b|\buseEffect\b|\buseCallback\b|\buseMemo\b|\buseRef\b/)`. This is
   the assertion that pins the whole reason this extraction is safe under
   `preserve-manual-memoization`, and it is the one a later "just move the useMemo
   in too" change would trip.

**Sabotage obligation.** Assertions 3 and 4 are moved, not written fresh - so
prove they still fail in their new home by the same mutation that reddened them
in the old one (drop `freeSolo`; change the gate to `assessmentLabel === ""`),
using a `cp` backup, never `git checkout --`.

---

## 9. Wave 1's gate, each row naming the object, the instrument and the direction of failure

These REPLACE nothing in plan 9.2; they instantiate its rows against a named
target and add three the plan could not write before the target existed. 9.0's
repo-wide snapshot diff still wraps all of it.

| id | Object | Instrument | Passes when | RED when |
|---|---|---|---|---|
| **W1-G1** | `src/app/components/grading-recording/GradingRecordingPanel.tsx` | `wc -l <panel>` **and** `@(Get-Content <panel>).Count` | both report the SAME number and it is **<= 934** | either exceeds 934, or the two disagree (then the count is not yet a fact) |
| **W1-G2** | same file, before and after, in this wave | `grep -c "^\s*\(//\|/\*\|\*\|{/\*\)" <panel>` | after >= before, where before is **298** measured on the pre-change tree in this same wave | after < before. Do not carry 298 as a constant - re-measure it, because wave 0 may have landed first |
| **W1-G3** | the panel's source text | a new `it(` in `GradingRecordingPanel.wiring.test.ts` | the panel BOTH matches `/from "\.\/GradingCaptureSettings"/` AND matches `/<GradingCaptureSettings\b/`, and the captured element carries all ten props bound to the panel's own identifiers | either half absent. **Canary required:** construct a string with the import and no `<GradingCaptureSettings` tag and assert the detector returns false, or a dead import passes this row |
| **W1-G4** | `GradingCaptureSettings.tsx` | `npx vitest run src/app/components/grading-recording/GradingCaptureSettings.wiring.test.ts` (single path) | green, 7 or more `it` blocks | red, or fewer `it` blocks than section 8 lists |
| **W1-G5** | `GradingRecordingPanel.assessment.test.ts` | `grep -c "^  it(" <file>` before and after, plus `npx vitest run <file>` | **9 before, 9 after**, and green. Two blocks are RE-POINTED at the new leaf, never deleted | 8 or fewer after. An assertion silently deleted to make a refactor green is the failure this row exists for |
| **W1-G6** | `src/app/components/ui/buttonVariant.test.ts` | `npx vitest run <file>` | green **with `FROZEN_PRIMARY_SITES:157` unchanged at 3**. Verified achievable: `sed -n '714,784p' <panel> \| grep -c "<Button"` returns **0** and `... \| grep -c "variantFor("` returns **0**, against whole-file canaries of 3 and 3 | the file is edited. `SECTION_4_DIRS:85-93` includes this directory, so the new file IS walked; `:223`'s `if (n > 0 \|\| rel in FROZEN_PRIMARY_SITES)` means a zero-primary new file is correctly omitted from `actual` |
| **W1-G7** | the other five source-text readers | `npx vitest run <path>`, **one path per invocation** | all green. Predicted no-edit, each checked: `markLate.wiring.test.ts` (asserts only `onMarkLate={gradingRows.markSubmissionLate}` at `:52`, outside the region); `GradingAssessmentDeclarationControls.test.ts` (every panel assertion in the describe at `:246-276` is about the `<GradingAssessmentDeclarationControls .../>` element, which stays); `AddKnowledgePages.test.ts:275-288` (the Context fieldset is untouched); `runLogRow.test.ts:39-41` (`<RunLogRow` count stays exactly 1); `submission-kind-callsites.structure.test.ts:86,:103` (the new file contains zero `suggestedSubmissionKind`/`submissionKindCue`, so `SET_A_MATCHER`'s exact nine-path array is unchanged) | any of them red. A multi-path invocation is forbidden - it drops a path that matches nothing and exits 0 |
| **W1-G8** | `src/file-size-ceiling.structure.test.ts` | `npx vitest run <file>` | green **without editing `ALLOWED_OVERAGE`** | the allow-list is touched |
| **W1-G9** | `src/app/components/courses/page-module-css-orphan-classes.test.ts` | `npx vitest run <file>` | green. Its ratchet asserts `toBe(PINNED_ORPHAN_CEILING)` = **120** - EXACT equality in both directions. De-risked, measured: every class leaving the panel (`adaptRow`, `fieldMd`, `loadingLine`, `spinner`) is referenced by 29, 20, 9 and 53 other files respectively (`grep -rl <class> src --include=*.tsx --include=*.ts \| grep -v GradingRecordingPanel.tsx \| wc -l`), so none can become an orphan | the count moves. `docs/css-orphans.md` is an EXPECTED modification at the gate and must be listed in the assignment, or 9.0's snapshot diff reads it as an over-reaching agent |
| **W1-G10** | `snapshot-autofire.structure.test.ts:28` and `:246` | `grep -n "Drains the capture queue" <panel>` and `grep -n "\[pendingFrames, extracting, runExtraction\]" <panel>`, re-run AFTER the edit | the cited range equals the measured construct. It is a COMMENT and never reds, so it is missed unless named | the citation is left stale. Today it says `:506-518`; the true construct is `:507-519` (comment `:496-506`), already off by one at both ends. On the simulation it becomes `:516-528` - **but that number is a prediction from my comment lengths, not a licence.** Re-measure |
| **W1-G11** | the repo | `npm run lint` | **no MORE problems than the count measured on the pre-change tree in this same wave.** Orientation only: `this-repo.md:61-66` records 4 warnings / 0 errors at `RecordingTab.tsx:347`, `repoGradesSliceA.guards.test.ts:83`, and two in `canvas-modules/new-quiz.test.ts`. **I did not run it** | a fifth locus appears. If it names `preserve-manual-memoization` on a callback nobody touched, that is `this-repo.md:68-86`'s recorded class - report it, do NOT silence it, and see section 12's fallback |
| **W1-G12** | the repo | `npx tsc --noEmit` | **no output at all**, exit 0 | any output |
| **W1-G13** | the repo | `npm test` | exit 0, totals not below the baseline **measured on the pre-change tree in this same wave**. Do not carry `this-repo.md`'s 1017/20200 or A8-R's 1076/21444 | totals fall. Pipe vitest output through `tr -d '\000'` or use `grep -a` before grepping it |
| **W1-G14** | the repo | `npm run build` | the line `Compiled successfully` is present | that line is absent. **Do not gate on the exit code** - it exits 1 in the env-dependent prerender tail |
| **W1-G15** | `src/lib/no-emojis.test.ts`, `src/source-bytes.structure.test.ts` | `npx vitest run <path>`, one per invocation | green. The new file is new bytes; both are the committed owners of those rules and must not be hand-rolled | either red |

**What a full pass does NOT prove.** Section 13.

---

## 10. `owns`

**Derivation command, with its output pasted.** A by-name sweep is not enough -
three files read this panel through a directory walk and never name it in a way
`grep GradingRecordingPanel` over an import list would surface, which is the
class `docs/a8r-scope.md:880-886` already recorded.

```bash
# D1 - every file naming the panel
grep -rln "GradingRecordingPanel" src --include=*.ts --include=*.tsx | sort
# D2 - files that read the grading-recording DIRECTORY wholesale
grep -rln "components/grading-recording\"\|\"grading-recording\")" src --include=*.test.ts | sort
# D3 - files naming an identifier that crosses the new seam
grep -rln "assessmentOptions\|selectedRosterText\|coursesLoading" src --include=*.ts --include=*.tsx | sort
```

**RAW OUTPUT, pasted rather than summarised.**

`D1` (56 paths):

```
src/app/actions/grading-submission-extract.ts
src/app/actions/grading-submission-grade.ts
src/app/components/content-tab/ContentDiagnosticLogSection.tsx
src/app/components/grading-recording/GradingAssessmentDeclarationControls.test.ts
src/app/components/grading-recording/GradingAssessmentDeclarationControls.tsx
src/app/components/grading-recording/grading-capture-sync.ts
src/app/components/grading-recording/grading-capture-tombstones.ts
src/app/components/grading-recording/grading-dispatch.ts
src/app/components/grading-recording/grading-extraction-outcome.ts
src/app/components/grading-recording/grading-recording-log.test.ts
src/app/components/grading-recording/grading-recording-log.ts
src/app/components/grading-recording/GradingRecordingPanel.assessment.test.ts
src/app/components/grading-recording/GradingRecordingPanel.tsx
src/app/components/grading-recording/GradingRecordingPanel.wiring.test.ts
src/app/components/grading-recording/grading-row.ts
src/app/components/grading-recording/grading-rows.test.ts
src/app/components/grading-recording/grading-rows.ts
src/app/components/grading-recording/GradingTable.tsx
src/app/components/grading-recording/LegibilityProbeModal.tsx
src/app/components/grading-recording/markLate.wiring.test.ts
src/app/components/grading-recording/RubricInputModal.tsx
src/app/components/grading-recording/submission-kind-callsites.structure.test.ts
src/app/components/grading-recording/useGradingAssessmentDeclarations.ts
src/app/components/grading-recording/useGradingCaptureTracking.ts
src/app/components/grading-recording/useGradingRows.ts
src/app/components/knowledge/knowledge-helpers.ts
src/app/components/KnowledgeTab.tsx
src/app/components/module-deck-capture/module-capture-log.ts
src/app/components/module-deck-capture/ModuleDeckCapturePanel.tsx
src/app/components/module-deck-capture/ModuleDeckCapturePanel.wiring.test.ts
src/app/components/module-deck-capture/module-deck-dispatch.test.ts
src/app/components/module-deck-capture/module-deck-dispatch.ts
src/app/components/recording/AddKnowledgePages.test.ts
src/app/components/recording/AddKnowledgePages.tsx
src/app/components/recording/CarriedKnowledgePages.tsx
src/app/components/recording/discussion-capture.test.ts
src/app/components/recording/discussion-capture.ts
src/app/components/recording/discussion-draft-loop.ts
src/app/components/recording/discussion-knowledge-context.test.ts
src/app/components/recording/discussion-knowledge-context.ts
src/app/components/recording/DiscussionRepliesPanel.tsx
src/app/components/recording/runLogRow.test.ts
src/app/components/recording/RunLogRow.tsx
src/app/components/recording/TakeAnnouncementPanel.tsx
src/app/components/recording/useDiscussionKnowledgeContext.ts
src/app/components/recording/useTakeAnnouncement.ts
src/app/components/RecordingTab.tsx
src/app/components/snapshot-grading/snapshot-autofire.structure.test.ts
src/app/components/snapshot-grading/SnapshotGradingPanel.tsx
src/app/components/ui/buttonVariant.test.ts
src/app/page.tsx
src/lib/dropped-frame-accumulator.ts
src/lib/grade/submission-kind.ts
src/lib/knowledge-return.ts
src/lib/recording-launch.test.ts
src/lib/recording-launch.ts
```

`D2` (3 paths) - the three the by-name sweep would still find, but which reach the panel through a DIRECTORY WALK rather than an import, so a name-shaped grep does not answer the question:

```
src/app/components/grading-recording/grading-rows.test.ts
src/app/components/grading-recording/markLate.wiring.test.ts
src/app/components/ui/buttonVariant.test.ts
```

`D3` (19 paths):

```
src/app/components/grading-recording/GradingRecordingPanel.assessment.test.ts
src/app/components/grading-recording/GradingRecordingPanel.tsx
src/app/components/grading-recording/useGradingCourses.ts
src/app/components/message-replies/MessageCaptureSettings.tsx
src/app/components/message-replies/MessageRepliesPanel.tsx
src/app/components/message-replies/useMessageReplies.ts
src/app/components/module-deck-capture/ModuleDeckCapturePanel.tsx
src/app/components/module-deck-capture/ModuleDeckSettings.tsx
src/app/components/recording/DiscussionCaptureSettings.tsx
src/app/components/recording/discussion-draft-loop.ts
src/app/components/recording/DiscussionRepliesPanel.tsx
src/app/components/recording/useDiscussionCourses.ts
src/app/components/recording/useDiscussionLoopStarter.ts
src/app/components/recording/useDiscussionReplies.ts
src/app/components/repo-grades/index.tsx
src/app/components/repo-grades/RepoGradesControls.tsx
src/app/components/repo-grades/repoGradesSliceA.guards.test.ts
src/app/components/repo-grades/RepoGradesStatusBanners.tsx
src/app/components/repo-grades/useRepoGradesData.ts
```

The union is filtered to
**files whose content depends on the panel's or the new leaf's SOURCE TEXT or
exports** - a file that merely mentions the panel in a comment is not in `owns`.
The filtered census, 14 paths:

**Edited by wave 1 (4):**

```
src/app/components/grading-recording/GradingRecordingPanel.tsx              [the extraction + the import + the call]
src/app/components/grading-recording/GradingCaptureSettings.tsx             [NEW]
src/app/components/grading-recording/GradingCaptureSettings.wiring.test.ts  [NEW]
src/app/components/grading-recording/GradingRecordingPanel.wiring.test.ts   [W1-G3's new assertion + its canary]
```

**Conditionally edited - this wave's own change can force an edit (2):**

```
src/app/components/grading-recording/GradingRecordingPanel.assessment.test.ts   [WILL fire: :70-76 move to the leaf]
src/app/components/snapshot-grading/snapshot-autofire.structure.test.ts         [WILL fire: :28, :246 re-pin]
```

**Reads an edited file AS SOURCE TEXT, no edit predicted - but in `owns`,
because a test that greps a string it does not own is how a correct change goes
red (8):**

| Path | How it reads the panel | Why it survives |
|---|---|---|
| `src/app/components/grading-recording/markLate.wiring.test.ts` | `DIR` walk at `:28`, `read("GradingRecordingPanel.tsx")` at `:33` | its only panel assertion is `:52`, outside the region |
| `src/app/components/grading-recording/GradingAssessmentDeclarationControls.test.ts` | `readFileSync(PANEL_PATH)` at `:242-244` | all six panel assertions match the `<GradingAssessmentDeclarationControls .../>` element, which stays |
| `src/app/components/grading-recording/grading-rows.test.ts` | `fs.readdirSync(dir)` over the WHOLE directory at `:640-648`, joined into one haystack | the new file contains no `ta-rec-grade-` key; the seven-key `toEqual` at `:668-676` is unchanged. **This file is the reason a by-name sweep is insufficient** |
| `src/app/components/grading-recording/submission-kind-callsites.structure.test.ts` | `walkSourceFiles(src)` at `:40-55`, comment-stripped | the new file matches neither `SET_A_MATCHER` nor `SET_B_MATCHER` |
| `src/app/components/ui/buttonVariant.test.ts` | `SECTION_4_DIRS:85-93` includes this directory; per-file count vs `FROZEN_PRIMARY_SITES:152` | zero primaries move; `:223` omits a zero-count file not in the map |
| `src/app/components/recording/AddKnowledgePages.test.ts` | `readFileSync(GRADING_PANEL_PATH)` at `:237-238`, then `findGateBlockEnd` ORDER assertion at `:275-288` | the Context fieldset is deliberately not touched |
| `src/app/components/recording/runLogRow.test.ts` | `RUN_BEARING_PANELS:14-16`, counts `<RunLogRow\b` at `:39` | the run-log row stays at `:663-666` |
| `src/app/components/courses/page-module-css-orphan-classes.test.ts` | walks every file importing a `*.module.css` (`:110-129`); writes `docs/css-orphans.md` at `:411` | classes are preserved; `docs/css-orphans.md` is an expected modification path |

**Deliberately NOT in `owns`, with the reason:**
`src/app/components/grading-results/gradingResultsHelpersWiring.test.ts` - its
`CLIENT_FILES` at `:92-110` and its `directoryRoots` walk are scoped to
`grading-results/`, a different directory; it never reads this panel.
`src/app/components/ui/modalAdoption.wiring.test.ts` - its grading-recording
entries (`:251`, `:256`, `:341`, `:345`) name `RubricInputModal.tsx` and
`LegibilityProbeModal.tsx`; the new file declares no dialog.

---

## 11. Disposition of the prior requirements this pass supersedes

Id column re-derived last, after all renumbering.

| # | Prior requirement | Source | Disposition |
|---|---|---|---|
| 1 | Step 1 - extract `handleDownloadLog` plus the format/filename imports | `a8r-scope.md:846-855` | **Withdrawn - already satisfied.** Landed in `58a4254`. No enforcer protected it; it was a budget step, not a guard |
| 2 | Step 2 - the four `setLogGradingRuns` blocks become three named builders | `a8r-scope.md:857-866` | **Withdrawn - already satisfied.** Landed in `58a4254`; the three builders are imported at `<panel>:137-139` |
| 3 | Pass condition W0-P: panel `<= 965` by `@(Get-Content).Count` | `a8r-scope.md:868-876` | **Kept, tightened, as W1-G1.** The object and the instrument are identical; the threshold moves 965 -> 934 and gains `wc -l` as a second instrument that must agree |
| 4 | "Five test files read this panel BY PATH and a by-name sweep does not see them" | `a8r-scope.md:878-886` | **Kept and widened, as section 10.** A8-R listed six paths; my directory-walk derivation adds three more it did not name (`grading-rows.test.ts`, `submission-kind-callsites.structure.test.ts`, `page-module-css-orphan-classes.test.ts`) |
| 5 | The primary-button canary - `FROZEN_PRIMARY_SITES` bumps in the same commit with the reason | `a8r-scope.md:884-905` | **Kept, as W1-G6**, and discharged rather than merely carried: measured zero primaries in the moved region, so no bump is owed |
| 6 | The CSS orphan walker - `docs/css-orphans.md` is an expected modification path, list it in the assignment | `a8r-scope.md:907-921` | **Kept, as W1-G9.** Strengthened with the per-class survival measurement that shows the ratchet cannot move |
| 7 | Revision 3's two placeholder destination filenames in wave 1's set | withdrawn by `a16-plan.md:300-320` (ruling 23) before revision 4 | **Handed over - RECEIVED HERE.** This pass is the named receiver; obligation discharged by section 6, which publishes real paths AFTER choosing the target rather than before |
| 8 | "Whether 32 extractable lines exist under the comment floor - I could not determine" | `a16-plan.md:1330-1336` (section 12) | **Handed over - RECEIVED HERE and ANSWERED: yes, 49.** Sections 0, 2 and 5. The plan's contingency (a)/(b)/(c) is not invoked |
| 9 | "If the next round believes the eight occurrences should have moved, that is a different change (extracting the assessment fieldset) and belongs to wave 1's scoping pass" | `a16-plan.md:1351-1354` | **Handed over - RECEIVED HERE and ACTED ON**, with a correction: the plan's own 5.5.1 already measures **7 lines / 10 occurrences**, not eight, and I re-ran both and confirm 7 and 10. Section 12 names what moving them does to wave 2 |
| 10 | 5.6's "the pass must say which it did" re comments | `a16-plan.md:898-901` | **Kept, answered in section 5**: the comments MOVE with the markup, and the panel is paid back a 9-line `//` block plus a 1-line `{/* */}`. Measured net **+6**, zero deletions |

---

## 12. Residual register

Each entry names an owner, an instrument, and the step that will measure it.
**None of these is in `docs/backlog.yml` yet.** I did not add rows: that file is
outside this pass's write set and A16 has concurrent writers. **By the loop's own
rule, a residual with no backlog row does not exist - so the orchestrator must
create these three rows before wave 1 dispatches, or strike them and say so.**

| id | Residual | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| **RES-W1-1** | Wave 2's 5.5.1 measurement of the detector region goes stale the moment wave 1 lands. Measured on the simulation: the comment-stripped render body's occurrences of `assessmentLabel\|assessmentId\|courseId` go from **7 lines / 10 occurrences** to **6 lines / 12 occurrences** - fewer lines but MORE occurrences, because `courseId={courseId}` carries the identifier twice and three of the four surviving lines are prop bindings. Any wave-2 assertion written against "seven lines" is wrong on arrival | wave 2's implementer | `awk 'NR>=<line of the `^  return \(` marker>' <panel> \| grep -cE "assessmentLabel\|assessmentId\|courseId"` and the `grep -oE ... \| wc -l` twin, both re-run on the POST-wave-1 tree | wave 2's gate, plan 9.3. The marker is located by matching `/^  return \(/m`, never by a raw line number - it is `:642` today and `:651` on the simulation |
| **RES-W1-2** | `GradingCaptureSettings.tsx` is a new `.tsx` in a directory whose ONLY structural census is `grading-rows.test.ts`'s persisted-key scan. Nothing asserts the new file is imported by anything if `GradingRecordingPanel.tsx` later stops rendering it - W1-G3 pins the panel, but W1-G3 lives in the panel's own wiring test and a future wave that rewrites that test could drop the row | the A16 orchestrator | `grep -rl "GradingCaptureSettings" src --include=*.tsx \| wc -l`, which must be >= 2 (the leaf and its caller) | the wave-1 verification pass, and again at A16's closing regression pass against `docs/REGRESSION.md` |
| **RES-W1-3** | The leaf inherits no ceiling pressure today (estimated 132-140 of 1000) but sits in the directory the repo's only NON-recursive split gate cannot see. `file-size-ceiling.structure.test.ts:16-21` records that `recording-split.structure.test.ts` scans `src/app/components/recording/` non-recursively plus two named files; `grading-recording/` is covered only by the repo-wide gate | the A16 orchestrator | `@(Get-Content src\app\components\grading-recording\GradingCaptureSettings.tsx).Count` | W1-G8's run of `file-size-ceiling.structure.test.ts`, which does cover it repo-wide - so this is a watch item, not a gap |

**NOT a residual, and I am calling it what it is - a DELETION.** That the Capture
fieldset still looks and behaves identically after the move - same tab order,
same fieldset/legend grouping announced by a screen reader, the Autocomplete
still opening, the select still focusable mid-load - has an owner (the repo
owner) and an instrument (a browser pass on the deployed app), **but no step.**
Nothing renders under vitest here, and the post-deploy visual check is recorded
as suspended. There is no step that will measure it, so it is not a residual; it
is an accepted, named gap. Section 13 states it as one.

**The fallback, priced now rather than improvised.** If W1-G11 reds on
`preserve-manual-memoization` despite no hook moving, the recorded workaround
(keep a ref and its effect in the panel, pass the ref into the leaf) has nothing
to apply to - no ref crosses this seam. The honest fallback is then to narrow the
extraction to one half and re-measure: the course half is `:717-753` (37 lines),
the assessment half `:754-783` (30 lines). **Neither half alone clears 32 after
its own prop list and import**, so a narrowed extraction falls back to the plan's
contingency (a), trimming wave 2's 16-22 lines of hinge comment by the measured
shortfall. Say the shortfall as a number; do not relax the target, do not touch
`ALLOWED_OVERAGE`, and do not delete a comment to fit.

---

## 13. What this pass could not determine, and what no gate can prove

- **That the panel still renders.** Nothing renders under vitest here
  (`environment: "node"`, `include: ["src/**/*.test.ts"]`). Every claim in this
  document about markup is a READING claim. Specifically unverifiable: that the
  moved fieldset produces the same DOM, that the `<legend>` still groups the two
  controls for assistive tech, that tab order across the panel is unchanged, that
  the `Autocomplete` popup still opens, and that the loading spinner still
  occupies the same space. **I propose no requirement whose only enforcer would
  be a render.**
- **I did not run `npm run lint`, `npm test`, `npx tsc --noEmit` or `npm run
  build`.** W1-G11's four-warning figure is `this-repo.md:61-66`'s record, cited
  as orientation, never as a pass condition. Wave 1's implementer measures the
  real pre-change baseline in its own wave.
- **The leaf's line count is an ESTIMATE, not a measurement** - section 4 gives
  the arithmetic and its components. Nothing exists to measure yet, and I did not
  write production code to create something to measure.
- **Whether 917 survives the implementer's own comment wording.** The 49-line
  saving is measured against MY 9-line import comment and MY 13-line call site. A
  longer header or a different prop formatting moves the number. The slack is 17
  lines against the 934 target, which is why W1-G1 is a measurement at the gate
  and not a prediction carried from here.
- **Whether `GradingRecordingPanel.assessment.test.ts`'s two moved `it` blocks
  keep the same sabotage strength in their new home.** Section 8 makes re-proving
  them an obligation rather than an assumption; I did not run the mutations.
- **The exact post-edit line range for W1-G10.** `:516-528` on the simulation is
  arithmetic from my own comment length (+9 from `:507-519`), not a licence.
  Re-measure by symbol after the edit, as plan section 7's rule requires.

---

## 14. The leverage question

**Trigger fired; there is no claim to make, and that is the honest answer.**

`docs/loop/leverage.md`'s failure mode A names the population directly: a
leverage claim is meaningless for "a bug, a doc correction, an owner
verification, **a refactor**, or a product decision". Wave 1 is a refactor with
an explicit no-behaviour-change contract - the plan's own table calls it "Pure-
assembly extraction ... No behaviour change" and its gate is a line count, an
unchanged comment count, a proven caller and an unchanged suite. Not one of the
six classes (CORPUS, CAPTURE, LIVE-LOOP, INTEGRATION, SCALE, GUARANTEED) applies,
because nothing a user can do changes.

**The three-way call (Redesign / Accept explicitly / Reject) is the human's and I
am not defaulting it** - but it is not owed here, because that call attaches to a
FEATURE with a thin claim, and this wave ships no feature. The A16 leverage claim
belongs to wave 2, whose mount is the user-visible change. Recording the fired
trigger and the null result is what this section is for; silence would be the
illegal answer.

---

## 15. Dispatch summary

**Wave 1's complete write set, 12 paths** (plan 3.3's ten, plus section 6's two):

```
src/app/components/grading-recording/GradingRecordingPanel.tsx
src/app/components/grading-recording/GradingCaptureSettings.tsx              [NEW]
src/app/components/grading-recording/GradingCaptureSettings.wiring.test.ts   [NEW]
src/app/components/grading-recording/GradingRecordingPanel.wiring.test.ts
src/app/components/grading-recording/GradingRecordingPanel.assessment.test.ts
src/app/components/grading-recording/GradingAssessmentDeclarationControls.test.ts
src/app/components/grading-recording/markLate.wiring.test.ts
src/app/components/grading-recording/submission-kind-callsites.structure.test.ts
src/app/components/recording/AddKnowledgePages.test.ts
src/app/components/recording/runLogRow.test.ts
src/app/components/ui/buttonVariant.test.ts
src/app/components/snapshot-grading/snapshot-autofire.structure.test.ts
```

Plus `docs/css-orphans.md` as an expected generated modification (ruling 3),
which must be named in the assignment or 9.0's snapshot diff reads it as
over-reach.

**Explicitly out of scope for this wave:** no cohort, no trends adapter, no
`<ClassTrendsPanel>` mount, no `buildRunCohort`, no `lastRunCohort` state, no
Repo Grades. Wave 1 is headroom and nothing else. The `Context` fieldset, the
status row, the notices region and the run row all stay in the panel, each for
the reason section 2's table gives.
