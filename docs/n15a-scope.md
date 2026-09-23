
# N15a scope: the owner's one-upload-per-student workflow

Sources read in full before writing anything below: `docs/backlog.yml` entry
`N15a` (and, for cross-reference, `A41`, `A12`, and `L6`), `AGENTS.md`,
`docs/DEV_LOOP.md`, `docs/loop/this-repo.md`, `docs/loop/leverage.md`,
`docs/a39-waves.md` (sections 0-4 in full; the rest is a wave-by-wave build
plan for work not relevant to this scope), `docs/a39-architecture.md` (grepped
for the sections `a39-waves.md` cites), `docs/a39-census.md` sections 0, 3 and
4 in full, `docs/n13b-scope.md` (grepped for "naming", to check a claimed
cross-reference - see section 8).

**A parallel extraction is in flight on
`src/app/components/snapshot-grading/SnapshotGradingPanel.tsx`.** That file is
never cited below; nothing in N15a's surface touches
`snapshot-grading/`. All line numbers below were measured this pass, on this
tree, and are marked with the command that produced them.

Write set for this document: exactly `docs/n15a-scope.md`. Nothing else was
opened for writing.

---

## 1. Overlap with A39 wave 1 - what shipped today, and what did not

`c031050` ("feat(a39): grading one submission no longer requires a zip")
landed today and is real, confirmed by `git show --stat c031050`. It adds
`src/lib/grade/single-file-entry.ts` (133 lines,
`@(Get-Content src/lib/grade/single-file-entry.ts).Count` and
`wc -l < src/lib/grade/single-file-entry.ts` agree) and wires it into
`src/app/actions/grading.ts:829` (`classifyGradingUpload`) and `:892-902`
(`buildSingleFileEntry` + `gradeEntries`).

**What it does, read directly:** `classifyGradingUpload` (`single-file-entry.ts:31-40`)
looks at the upload's extension only (never sniffs bytes) and returns
`"zip" | "single" | "unsupported"`. When a non-zip, gradable extension is
uploaded, `grading.ts:892-902` builds ONE `StudentSubmissionEntry` via
`buildSingleFileEntry` and grades it through `gradeEntries` - the same
per-entry path `gradeOneSubmissionAction` already used for Canvas submissions.
This already happens automatically today: there is no checkbox, no toggle, no
instructor decision. Confirmed by reading the whole `zip` branch of
`GradingTab.tsx` (`:249-260`): the file input at `:256-259` has no `multiple`
attribute (absent from the JSX, confirmed by reading the element), and
`grading.ts:711` reads it as `formData.get("studentSubmissions") as File | null`
(`.get`, not `.getAll`) - the server can only ever see one file per submit.

**What it does not do, also read directly, and this is the finding the row
turns on:**

- **No accumulation.** `page.tsx:63` is
  `const [state, formAction, pending] = useActionState(gradeAction, initialState);`
  React's `useActionState` REPLACES `state` wholesale on every dispatch; there
  is no reducer, no merge, no append anywhere in this call chain (confirmed by
  reading `gradeAction`'s full return shape at `grading.ts:892-902` and
  `:912-920`: both branches return a fresh `{ run, error, generatedRubric }`,
  never a function of the previous state). So uploading a second single file
  today REPLACES the one-row results table with a new one-row table. The
  row's own language - "upload repeatedly... graded as it lands" - describes a
  GROWING table. That does not exist. It is not scoped by wave 1 and no A39
  wave builds it: wave 4c ("the run delivers row 1 while row 7 is still
  running", `docs/a39-waves.md:575`) is the only accumulation machinery this
  plan describes, and it is unbuilt - `find src -iname "rubric-memory*" | wc -l`
  returns `0` and `find src -iname "single-file-entry*" | wc -l` returns `2`
  (the canary proving the search itself works: wave 1's own two files are
  found by the same instrument that finds nothing for wave 2/4c). Wave 4c's
  accumulator, even once built, is designed for a batch of N entries known at
  upload time (a zip), not for entries arriving one at a time over an
  unbounded, instructor-paced session - it is adjacent, not reusable as-is.
- **No checkbox exists anywhere in the tree for this.** `grep -rn "one.upload.per.student\|oneUploadPerStudent" src --include=*.ts --include=*.tsx`
  and the emoji-safe ASCII form both return nothing; canary
  `grep -rn "classifyGradingUpload" src --include=*.ts --include=*.tsx | wc -l`
  returns 4 (the export, its two call sites, and the test file), proving the
  grep mechanism fires on a string that does exist. The row's literal ask - a
  checkbox that changes what an upload MEANS - is unbuilt.

**Conclusion for this section, stated plainly per the brief's instruction:**
N15a is **not** substantially shipped. What shipped is a prerequisite: the
classifier and the one-entry builder that make a non-zip upload gradable at
all. The row's actual behavioural asks - a mode toggle, repeated uploads, and
an accumulating table - are unbuilt in full. This is not a smaller version of
the same feature; it is the part of the feature wave 1 did not touch.

---

## 2. What the checkbox would actually change

The row's own phrasing admits two different builds, and the brief is right
that they are different features:

- **(a) "One upload = one student", repeated over time.** The instructor
  submits the existing single-file form once per student, and each submit
  APPENDS a row to a growing table instead of replacing it. The checkbox is a
  MODE flag on the form (or an always-on behavior once a non-zip file is
  detected - see below). This is the reading closest to the row's own words
  ("upload repeatedly... graded as it lands"), and it is what section 1 shows
  is missing: accumulation, not classification.
- **(b) "One upload = many files, each a student."** The instructor selects
  several files in ONE file-dialog round trip (`multiple` added to the input
  at `GradingTab.tsx:256-259`), the server reads them with
  `formData.getAll("studentSubmissions")` instead of `.get(...)`, and each
  file becomes its own `StudentSubmissionEntry` via
  `buildSingleFileEntry` (already a per-file pure function, a real precedent
  to loop rather than reinvent - `single-file-entry.ts:65-133`). This is a
  genuinely different, cheaper build: no `useActionState` limitation applies,
  because it is still one form submission producing one `GradingRun` with N
  results, same as the zip path already does.

**Given wave 1 already exists, the checkbox described by the row's literal
words is reading (a).** Reading (b) does not need a checkbox at all in the
same sense - it needs `multiple` on an input and a loop, and the resulting
upload is still, in every sense the census in section 4 uses, ONE interaction
with N submissions inside it, not "one upload per student" repeated. **This
scope does not choose between (a) and (b) - the row's own phrasing does not
resolve it, and picking wrong is not a smaller mistake, it is a different
feature with a different interaction-cost profile (section 4).** It is
recorded here as the first open question for whoever picks up N15a; see the
residual register (section 7) and the recommendation in section 5.

---

## 3. The naming problem

Per the brief: since (in reading (a), the one the row's words point to) each
upload is one student, the student's identity has to come from somewhere.
Three sources exist in the tree today, in ascending order of what they cost
to build, and each has a distinct, named failure mode.

### 3.1 Filename stem (what wave 1 already does for the single-upload case)

`single-file-entry.ts:52-58`, `studentLabelFromFileName`:

```
function studentLabelFromFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  const extension = getFileExtension(base);
  const stem = extension ? base.slice(0, base.length - extension.length - 1) : base;
  const trimmed = stem.trim();
  return trimmed.length > 0 ? trimmed : "Uploaded submission";
}
```

The comment above it (`:46-51`) is explicit that this is deliberately NOT
`leafStemFallback` (`grade/utils.ts:121-126`, the function A41 documents as
collapsing multiple files onto one key): a single upload has exactly one
student, so the WHOLE stem becomes the label, not just its leading
alphanumeric run. That choice is correct for wave 1's single-request case -
there is nothing to collide with inside one request.

**It stops being safe the moment uploads repeat (reading (a)).** Two
DIFFERENT students who both name their file something generic - "Homework
Final.docx", "Essay.docx", a phone camera's default "IMG_4021.jpg" - would,
across two separate single-file submissions, each get the label "Homework
Final" (or "Essay", or "IMG_4021"). This is not the same bug as A41 (A41
collapses many files inside ONE zip into one row via `leafStemFallback`'s
Map key at `grade/utils.ts:301-316`); here the row COUNT stays correct (two
separate submits, two separate rows), but the two rows carry an IDENTICAL
`student` string with no other identity attached, and that string is used
as a live key downstream, not just a display label:

- `GradingResults.tsx:635`: `<tr key={`${result.student}-matrix`} ...>` -
  React's own reconciliation key is derived from the string alone.
- `GradingResults.tsx:768`: `<td key={`${result.student}-${areaName}`}>`
  - same pattern per rubric-area cell.
- `GradingResults.tsx:326,334,347,364,377,393,427,431,446,449,459,466,476,477,482,494,500`
  (grepped: `grep -n "\.student\]" src/app/components/GradingResults.tsx`
  returns 17 lines) - every one of `edits`, `postStatus`, `codeRuns`,
  `codeRunning` and `refusals` is a plain object keyed by `r.student`, a
  bare `string` (`grade/types.ts:152,165,213,368` all declare
  `student: string`, no id field alongside it).

Two rows sharing a `student` string therefore do not just look the same -
editing one row's grade, comment, or post status can write into the SAME
dictionary slot the other row reads from, and React's own key collision
means the two `<tr>` nodes are not guaranteed to reconcile to the two
students they actually represent across a re-render. This is a real,
citable defect class this scope would introduce if reading (a) ships with
filename-stem identity and no de-duplication, and it is worse than A41's
failure (a short table) because the table would look the RIGHT length while
silently cross-wiring two students' grades.

### 3.2 Instructor-typed name

No such field exists today. `GradingTab.tsx`'s `zip` branch (`:249-260`) has
exactly one control: the file input. There is no adjacent text field for a
student name, confirmed by reading the surrounding `:228-260` block in full
(the only other fields in the form are Canvas URL, assignment instructions,
and rubric - none of them per-file). Adding one is a small, cheap build (one
`TextField`, one form field, one extra column threaded through
`buildSingleFileEntry`'s `student` return), and it is the only option of the
three that gives a REAL, unique identity at zero silent-failure risk: the
failure mode moves from "silent collision" to "instructor typo", which is
visible on the row the instant it is typed, not discovered later in a
gradebook. Its cost is one extra interaction per submission (see section 4).

### 3.3 Canvas roster match

No fuzzy or exact roster-name matching utility exists anywhere in `src/` for
this path. Measured:

```
grep -rln "matchStudentToRoster\|fuzzyMatchStudent\|rosterMatch\|matchRosterName" src --include=*.ts
  -> src/app/components/repo-grades/useRepoGradesData.ts   (false positive: `rosterMatches` there
     is an unrelated boolean checking a cache key, not a name-matching function - opened and confirmed)
grep -rln "matchStudentToRosterZZZ" src --include=*.ts     # canary, exit 1 (no matches)
```

The only place this repo already gets student identity for free is the
Canvas URL path: `engine.ts`'s `gradeCanvasUrl` doc comment states "Canvas
gives exact student names, so no filename inference is needed" (read at the
function's own header, immediately above the `students.length === 0` check).
That is a live Canvas API read, not a roster lookup against a stored
`studentRepos`/roster table - and the memory note on this repo
(`roster text vs studentRepos`) already records that the two roster fields
this app stores are unsynced, so building a "match this filename against
the roster" feature would need to pick which of those two fields to trust,
which is its own open question, not a detail. This is by far the most
expensive of the three options and the only one that could give a WRONG
match rather than an ambiguous one (matching "Homework Final.docx" to the
wrong roster row because a fuzzy matcher guessed) - a failure strictly worse
than 3.1's collision, because it silently attributes one student's real work
to a different named student.

**Ranking, stated plainly:** 3.2 (instructor-typed name) is the only one of
the three with no silent-failure mode. 3.1 (filename stem, what already
ships for the single-upload case) is cheap but reintroduces a collision risk
structurally similar to, and in the state-keying sense worse than, A41's.
3.3 (roster match) is the most expensive and the only one that can produce a
confidently-wrong answer. **This is a product decision, not a default** -
consistent with the row's own note ("Do not default it") about the adjacent
bulk-zip-coexistence question.

---

## 4. Interaction cost, measured against `docs/a39-census.md`

The census's own counting unit (section 0 of that document): one file-dialog
round trip is ONE interaction regardless of how many files are picked in it;
one button click is one interaction; the chat baseline is `2 + N` (2 setup
interactions, 1 per submission, `docs/a39-census.md` section 0).

**Reading (a) - repeated single uploads, one row per submit (the row's
literal words).** Per submission, after the shared instructions/rubric are
filled once: one file-dialog round trip (select the file) plus one click on
`GradingTab.tsx:365`'s `type="submit"` button ("Start Review") = **p = 2**
interactions per student, on top of the existing zip path's warm setup
`s = 4` (`docs/a39-census.md` section 3, row "A Upload ZIP"). If option 3.2
(instructor-typed name) is added, `p = 3`.

Applying the census's own crossover rule (section 0: "when `p >= 1` there is
NO crossover at any N"): `s + p*N < 2 + N` becomes `4 + 2N < 2 + N`, i.e.
`N < -2`, never true. **Reading (a) never beats the chat baseline, at any
class size**, for the same reason the census already found path D
("GitHub, per repo", `p = 3`) never does (`docs/a39-census.md` section 3,
row "D GitHub, per repo": "**none** / **never**"). It also never beats the
path it would sit beside: today's zip path is `s = 4, p = 0` (one upload
covers the whole class), so reading (a) is strictly MORE interactions per
student than the feature it is proposed as an alternative to, for every
N >= 1. **This is the finding the brief asked for: if it is more clicks
than the thing it replaces, that is the finding, and it is.**

**Reading (b) - one multi-select upload, N files, one submit.** File
selection is still one interaction per the census's own definition (one
file-dialog round trip, regardless of file count), plus one submit click:
`p = 0` per additional student once the dialog is open, so the formula is
the same shape as today's zip path (`s = 4, p = 0`), crossing over at
`N* = 3`, same as "A Upload ZIP" in the census table. Reading (b) is
interaction-cost-competitive with the zip path; reading (a) is not.

**What this does not settle.** The census's own section 6 (not fully quoted
here; read directly at `docs/a39-census.md:533-596`) already found that
interaction count is NOT where this app loses to the chat - the loss is
elsewhere (prerequisites, waits, and what must be re-told). This section
only answers the narrower question the brief asked: whether THIS specific
proposed control costs more or fewer clicks than its neighbor. On that
narrow question, reading (a) is a regression and reading (b) is not.

---

## 5. Surface, ceiling, persistence

**Surface.** The control belongs on `src/app/components/GradingTab.tsx`,
next to the existing file input (`:249-260`), because that is the only
component that renders the "zip" source's form (confirmed: `GradingTab.tsx`
is the sole caller of the file input's containing `<form>`, and the only
other consumer of `single-file-entry.ts`'s exports is
`src/app/actions/grading.ts`, a server action with no JSX at all - `grep -rln
"single-file-entry" src --include=*.tsx --include=*.ts` returns exactly
those two files plus the test).

**Line counts, both instruments, this pass:**

```
PowerShell: @(Get-Content <file>).Count       Bash: wc -l < <file>
```

| File | PowerShell count | `wc -l` | Ceiling headroom (1000 - count) |
|---|---|---|---|
| `src/app/components/GradingTab.tsx` | 495 | 495 | 505 |
| `src/app/actions/grading.ts` | 941 | 941 | **59** |
| `src/lib/grade/single-file-entry.ts` | 133 | 133 | 867 |
| `src/lib/grade/utils.ts` | 393 | 393 | 607 |
| `src/lib/grade/extraction.ts` | 300 | 300 | 700 |

Both instruments agree on every row this pass (no gap observed here; the
15-138 gap `docs/loop/this-repo.md` records is real elsewhere and not
assumed absent on files not re-measured). Neither `grading.ts` nor
`GradingTab.tsx` appears in `src/file-size-ceiling.structure.test.ts`'s
`ALLOWED_OVERAGE` map (`grep -n "grading.ts\|GradingTab.tsx"
src/file-size-ceiling.structure.test.ts` returns nothing), so the plain
1000-line limit (`:41`) applies to both.

**`grading.ts` has 59 lines of headroom left, and that is the binding
constraint on any wave that touches it.** Wave 1 already added roughly the
20 lines `docs/a39-waves.md` section 2.1 predicted (905 -> 917 was the
architecture's number; the tree is now 941, reflecting wave 1 landing on
top of the wire-budget commit that document also tracks). A checkbox mode,
an accumulation branch, or a per-file loop (reading b) each add real lines
to this file's `gradeAction`. **A wave that adds a naming source (3.2 or
3.3), a multi-file loop (reading b), or an accumulation path (reading a)
must budget against 59 lines remaining, or extract first** - the same
"extract before adding" discipline `docs/a39-waves.md` section 4.2 already
applies to `SnapshotGradingPanel.tsx` and `GradingRecordingPanel.tsx` for
the same reason (a 1000-line ceiling gate that fails silently-looking-fine
until the exact line it is crossed).

**Persistence.** This repo requires every new control to survive a reload
under a `ta-` key (`docs/loop/leverage.md`'s struck-class section and the
project memory `persist-ui-control-state.md` both name this pattern; the
concrete precedent is `GradingTab.tsx:93,105`, `ta-grading-source`, read and
written via `localStorage`). **No test locks that existing key today**:

```
grep -rn "ta-grading-source" src --include=*.test.ts     -> (no output)
grep -rn "ta-grading-sourceZZZ" src --include=*.test.ts  -> (no output, exit 1, canary)
```

So there is no existing exact-set persisted-key canary for `GradingTab.tsx`
to extend (unlike `recording-split.structure.test.ts`'s `ta-rec-*` exact-set,
`docs/loop/this-repo.md` section 3). A new checkbox's key would need EITHER
a new canary test built alongside it, or an explicit, named decision to ship
without one - silence is not an option per this repo's persistence rule.
This is carried forward as RES-N15A-4 below.

---

## 6. Wave plan and residual register

**This plan is deliberately partial**, because section 3 (naming source) and
section 2 (reading a vs b) are both product forks this document does not
default. What follows is dispatchable regardless of how those forks resolve,
plus the two waves that are gated on them.

| Wave | What it does | Write set (must include the caller/renderer) | Gated on |
|---|---|---|---|
| **N15a-0** | Nothing to build. Escalate the two forks (section 2: reading a/b; section 3: naming source) to the owner as ONE batched question, per `docs/DEV_LOOP.md`'s "escalate the decision, not the task". Not a code wave. | n/a | nothing - this is the unblocker |
| **N15a-1** | If reading (b) is chosen: add `multiple` to the file input and switch the server to `formData.getAll`, looping `buildSingleFileEntry` per file. | `src/app/components/GradingTab.tsx` (renders the input), `src/app/actions/grading.ts` (calls `buildSingleFileEntry` in the loop - **already tight on ceiling, see section 5**), `src/lib/grade/single-file-entry.test.ts` (existing coverage to extend) | Reading (b) chosen in N15a-0 |
| **N15a-2** | If reading (a) is chosen: build the accumulator (a client-side array of `GradingRun["results"]` that a new submission APPENDS to, replacing the `useActionState` replace-semantics for this mode only), plus a de-duplication or insertion-order fix for `DEFAULT_SORT` (section 6.1 below). | `src/app/components/GradingTab.tsx` (renders the form and would own the accumulator state), `src/app/page.tsx` (owns `useActionState`, the thing being worked around), `src/app/components/grading-results/gradingResultsHelpers.ts` (`DEFAULT_SORT`, if insertion order is chosen over alphabetical) | Reading (a) chosen in N15a-0. **Priced as never beating the chat baseline (section 4) - the owner should see that price before choosing this branch over (b)** |
| **N15a-3** | Naming source: build whichever of 3.2 (typed name field) or 3.3 (roster match) the owner picks. 3.2 is the cheap, zero-silent-failure option and is the one this scope recommends absent an owner objection - stated as a recommendation, not a default, per `docs/loop/leverage.md`'s own rule that silence is the one illegal answer. | `src/app/components/GradingTab.tsx` (new field), `src/lib/grade/single-file-entry.ts` (`studentLabelFromFileName` becomes an override point), `src/app/actions/grading.ts` (threads the field through `buildSingleFileEntry`'s call) | Owner decision in N15a-0 |
| **N15a-4** | A collision guard: whatever N15a-2/3 ship, add a test asserting two results with the SAME raw `student` string do not collide in `GradingResults.tsx`'s per-row dictionaries (`edits`/`postStatus`/`codeRuns` etc., section 3.1) - either by proving the naming source chosen in N15a-3 cannot produce a collision, or by keying those dictionaries on something more than the bare string (e.g. an index or a generated id alongside `student`). | `src/app/components/GradingResults.tsx`, a new or extended test file under `src/app/components/grading-results/` | N15a-2 and N15a-3, whichever ships first |
| **N15a-5** | Persisted-key canary for the checkbox's `ta-` storage key (section 5) - a new exact-set test, since none exists to extend. | wherever the checkbox lives (`GradingTab.tsx`), a new test file | N15a-1 or N15a-2, whichever ships the checkbox itself |

### 6.1 One design note that binds N15a-2 regardless of which fork wins

`gradingResultsHelpers.ts:99-101`'s `DEFAULT_SORT` sorts by student name,
ascending, and `useResultsSort.ts:39` seeds the table's `sortState` from it.
This is the SAME defect the row's own inherited note flagged before wave 1
(the note's finding 2, re-verified on today's tree at these citations, not
carried over from memory). It still holds: an accumulating table (reading a)
would insert each new row ALPHABETICALLY by default, not at the end, so the
just-graded student does not land where the instructor is looking. This is
not new work the row's note invented; it is a real, present default that
N15a-2 must either override (seed `sortState` with an insertion-order column
in the checkbox's mode) or accept and say so.

---

## 7. Residual register

Every entry names an owner, an instrument, the object under test, and the
step that will measure it - a residual missing any of those four is a
deletion, not a residual.

| ID | Object | Owner | Instrument | Direction of failure | Step |
|---|---|---|---|---|---|
| RES-N15A-1 | Which reading (a or b) N15a builds | The owner (product fork, not an agent default - section 2) | N15a-0's escalation | N/A - a decision, not a measurement | N15a-0, before any code wave dispatches |
| RES-N15A-2 | Which naming source (3.1/3.2/3.3) the checkbox uses | The owner (product fork - section 3) | N15a-0's escalation | N/A - a decision | N15a-0, batched with RES-N15A-1 |
| RES-N15A-3 | Whether two rows sharing an identical `student` string corrupt each other's `edits`/`postStatus` state | N15a-4's implementer | A new test asserting independent edits to two same-named rows do not cross-write (`GradingResults.tsx`'s `edits[r.student]` pattern, section 3.1) | RED today if such a test were written against the current keying with two colliding labels - not yet written, because no wave yet produces two same-named rows in one table | N15a-4, no later than the wave that first makes accumulation (reading a) or multi-file (reading b) real |
| RES-N15A-4 | The checkbox's `ta-` persisted key has no exact-set canary | N15a-5's implementer | A new localStorage-key exact-set test, modeled on `recording-split.structure.test.ts`'s `ta-rec-*` pattern (`docs/loop/this-repo.md` section 3) - none exists yet for `GradingTab.tsx`'s own `ta-grading-source` key either (section 5) | RED if the key is read/written without a locking test; currently there is no such test for ANY `GradingTab.tsx` key, so this is a pre-existing gap the new key would inherit, not one it introduces | N15a-5 |
| RES-N15A-5 | If the rubric box is blank, a repeated-upload flow (reading a) calls `generateRubric` fresh on every single submission (`grading.ts:885-887`), so successive students could be graded against DIFFERENT LLM-generated rubrics - the SCALE leverage class's whole premise ("terms held constant", `docs/loop/leverage.md` row 5) broken by the feature itself | The architect pass that designs N15a-2 | Read `generatedRubric`'s only consumer, `GradingTab.tsx:395-428` - a read-only `<details>` display, never written back into the `rubric` textbox (`grep -n "setRubric(state.generatedRubric" src/app/components/GradingTab.tsx` returns nothing, confirmed by reading the whole `generatedRubric` block) | N15a-2, before it ships: either require the rubric field to be non-blank to enter per-upload mode, or pin the first generated rubric client-side for the rest of the session |
| RES-N15A-6 | The smooth-scroll-on-every-run effect (`GradingTab.tsx:173-177`) still fires on every submission, dragging the viewport away from the file input once per student in an accumulating flow - re-verified on today's tree, not carried from the row's stale note (which cited `:150-155` against a since-shifted file) | N15a-2's implementer | Read `useEffect(() => { ... scrollIntoView ... }, [run])` and confirm it still depends on `run` alone | N15a-2 - the same wave that builds the accumulator should also decide whether repeated scroll-to-top is acceptable in that mode |
| RES-N15A-7 | Whether the multi-student bulk zip (path A) stays supported alongside this feature, or whether the two identity regimes (zip's filename-convention inference vs. this feature's per-upload identity) need to be told apart downstream | The owner (the row's own note already raised this and says "do not default it"; re-confirmed here as still open, since wave 1 did not touch it) | n/a - a decision | N/A | N15a-0, batched with RES-N15A-1/2 |

**Not carried forward as a residual, corrected instead:** the row's inherited
note claims "A12's not-attempted rows depend on it for that path". Read
directly, `A12`'s own title (`docs/backlog.yml`, `id: 'A12'`) is about
grading more GitHub repos than a configured bound at once - a different
intake path (E, not A/H) with no measured connection to per-upload identity
on the zip/single-file path found in this pass. This claim does not survive
contact with the tree and is dropped rather than carried as a residual with
no instrument.

---

## 8. Disposition of the row's inherited findings

The row (`docs/backlog.yml`, `id: 'N15a'`) carries three findings "an
architect pass must carry" plus a budget-sizing note, all dated 2026-09-15,
before wave 1 shipped. Each is re-measured here against today's tree rather
than inherited.

| Prior finding | Disposition | Evidence this pass |
|---|---|---|
| (1) `GradingTab.tsx:150-155` smooth-scrolls on every run change | **KEPT, line re-pinned to `:173-177`.** Still true; wave 1 did not touch this effect. See RES-N15A-6 | `awk 'NR>=171&&NR<=178' src/app/components/GradingTab.tsx` |
| (2) `DEFAULT_SORT` inserts alphabetically, not at the end | **KEPT verbatim, citation confirmed current** (`gradingResultsHelpers.ts:99-101`). See section 6.1 | `awk 'NR>=95&&NR<=105' src/app/components/grading-results/gradingResultsHelpers.ts` |
| (3a) `gradeStudentEntries` hardcodes `fullCreditChecklist: []` (engine.ts:276 at filing time) | **SUPERSEDED for the single-upload path.** `gradeEntries` (the function wave 1 calls, `engine.ts:457-465`) is a thin wrapper over `gradeStudentEntries`, whose hardcoded `[]` (now at `engine.ts:398`) is OVERWRITTEN by the caller: `grading.ts:897-902` runs `Promise.all([gradeEntries(...), synthesizeFullCreditChecklist(...), generateSampleAnswer(...)])` and returns `{ ...run, fullCreditChecklist, sampleAnswer }` - the same pattern the zip path already used. Wave 1 does not ship a degraded checklist | `grep -n "fullCreditChecklist: \[\]" src/lib/grade/engine.ts`; `awk 'NR>=888&&NR<=903' src/app/actions/grading.ts` |
| (3b) if the rubric box is blank, each upload generates its own rubric | **KEPT and STILL OPEN for any repeated-upload build (reading a).** Not touched by wave 1, since wave 1 handles exactly one upload. Restated as RES-N15A-5 with the exact non-write-back citation | `grading.ts:885-887`; `GradingTab.tsx:395-428` |
| Phone-photo sizing vs. `UPLOAD_WIRE_BUDGET_BYTES` | **UNCHANGED, and now applies to the single-upload path too.** `checkFileWireBudget` is called for both `uploadKind` values at `grading.ts:837-843`, with the refusal message naming which was uploaded. The 3.5MB budget and base64's 4/3 inflation are exactly as `docs/a39-waves.md` section 0.1 measured; nothing in wave 1 changes the arithmetic, it only makes the single-file case subject to the SAME check the zip case already had | `awk 'NR>=818&&NR<=843' src/app/actions/grading.ts` |
| "each student will have their own zip" (owner, 2026-09-15) confirms the per-upload-identity premise | **CARRIED**, not re-litigated - this is an owner statement, not a measured fact to dispute | n/a, quoted from the row itself |
| A12 dependency claim | **DROPPED**, see section 7's note | `docs/backlog.yml`, `id: 'A12'` |

No prior requirement in the row is silently dropped: everything above is
either kept with a re-measured citation, found superseded by wave 1 with the
line showing why, or dropped with the tree-read reason given.

---

## 9. The leverage question

Per `docs/loop/leverage.md`: name the mechanism, not the benefit, and say
what survives on the built tree - not memory, and not "LMS write-back" or
"the app remembers", both of which a research pass already falsified for
adjacent features this session (per this brief's own instruction not to
claim them here).

**What plausibly survives, IF this ships with a real naming source (3.2) and
the SCALE fix in RES-N15A-5:**

- **PROVENANCE (a narrower cut of CORPUS).** If reading (a) or (b) records
  which literal upload produced which row - the exact file that arrived, not
  just a name string - that is a typed record a chat transcript is not: a
  chat has no notion of "this answer came from this specific file", only a
  pasted blob. This is earned only if the built version actually keeps the
  file (or its hash/name) attached to the `GradeResult` past the moment of
  grading, not merely displayed once. `StudentSubmissionEntry.submittedFiles`
  (`single-file-entry.ts:79-88,116-125`) already carries `name`, `rawBase64`
  and `mimeType` per file, and `GradeResult` types already reference
  submitted files (`grade/types.ts` - not re-derived line by line here since
  this is a residual, not a built claim); whether that reaches something a
  LATER act reads back is the actual test, not asserted here.
- **CONSISTENCY (a named instance of SCALE), conditionally.** If the rubric
  is pinned once (RES-N15A-5's fix) and every subsequent single upload in the
  session is graded against that same, unchanging rubric, that is the SCALE
  class: "the same rigorous act, terms held constant, run N times"
  (`docs/loop/leverage.md` row 5). **This is not automatic** - section 9's
  own measurement (RES-N15A-5) shows the UNFIXED version actively VIOLATES
  this class rather than earning it, which is the opposite of a leverage
  claim and must be said plainly if N15a-2 ships without that fix.
- **What does NOT survive, and must not be claimed:** memory across
  sessions (nothing here persists past the page load any differently from
  today's zip path - `useActionState`'s replace semantics apply whether or
  not accumulation is added on top, since accumulation would live in
  component state, not a database row), and LMS write-back (posting grades
  to Canvas is an existing, separate capability on `GradingResults.tsx`, not
  something this row adds or changes).
- **Click-cost, named as what it is, not dressed up.** Section 4 already
  shows reading (a) is a click-cost REGRESSION relative to the neighboring
  zip path, not an advantage. If N15a ships reading (a) anyway, the honest
  leverage claim is that it lets an instructor grade AS SUBMISSIONS ARRIVE
  (an office-hours, one-at-a-time workflow) rather than waiting to batch
  them into a zip - a real but narrow claim about WHEN grading can start,
  not about how many clicks it costs. That is worth stating explicitly
  rather than silently, per `docs/loop/leverage.md`'s worked negative
  example.

**What I could not determine:** whether an instructor's actual workflow is
closer to "students hand me files one at a time during office hours" (which
would make reading (a)'s per-submission cost worth paying for the timing
advantage) or "I collect everything then grade" (which the zip path already
serves better on every axis measured). This is a product fact about how the
owner works, not something derivable from the tree, and belongs in the same
batched question as RES-N15A-1/2/7.

---

## 10. What this environment could not verify

Per `docs/loop/this-repo.md` section 6: no component renders under vitest
here, so every claim above about what an instructor sees, clicks, or scrolls
past is a READING claim, not an executed one - including the interaction
counts in section 4, which follow the census's own stated methodology but
were not observed in a running browser. There is no live database, no API
key, and no way to execute `generateRubric` or confirm what two real LLM
calls with the same prompt would actually return - RES-N15A-5's finding is
about the CODE PATH (a fresh call is issued), not about whether that call's
output would differ in practice.

---

## 11. Verification run for this document

```
npm run test:paths -- src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts
  -> Test Files  2 passed (2)
     Tests  21 passed (21)
     COVERED src/lib/no-emojis.test.ts files=1 passed=18
     COVERED src/source-bytes.structure.test.ts files=1 passed=3
     exit 0

tr -d -c '\000' < docs/n15a-scope.md | wc -c
  -> 0   (no NUL bytes in this file)

LC_ALL=C grep -n '[^ -~TAB]' docs/n15a-scope.md   (TAB = a literal tab byte in the
                                                    bracket expression, not the
                                                    three letters shown here)
  -> no output, exit 1 (no non-ASCII byte in this file)
  canary (same instrument, a planted em-dash in a scratch file): exit 0,
  one match printed - proves the pattern actually fires when the byte
  is present, rather than passing by never matching anything

git status --short
  -> M docs/css-orphans.md      (pre-existing at session start, not touched here)
     ?? docs/n15a-scope.md      (this document; the only file this pass wrote)
```
