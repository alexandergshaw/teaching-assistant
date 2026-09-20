# A8-R scope: recognition on the screen-capture surface (routes b + e)

## RE-VERIFICATION PASS, 2026-09-20 (post-A16-2)

**Why this section exists.** Revision 2 below (committed `5b85ca6`, 12:06:23)
predates A16-2 (`e9670d1`, 14:34:55 the same day) by about two and a half
hours. A16-2 touched 18 files (`git show --stat e9670d1`), and
`comm -12 <(sort -u a16-2-files) <(sort -u a8r-owns-files)` shows **all 18**
intersect A8-R's `owns` list (44 paths at HEAD - Revision 2 stated 45; see
(d) below for the arithmetic correction) - A16-2 edited nothing A8-R does not
already claim. This pass re-measured every `file:line` below against HEAD
(`git rev-parse HEAD` at measurement time: same as the tip of `main` at
session start) rather than carrying Revision 2's citations forward.

### (a) Citations that drifted - old value, new value, cause

All drift below is a mechanical line-number shift caused by A16-2 inserting
lines above the cited point in the same file; no cited symbol moved to a
different file and no cited literal's shape changed apart from
`GradingRow`/`GradingRecordingFeedback` gaining `rubricAreas`. Re-opened every
one at HEAD; command shown is `sed -n` / `grep -n` on the file named.

| Citation (Revision 2) | Old | New (HEAD) | Delta | Cause |
|---|---|---|---|---|
| T3, merge's new-entry factory | `grading-capture-sync.ts:142` | `:145` | +3 | A16-2 added a 3-line `rubricAreas` field + comment to `blankGradingRow` (lines 82-84), above this point |
| T5, blank row builder | `grading-capture-sync.ts:69-82` (12 fields) | literal now spans `69-85` (**13** fields: the same 12 plus `rubricAreas: []` at `:84`) | +3 to the close | Same insertion. The cited range no longer bounds the whole literal - it now stops one field short |
| T6, refresh branch | `grading-capture-sync.ts:162` | `:165` | +3 | Same insertion, above this line too |
| T7, `interface GradingRow` | `grading-row.ts:114-200` | opens unchanged at `114`, closes at `224` (was `210` before A16-2 - Revision 2's `200` was already a 10-line rounding, now a 24-line one) | open +0 / close +14 | A16-2 appended a 14-line `rubricAreas` field + JSDoc as the interface's last member |
| T11, grade action's parameter type | `grading-submission-grade.ts:120` | `:123` | +3 | A16-2 rewrote the file's header comment (`:6-26`), net +3 lines above the function signature |
| T11, `buildGradingRecordingPrompt` call | `grading-submission-grade.ts:149-154` | `:152-157` | +3 | Same header rewrite |
| G-R1 object / literal cite | `grading-feedback-prompt.ts:101-108` (function), `:108` (template line) | function now `112-120`, template line `:119` | +11 | A16-2 inserted an 11-line `rubricAreas` field + JSDoc into `GradingRecordingFeedback`, which sits above `buildGradingRecordingPrompt` in this file |
| A11 coupling cite (section 8) | `grading-feedback-prompt.ts:78` (`buildSystemPrompt("", rubricText, criteria)`) | `:89` | +11 | Same insertion |
| Frozen-oracle bare literals | `grading-row-serialization.test.ts:392, :411, :434, :453` (`nameMatch:` in each of the 4 oracle rows) | `:393, :416, :440, :460` | +1, +5, +6, +7 (cumulative) | A16-2 added `rubricAreas: []` (plus a 3-line comment on the first row only) inside each of the 4 literals in `oracleRows` |
| `buildGradingRecordingLogRowEntry` test | `grading-recording-log.test.ts:56-82` (describe block), `:72` (`expect(entry).toEqual({`) | describe now `:57-83`, assertion now `:73` | +1 | A16-2 added one line (`rubricAreas: []`) to the `row()` factory above this block |
| Suite baseline | `find src -name "*.test.ts" \| wc -l` = **1071** (Revision 2, re-confirmed there against its own tree) | `git ls-files 'src/*.test.ts' 'src/**/*.test.ts' \| sort -u \| wc -l` = **1072** at HEAD | +1 | Not A16-2: `src/lib/grade/prompts-praise-routing.test.ts` landed from the disjoint A11 item between the two commits (`git log --oneline 5b85ca6..HEAD --diff-filter=A --name-only -- '*.test.ts'`). **Do not use the raw `find`/working-tree count (1074)** - it also picks up two `.test.ts` files that are untracked, mid-flight work from a concurrently running agent this session must not read or rely on (`git status --short` shows `?? src/app/components/grading-results/classTrendsEntry.test.ts` and `?? .../gradingResultsDisplayHelpers.test.ts`) |

**Confirmed exactly unchanged, re-opened at HEAD, no drift:** T1
(`grading-submission-extract.ts:170`), T2 (`grading-submission-merge.ts:54-57`),
T4 (`grading-submission-merge.ts:417-420`), T8 codec (`grading-row-serialization.ts:137-171`
toWire, `:181+` fromWire - Revision 2's `:180+` already read as "and onward"),
T9 (`grading-capture-tombstones.ts:123` open, `:129-134` live, `:137`
tombstone - this file itself was not touched by A16-2, only its test gained
1 line), T10 (`GradingRecordingPanel.tsx:561-565`), all 9 factory-base
citations in section 4.3 (`copy-feedback.test.ts:32`,
`grading-capture-sync.test.ts:6`, `grading-capture-tombstones.test.ts:76`,
`grading-recording-log.test.ts:18`, `grading-row-serialization.test.ts:64`,
`grading-row.test.ts:36`, `grading-rows.test.ts:44`, `cross-course.test.ts:119`,
`offline-assembly.test.ts:44` - all 9 are in files A16-2 also edited, but every
insertion landed *inside* the returned object literal, after the `function`
line these citations point at), both production-builder citations
(`grading-capture-sync.ts:68` `blankGradingRow`, `offline-payload.ts:178`
`buildGradingRow`), `grading-extraction-prompt.ts:64-105` / `:97`, the
`snapshot-role-setrole-callsites.structure.test.ts` model (71 lines, exists,
shape matches as described), `buttonVariant.test.ts:157` pinning
`GradingRecordingPanel.tsx` at 3, `ALLOWED_OVERAGE` (still no entry for the
panel), and `docs/css-orphans.md` (still no `GradingTable.module.css` entry).

**GradingRecordingPanel.tsx wave-0 arithmetic - re-measured, unchanged.**
`@(Get-Content src\app\components\grading-recording\GradingRecordingPanel.tsx).Count`
and `wc -l` on the same path both return **995** (they agree here - this run
shows none of the 42-line disagreement `this-repo.md` section 3 warns about on
this file; that warning was measured on 2026-09-13 against a then-964-line
version of the same file, so it is now stale on the count but the instrument
choice it mandates still stands). `grep -n "setLogGradingRuns"` returns the
same four line numbers Revision 2 cites - `544, 574, 604, 611` - and the four
blocks still close at `555, 585, 607, 622` respectively: `12 + 12 + 4 + 12 =
40`, exactly as kept. `GradingRecordingPanel.tsx` is not in A16-2's 18-file
list and `git status --short` shows it clean, so it was never at risk.

**Task-framing mismatch, flagged rather than silently resolved.** The brief
for this pass characterizes A8-R's wave-0 extraction as removing "~40 lines
from above the call sites" in **`grading-submission-extract.ts` and
`grading-submission-grade.ts`**. Revision 2 contains no such plan anywhere -
its only wave-0 extraction is the panel arithmetic just above, in a different
file. Searching the whole repo
(`grep -rn "extracts ~40 lines\|above both call sites" docs/ src/`) finds the
phrase in exactly one place: a comment at `grading-submission-grade.ts:109-112`
("A pending chunk extracts ~40 lines from above both call sites, so accurate
numbers here would be stale inside the same commit that adds them"). That
comment is **not** echoed in `grading-submission-extract.ts` (no matching
comment there), is not referenced by any `docs/*.md` file, and does not match
any chunk boundary in this document. I measured both files anyway, as asked:
`wc -l` and `@(Get-Content <file>).Count` agree on both -
`grading-submission-extract.ts` is **192** lines, `grading-submission-grade.ts`
is **195** - neither is near the 1000-line ceiling and neither has an
extraction proposed against it here. I am not inventing a wave-0 chunk to match
the brief's framing, per this repo's own recorded rule against briefing from a
comment instead of the tree; the comment itself may be a stale forward-note (of
exactly the kind this file's own docstring at `:114-120` warns readers not to
trust) or may describe a future, not-yet-written chunk. Recorded as **RES-8**
below rather than acted on.

### (b) Chunk boundaries that moved

**None.** Wave 0 (panel headroom), Wave 1 (type + transport, T1-T9), and Wave 2
(surface + prompt) keep the same file sets and the same gate conditions. The
citation drift in (a) is corrected in place throughout the sections below; none
of it changed which wave a file belongs to, which fields are required, or the
shape of any guarantee.

### (c) What A16-2 invalidated outright

**Nothing in Revision 2's stated requirements.** Checked specifically because
the brief named two candidates:

- **The action's key-set oracle (6 keys -> 7, `rubricAreas` added, one
  `not.toHaveProperty("rubricAreas")` assertion deleted).** Confirmed exactly
  as described (`git show e9670d1 -- src/app/actions/grading-submission-grade.test.ts`).
  Revision 2 never asserts against that 6-key shape anywhere in this document
  - grep of this file for the six field names as a set, or for "6 keys",
    returns nothing - so there is nothing here for that change to invalidate.
- **The frozen 16-key wire oracle** (`grading-row-serialization.test.ts:679-696`,
  `EXPECTED_WIRE_KEYS`). Confirmed still exactly 16 keys, and confirmed
  deliberately so: `fromWire` emits `rubricAreas: []` unconditionally and
  `toWire` does not enumerate the key at all (`grading-row-serialization.ts:171`'s
  return object; A16-2's own comment at the `fromWire` site states this is
  because the run cohort is `useState`-only and does not survive a reload). Not
  undone by anything in Revision 2.

**One real gap this pass found, not caused by A16-2 but exposed by re-deriving
against it (recorded as an addition, not a redesign).** Revision 2's own TR-1
(section 4) commits all three of `suggestedSubmissionKind`,
`submissionKindCue` and `submissionKind` to "go through `toWire`/`fromWire`
(T8) and therefore survive a reload" - i.e. Wave 1 must add three keys to
`EXPECTED_WIRE_KEYS`, taking it from 16 to **19**. Revision 2 states this
consequence nowhere as an explicit pass condition (contrast
`grading-recording-log.test.ts:57-83`'s exact-object assertion, which section 6
explicitly calls out: "will red on the addition; bump it in the same
commit"). A16-2 just demonstrated the identical pattern one field at a time
(6->7 keys on a sibling oracle) and is the direct precedent for how this must
be done. Added as pass condition **W1-WIRE** in section 4.1 and to the Wave 1
gate in section 11, rather than left implicit.

### (d) Verdict

**READY TO DISPATCH**, with three small fixes made in place by this pass (the
citation corrections in (a), now applied throughout the body below; the new
W1-WIRE pass condition; and an arithmetic correction to the `owns` total, 45 ->
44 - re-summed as `3 + 26 + 4 + 7 + 4 = 44` from Revision 2's own four
sub-lists, `sort -u` of all 44 paths confirms no duplicate), and two items an
implementer does not block on but the orchestrator should close before or
alongside dispatch:

- **RES-7's status is inconsistent inside this repo's own record.** The
  residual register below (section 10) still lists RES-7 open ("before either
  chunk is dispatched"), but the commit that shipped this very file,
  `5b85ca6`, says in its own message: "RES-7 discharged... Re-intersected per
  path - the only textual hit is the sentence in which A8-R states it does NOT
  own that file, with a canary proving the search finds a path that is
  genuinely there." I did not independently re-run that intersection myself
  (A11's own path list is not enumerated in one place I could mechanically
  diff against in the time this pass had), so I am not marking it resolved on
  the strength of the commit message alone. Recorded as **RES-7 (status
  disputed)** - the orchestrator should reconcile the doc against its own
  commit message before A8-R and A11 run concurrently.
- **RES-8 (new).** The uncorroborated `grading-submission-grade.ts:109-112`
  comment from (a) above. Owner or orchestrator should confirm whether it
  describes a real, separately-scoped chunk (A8-P?) or is stale prose; either
  way it is not part of Revision 2's plan and this pass did not treat it as
  one.

Everything else - the disposition table, the leverage claim, the INV
confirm-per-row model, the three guarantees and the non-guarantee, the CUE
mechanism, the transport table's shape (only line numbers moved), the
required-field decision and its argument, the wave plan, and the residual
register apart from RES-7/RES-8 - is unchanged in substance and re-confirmed
against HEAD by the measurements above.

---

Revision 2, 2026-09-20. Round 1 existed only as agent text; the round-1 check
returned DEFECTIVE with 6 blockers and a stopping point of RULINGS, and could
not audit a disposition table because there was no file to audit. This is that
file. The sibling A11 item hit the same wall two rounds earlier and fixed it the
same way (`docs/a11-scope.md`).

**The owner's words define done**, quoted from `docs/backlog.yml` row A8:
"canvas split out the intitial posts from the replies, but this app should
recognize the replies as being replies and ot mark them as original posts".

**Scope.** Routes (b) screen-capture extraction and (e) screen-capture grading,
merged into one chunk by the top tier's re-chunk because the seam between them
cuts one correctness property in half. Routes (a) and the zip-upload path
(`src/app/actions/grading.ts:871` `gradeSubmissions`) belong to A8-P, which is
sequenced AFTER this chunk and imports the union this chunk declares. Routes (c)
and (d) are residuals with owners, below.

**Every quantity below names the command that produced it.** Where a quantity
was inherited rather than re-measured by this pass, it says so and names who
must re-measure it.

---

## 0. Disposition table (audit this first)

`iteration-caps.md` entry gate 3 requires a restructuring round to ship a table
mapping each prior requirement to kept / revised / withdrawn / handed over.

**A limit on this table, stated before it rather than discovered inside it.**
Round 1 was never written to disk (that is blocker-class material the round-1
check itself raised), so I cannot enumerate its requirements from the artifact.
Every row below is reconstructed from the two authoritative records I do have:
the fourteen rulings A-N in `docs/backlog.yml` row A8 (read in full), and the
revision brief that carries the round-1 check's measured findings. **A round-1
requirement that neither source names is not in this table and I cannot know
that.** Residual RES-6 owns closing that gap, with the round-1 check's own
blocker list as the instrument.

| # | Round-1 requirement | Disposition | Where it went |
|---|---|---|---|
| D1 | Home-of-record finding: `seedTrackedFromRows` maps exactly four fields, so anything living on `TrackedSubmission` alone evaporates on reload | **KEPT** verbatim, id **HOR** | Section 4. Re-measured here: `grading-capture-tombstones.ts:129-134` (live) and `:137` (tombstone), four fields each |
| D2 | Wave-0 arithmetic: panel at 995 lines; four `setLogGradingRuns` blocks totalling exactly 40 lines; neither candidate extraction touches a hook | **KEPT**, id **W0-A** | Section 7. Independently re-measured and it agrees exactly (995; 12+12+4+12 = 40) |
| D3 | Suite baseline 1071 test files / 21297 tests | **KEPT for the file count, RESIDUAL for the test count**, ids **W0-B**, **RES-5** | File count re-measured here with my own instrument (1071). The test count cannot be produced without running the suite, which I deliberately did not do - section 9 |
| D4 | The two label citations `GradingTableRow.tsx:250` and `:258` | **KEPT**, id **L-CITE** | Section 3. Both opened and confirmed |
| D5 | Confirmation model is INVERTED relative to snapshot: the model suggests at extraction, the instructor confirms per row, because this surface has no pre-capture per-submission moment | **KEPT**, id **INV** | Section 3 |
| D6 | The guarantee is conceded; storage versus output dichotomy; recognition cannot be code-held | **REVISED** under Ruling L. The NON-guarantee is kept exactly; the concession is withdrawn | Section 5: guarantees **G-R1**, **G-R2**, **G-R3**, plus **NG-1** which restates the non-guarantee unchanged |
| D7 | `EffectiveSubmissionKind` brand (round-1 id **G-R4**) | **WITHDRAWN** under Ruling M, on three traced paths. Enforcer it protected: nothing that executed - its only sabotage was tsc-only while this chunk's verify is `npm test`, so it sat outside its own gate | Replaced by **G-R3**, a pinned call-site canary modelled on `snapshot-role-setrole-callsites.structure.test.ts` |
| D8 | "The suggestion must render its BASIS" | **REVISED** under the brief's own finding. The basis is the CUE, not the text | Section 6: **CUE-1**, **CUE-2**, and the batch-accept eligibility rule that depends on them |
| D9 | "Written once at mint, never rewritten" | **WITHDRAWN** - it is false against `mergeExtractedSubmissions:416-421`, which rewrites `text` while keeping every other field | Replaced by **TR-4** ("the suggestion travels with the text"), section 4 |
| D10 | Optional-vs-required decision resting on a 77-object-literal figure | **REVISED**. The figure measured the wrong object. Re-measured here as **15**, not 77 and not 11 | Section 4.3. The decision is REQUIRED, and the argument is now `nameMatch`'s in-file precedent, not a cost count |
| D11 | Wave-0 target of 960, asserted with no derivation | **REVISED** to **965**, derived | Section 7 |
| D12 | "Three source headers forbid that crossing" | **REVISED**: the conclusion holds, two of the three citations do not | Section 2.3. Only `snapshot-shot.ts:6-9` is on point; the layering argument is made explicitly |
| D13 | `owns` list (round 1 carried 18 paths; Ruling N sets a floor of about 35) | **REVISED** upward. Derived here with my own instruments and it exceeds the floor | Section 8. Four by-path readers the floor missed, plus three `src/lib/course-intel/` files |
| D14 | `seedTrackedFromRows` opens at :127 (round-1 id **m1**) | **WITHDRAWN as written, corrected** | It opens at `grading-capture-tombstones.ts:123`. Opened and confirmed |
| D15 | Route (c) and route (d) assigned to no chunk and no residual | **HANDED OVER** under Ruling J | Residuals **RES-1** and **RES-2**, section 10. Receiver: the repo owner, with instrument and step for each |
| D16 | "Route g" as a label for the zip-upload path | **WITHDRAWN** under Ruling K - the letter was never assigned by the row | Named throughout this document by its call site: `src/app/actions/grading.ts:871` `gradeSubmissions`. It belongs to A8-P |
| D17 | Transport problem (the check's B2): five hand-enumerated field lists between mint and row | **REVISED**. Measured here as **eleven hops, eight of them hand-enumerated field lists** | Section 4.1, with the contradiction against the home-of-record ruling resolved explicitly in 4.2 |
| D18 | Pass conditions phrased as a test count | **REVISED**. Every pass condition below names object, instrument and direction of failure, and every suite condition includes "RED if any test fails" | Sections 5, 7, 9 |

---

## 1. Leverage claim

`DEV_LOOP.md` requires this because A8-R builds a capability an instructor
reaches (per-row kind confirmation and a bulk accept), not only a bug fix.

**Class: GUARANTEED.** Today two code-composed outputs on this surface assert
that a reply is an original post, unconditionally and with no input from
anybody: `GradingTableRow.tsx:250` renders the literal string `Submission` above
every row, `:258` names the scroll region `Submission from ${row.studentName}`,
and `grading-feedback-prompt.ts:108` composes the model's request body with the
header `Submission:`. A8-R replaces all three with a lookup over a closed union
keyed by the kind the instructor confirmed, so for a confirmed row neither the
on-screen label nor the request body **can** say "Submission" - the bad state is
not asserted absent, it is unrepresentable through the only path that produces
those strings.

**What the instructor does instead today:** reads three rows that all claim to
be one student's submission, works out from the prose which two are replies, and
holds that in their head while grading - and the model never gets told at all,
because the request body says `Submission:` for every one of them.

**Why the class is EARNED and not inherited** (`leverage.md` failure mode B):
GUARANTEED has three instances in the whole tree per that card's own table. It
is not free here. By contrast CAPTURE is free on this surface - the screen
recorder already exists - so A8-R claims nothing on it.

**Removal test, with the deletion stated and the assertion traced**
(`leverage.md`, "Checking your own draft"): delete the
`SUBMISSION_KIND_PROMPT_LABELS[kind]` lookup in `buildGradingRecordingPrompt`
and restore the literal `Submission:`. The assertion whose observed value
changes is the per-member loop in `grading-feedback-prompt.test.ts` (G-R1,
section 5): for `kind === "reply"` the composed string would then contain
`\n\nSubmission:\n` and the frozen per-kind literal would mismatch. That
assertion's value is changed by that deletion, so it is a removal test.

**Honest limit.** The LABEL half of the claim (G-R2) is only half as strong as
the prompt half, and section 5 says why rather than letting them read as equals.

---

## 2. What is actually broken, measured

### 2.1 The surface

Route (b), screen capture, is the surface the owner photographed. It is the only
route whose row count is per-extracted-text rather than per-student:
`ExtractedSubmission` is `{name, text}` (`grading-submission-merge.ts:54-57`),
`isSameSubmission` (`:301-324`) needs a name match AND text similarity, and
nothing groups by name - so one author's introduction plus two replies stay
three rows. Route (e) is that surface's grading half.

Two prior A8 passes concluded no such surface exists, both times by grepping the
Canvas-discussion data layer. `traps-search.md` already records the first. This
pass searched by what the surface holds, not by type name.

### 2.2 The three literals

| Locus | What it says today | Command |
|---|---|---|
| `GradingTableRow.tsx:250` | `<span className={styles.ghMeta}>Submission</span>` | `sed -n '250p'` |
| `GradingTableRow.tsx:258` | `aria-label={`Submission from ${row.studentName}`}` | `sed -n '258p'` |
| `grading-feedback-prompt.ts:108` | `` return `${systemPrompt}\n\nStudent: ${studentName}\n\nSubmission:\n${submissionText}${knowledgeBlock}`; `` | `sed -n '108p'` |

`GradingTableRow.tsx:259` renders `row.submissionText` in full one block below
:258. That is why the basis requirement had to change - section 6.

`GradingTable.tsx:170` renders "Showing N of M submissions", but `:168` gates it
on `filterText.trim() !== ""`, so it is on screen only while the instructor is
typing. It is not the photographed label and A8-R does not touch it.
(Command: `sed -n '167,175p' src/app/components/grading-recording/GradingTable.tsx`.)

### 2.3 Where the new type lives, and the citation correction

Round 1 said "three source headers forbid that crossing". Opened, all three:

- `grading-submission-merge.ts:9-13` - forbids reusing `mergeCapturedPosts` /
  `isSamePost` from `src/app/components/recording/discussion-capture.ts`. That
  is the DISCUSSION-CAPTURE helpers, not the snapshot directory. **Not on point.**
- `grading-extraction-prompt.ts:9-14` - forbids parameterising
  `buildPostExtractionPrompt` from `src/lib/discussion-reply-prompt.ts`. Same
  family. **Not on point.**
- `snapshot-shot.ts:6-9` - "this is a SECOND capture surface sharing
  engine-shaped ideas with grading-recording, not a mode of it - so this file
  does not import from grading-recording". **On point**, and it is the only one.

The conclusion survives, but it now has to be argued rather than cited, and here
is the argument, in three parts:

1. `snapshot-shot.ts:6-9` states the rule in the snapshot-to-grading direction.
   The reverse crossing is not literally banned by it, but the same file's
   `MAX_SHOTS` doc comment (`:39-41`) states the governing rule generally -
   "this feature's OWN cap - never GRADING_EXTRACT_BATCH_SIZE or any other
   feature's constant (R4b: one owner per feature-scoped constant)". A
   feature-scoped closed union is that same kind of object.
2. `SnapshotRole` is the wrong set anyway. It has six members
   (`snapshot-shot.ts:27`) - `assignment`, `rubric`, `post`, `replies`,
   `submission`, `other` - and those are roles of a SHOT, not kinds of a
   submission. Importing it would force A8-R to carry four members it can never
   produce.
3. A8-P imports the union A8-R declares. Importing from `snapshot-grading`
   would make the LMS grading path transitively depend on a capture surface it
   has nothing to do with.

**Decision: a fresh leaf at `src/lib/grade/submission-kind.ts`.** That layer is
already imported by `grading-feedback-prompt.ts:25-33` (three imports from
`@/lib/grade/*`), by `grading-row.ts` and by `grading-rows.ts`, and seven client
components under `src/app/components` already import from `@/lib/grade`
(`grep -rln '"use client"' --include="*.tsx" src/app/components | xargs grep -ln '@/lib/grade'`
returns 7 files). So this is an established crossing, not a new boundary. The
new file must stay pure - no `"use server"`, no node builtins - because a client
component (`GradingTableRow.tsx`) will import it.

---

## 3. The model: suggest at extraction, confirm per row

**INV (kept).** The snapshot surface arms a role by keypress BEFORE capture
(`snapshot-keys.ts:24`, `snapshot-shot.ts:130`), and
`snapshot-role-suggestion.ts:8-13` states in bold that a suggested role must
never become the effective role without an explicit instructor action. This
surface sweeps many submissions in one capture and has no per-submission moment
before capture, so it cannot copy the arming half. It inverts the order: **the
model suggests at extraction, the instructor confirms per row.** The
never-auto-apply half is kept unchanged.

### The type

```
// src/lib/grade/submission-kind.ts  (NEW, wave 1)
export type GradingSubmissionKind = "initial-post" | "reply" | "other" | "unknown";
export const SUBMISSION_KINDS: readonly GradingSubmissionKind[] =
  ["initial-post", "reply", "other", "unknown"];
export function coerceSubmissionKind(raw: unknown): GradingSubmissionKind;   // wave 1
export const SUBMISSION_KIND_LABELS: Record<GradingSubmissionKind, string>;  // wave 2
export const SUBMISSION_KIND_PROMPT_LABELS: Record<GradingSubmissionKind, string>; // wave 2
export function submissionKindLabel(kind: GradingSubmissionKind): string;    // wave 2
```

`"unknown"` maps to today's strings - label `Submission`, prompt header
`Submission`. Every other member maps to something else. That single fact is
what makes G-R1 and G-R2 provable, and it is also what makes A8-R a **no-op on
the model request body until an instructor confirms something** (section 5,
G-R0).

### The three fields on `GradingRow`

| Field | Written by | Read by |
|---|---|---|
| `suggestedSubmissionKind: GradingSubmissionKind` | extraction only, via the transport chain | the row UI, to offer a confirmation |
| `submissionKindCue: string` | extraction only, same chain | the row UI, and the batch-accept eligibility rule |
| `submissionKind: GradingSubmissionKind` | **an instructor click only** | the label, the prompt, the run log |

`submissionKind` starts at `"unknown"` and no machine path ever writes anything
else to it. "Confirmed" is therefore a property of the VALUE
(`submissionKind !== "unknown"`), not a parallel boolean that can desync from
it. This is the construction that makes Ruling L's guarantee statable at all.

**Why this also kills the `??` footgun Ruling M found.** Ruling M's first traced
path was that `label(row.submissionKind ?? row.suggestedSubmissionKind)`
compiles, because `??` is the natural thing to write against an optional field.
All three fields are REQUIRED (section 4.3), so there is no optional field to
write `??` against. That is a second, independent reason for REQUIRED beyond the
one in 4.3.

---

## 4. Transport: mint to row to prompt

### 4.1 The measured chain

Instrument: read each file end to end and record every declaration or literal a
new field must be added to for the value to survive the hop. The brief named
five; **measured here as eleven hops, eight of them hand-enumerated field
lists.** `traps-spec.md` rules that a handed-over enumeration is a floor, so this
set was derived rather than inherited; the three it adds to the brief's five are
marked NEW.

| # | Hop | Shape | Lines |
|---|---|---|---|
| T1 | mint: the extraction action builds the element | literal `{ name, text: truncated }` | `grading-submission-extract.ts:170` **(NEW)** |
| T2 | the extracted type | `interface ExtractedSubmission` | `grading-submission-merge.ts:54-57` |
| T3 | merge's new-entry factory | literal `{ name, text, rowId, dismissed }` | `grading-capture-sync.ts:145` (re-measured post-A16-2; was `:142`) |
| T4 | merge's fold branches | `{ ...s, text: joined }` / `{ ...s, text: submission.text }` | `grading-submission-merge.ts:417-420` **(NEW)** |
| T5 | the blank row builder | now a **13**-field literal (12 original + A16-2's required `rubricAreas: []`) | `grading-capture-sync.ts:69-85` (re-measured post-A16-2; was `:69-82`, 12 fields) |
| T6 | the refresh branch | `{ ...existingRow, studentName, submissionText }` | `grading-capture-sync.ts:165` (re-measured post-A16-2; was `:162`) |
| T7 | the row type | `interface GradingRow` | `grading-row.ts:114-224` (re-measured post-A16-2; opens unchanged at `114`, closes at `224` - A16-2 appended `rubricAreas` as the interface's last member. Was cited `114-200`, itself already a 10-line rounding pre-A16-2) |
| T8 | the codec | `toWire` 16 keys / `fromWire` | `grading-row-serialization.ts:137-171` and `:181+` (re-measured; unchanged, A16-2's addition landed inside `fromWire`'s body, after its opening line) |
| T9 | the reload seed | 4-field literals, live and tombstone | `grading-capture-tombstones.ts:129-134`, `:137` (re-measured; unchanged, this `.ts` file untouched by A16-2) |
| T10 | the panel's grade map | `{ id, studentName, submissionText }` | `GradingRecordingPanel.tsx:561-565` (re-measured; unchanged) |
| T11 | the grade action's parameter type | `ReadonlyArray<{ id; studentName; submissionText }>` | `grading-submission-grade.ts:123` **(NEW)** (re-measured post-A16-2; was `:120` - A16-2 rewrote this file's header comment, net +3 lines above the signature) |

Then the composer itself: `buildGradingRecordingPrompt`
(`grading-feedback-prompt.ts:112-120`, re-measured post-A16-2; was `:101-108`
- A16-2 inserted an 11-line `rubricAreas` field into `GradingRecordingFeedback`,
which sits above this function in the same file), called at
`grading-submission-grade.ts:152-157` (re-measured post-A16-2; was `:149-154`)
with four positional arguments.

**New pass condition, W1-WIRE (added by this re-verification pass, not present
in Revision 2).** TR-1 below commits `suggestedSubmissionKind`,
`submissionKindCue` and `submissionKind` to travel through T8. That widens
`EXPECTED_WIRE_KEYS` (`grading-row-serialization.test.ts:679-696`) from its
current, re-confirmed **16** entries to **19**. A16-2 is the direct precedent
for exactly this move, one field at a time, on the sibling action oracle
(6 keys -> 7, section 0 above).
- Object: `EXPECTED_WIRE_KEYS` and the two `toEqual(EXPECTED_WIRE_KEYS)`
  assertions that use it (`grading-row-serialization.test.ts:698-701`,
  `:703-706`).
- Instrument: `npm test` running `grading-row-serialization.test.ts`.
- Direction of failure: **RED** if `toWire`'s output ever carries a key not in
  the updated 19-key list, or if the list is not bumped in the SAME commit
  that adds the three fields to `toWire`. `fromWire` also needs a
  `VALID_SUBMISSION_KINDS` coercion set, mirroring `VALID_NAME_MATCHES`
  (section 4.3), so a legacy stored row with none of the three keys
  deserializes to `"unknown"` rather than `undefined`.

**Why nothing red-lines if you get this wrong.** TypeScript is structural, so an
extra property on an incoming object passes through T2 and T11 and is never
read. T3 and T5 hand-list their fields, so they silently drop it. And the one
oracle that looks like it guards the codec -
`grading-row-serialization.test.ts:679-696` `EXPECTED_WIRE_KEYS` (re-measured
post-A16-2; same still-16-entry list Revision 2 cited at `:620-641` - only the
range moved with the rest of the file), a hand-written 16-key list compared
with `expect(Object.keys(wire)).toEqual(EXPECTED_WIRE_KEYS)`
- reds **only if you DO add a key to `toWire` without listing it here**. It
never reds if you forget the field entirely. Ruling N is exactly right about
this and it is the reason T1-T11 have to be listed as a set rather than
discovered one wave at a time. See pass condition W1-WIRE (section 4.1): this
is the exact list A8-R's own three new fields must widen, 16 to 19.

### 4.2 The contradiction, resolved

The brief states it sharply: "written once at mint" is unimplementable without
changing `makeEntry`'s and `blankGradingRow`'s signatures, and the only
transport crosses `TrackedSubmission`, which the home-of-record ruling says
nothing may live on. Both halves are true. The resolution is a distinction the
round-1 text never drew:

**HOR, restated precisely.** `seedTrackedFromRows`
(`grading-capture-tombstones.ts:123-138`) rebuilds the whole accumulator from
`GradingRow[]` plus the persisted tombstones, mapping exactly four fields. So
anything whose ONLY copy after a reconcile is on `TrackedSubmission` evaporates
on the next reload. HOR forbids `TrackedSubmission` being a **home of record**.
It does not forbid a value passing THROUGH it.

**TR-1.** `GradingRow` is the home of record for all three fields. All three go
through `toWire`/`fromWire` (T8) and therefore survive a reload.

**TR-2.** `TrackedSubmission` carries `suggestedSubmissionKind` and
`submissionKindCue` as TRANSIT only, and `seedTrackedFromRows` reads both back
off the row at T9. The accumulator becomes a projection of the row table rather
than a second record of its own - the same construction `traps-spec.md` records
as the fix that held for the A9 tombstone ("the tombstone stopped being a RECORD
and became a PROJECTION"). Nothing evaporates because nothing is only there.

**TR-3.** `TrackedSubmission` NEVER carries `submissionKind`. The instructor's
confirmed value lives on the row alone, and the refresh branch at
`grading-capture-sync.ts:165` (re-measured post-A16-2; was `:162`) already
carries every non-read field of an existing row forward untouched (that file's
own header, `:38-41`, unaffected by A16-2: "Only the read fields
(studentName/submissionText) are refreshed here"). So a confirmed kind
survives every later re-read by construction, with no new rule.

  A tombstone entry (`grading-capture-tombstones.ts:137`) is built from a
  `DismissedSubmission`, which has no row and no kind. It gets `"unknown"`, and
  that is honest rather than lossy: a dismissed entry emits no row
  (`advanceGradingCapture` branch 1, `grading-capture-sync.ts:154-157`) and
  therefore never reaches a label or a prompt.

**TR-4, replacing "written once at mint".** `mergeExtractedSubmissions`
rewrites an entry's `text` in two branches - the continuation join
(`:417-418`) and the longer-reading replacement (`:419-420`) - while keeping
every other field. So a suggestion minted with one reading can end up attached
to a different reading's text. The rule that replaces "written once" is:

> **The suggestion and the cue travel WITH the text.** Whichever reading's text
> the entry ends up holding, that reading's `suggestedSubmissionKind` and
> `submissionKindCue` are the ones the entry holds. On the continuation-join
> branch the EARLIER reading's pair wins, because the cue this surface can
> actually observe is an opener (an `@Name`, a "Replying to" line, a thread
> position) and the opener is in the earlier reading.

This is implementable inside `mergeExtractedSubmissions`'s existing generic
signature: both fields are declared on `ExtractedSubmission`, so the fold writes
only `ExtractedSubmission`-typed fields and `T extends ExtractedSubmission` is
unchanged.

**Pass condition TR-P** (object / instrument / direction):
- Object: the entry returned by `mergeExtractedSubmissions` for each of its
  three fold branches - join, replace, keep.
- Instrument: `npm test` running
  `src/app/components/grading-recording/grading-submission-merge.test.ts`.
- Direction of failure: **RED** if, in any branch, the entry's
  `suggestedSubmissionKind` or `submissionKindCue` is not the one belonging to
  the reading whose `text` the entry now holds (earlier reading on the join
  branch). The test must range over all three branches, not a sample of them.

### 4.3 Optional versus required, re-decided on the right number

Round 1 put the cost of a REQUIRED field at 77 object literals. That measured
the wrong object: every row fixture funnels through a factory typed
`(overrides: Partial<GradingRow>) => GradingRow`, which absorbs its call sites.

**Measured here.** Two instruments, because one was not enough:

```
grep -rn 'nameMatch: "' src/                          # literal assignments
grep -rn "): GradingRow\b|: GradingRow = {|: GradingRow\[\] = \[" src/   # declared shapes
```

Then each hit was opened. The set of sites tsc reds on a new REQUIRED field:

| Kind | Count | Sites |
|---|---|---|
| Factory bases | 9 | `copy-feedback.test.ts:32`, `grading-capture-sync.test.ts:6`, `grading-capture-tombstones.test.ts:76`, `grading-recording-log.test.ts:18`, `grading-row-serialization.test.ts:64`, `grading-row.test.ts:36`, `grading-rows.test.ts:44`, `src/lib/course-intel/cross-course.test.ts:119`, `src/lib/course-intel/offline-assembly.test.ts:44` (all 9 re-opened post-A16-2 at these exact lines - unchanged, see the re-verification section at the top of this document) |
| Production builders | 2 | `grading-capture-sync.ts:68` `blankGradingRow`, `src/lib/course-intel/offline-payload.ts:178` `buildGradingRow` (both re-opened post-A16-2, unchanged) |
| Bare literals | 4 | the frozen oracle at `grading-row-serialization.test.ts:388` (unchanged), four rows (`nameMatch` now at `:393`, `:416`, `:440`, `:460` - re-measured post-A16-2; was `:392`, `:411`, `:434`, `:453`, each row having gained A16-2's required `rubricAreas: []`) |
| **Total** | **15** | |

So the true cost is **15**, not 77 and not the eleven the brief estimated. The
brief's eleven missed the tombstones factory and both `src/lib/course-intel/`
factories; those three are also missing from Ruling N's `owns` floor and are
added in section 8.

**One false positive, recorded because the next reader will hit it.**
`src/app/components/recording/discussion-table-view.test.ts:224` declares
`const rows: GradingRow[]` with `{label, note}` objects - it has its own local
`interface GradingRow` at `:220`. Any instrument keyed on the type NAME counts
it. It is not a site.

**Decision: REQUIRED**, and the argument is a precedent in the same file rather
than a cost count, because a cost count is what round 1 got wrong.

`GradingRow` has two established shapes for a new field. `course`, `assessment`,
`submissionTimeStatus` and `submittedAt` are OPTIONAL (`grading-row.ts:144`,
`:178`, `:190`, `:200`) and every one of them means UNATTRIBUTED - absence
itself carries the meaning. `nameMatch` is REQUIRED (`:125`) with a member that
means "we do not know" (`"no-roster"`), and `fromWire` coerces anything outside
the four-member set to that member
(`grading-row-serialization.ts:196-203`, `VALID_NAME_MATCHES`).

Submission kind is the second shape. `"unknown"` already expresses everything
absence could, so absence carries no information, and
`snapshot-row.ts:127-136`'s warning applies directly and is not out-weighed but
AGREED with: an optional field would make the wire enumeration and the read-side
default decorative, since a caller could omit it and TypeScript would not
object. Old stored blobs are handled the way `nameMatch` handles them - a
`VALID_SUBMISSION_KINDS` set in `fromWire`, defaulting to `"unknown"` - so
REQUIRED costs nothing in backward compatibility.

---

## 5. The guarantees

Ruling L: the guarantee is not conceded. Two code-composed outputs exist here
and both are reachable by `npm test`.

### G-R0 - byte-identity before the migration

Freeze an oracle of today's composed prompt BEFORE any of this lands
(`traps-tests.md`: "Freeze the oracle before the migration, not after"), then
assert that the `"unknown"` member reproduces it byte for byte.

- Object: `buildGradingRecordingPrompt("SYS", "Ada Lovelace", "body", undefined)`
  against a literal captured from the current tree.
- Instrument: `npm test` running `grading-feedback-prompt.test.ts`.
- Direction of failure: **RED** if the `"unknown"` output differs from the
  frozen literal by a single byte.

This is what makes the honest claim in section 1 checkable: **A8-R changes
nothing the model sees until an instructor confirms a kind.**

### G-R1 - the request body

> For a row whose kind the instructor confirmed, the model's request body
> cannot say "Submission".

`buildGradingRecordingPrompt` (`grading-feedback-prompt.ts:112-120`,
re-measured post-A16-2; was `:101-108`) is a pure leaf with no `callLlm`, no
`requireOwner` and no I/O (that file's own header, `:12-16`, unaffected by
A16-2), and it returns the request body. It gains a `kind` parameter and
composes its header through `SUBMISSION_KIND_PROMPT_LABELS[kind]`.

- Object: the string returned by `buildGradingRecordingPrompt`, called with a
  fixed sentinel `systemPrompt` so the assertion cannot be confused by the word
  "submission" appearing inside `buildSystemPrompt`'s own text.
- Instrument: `npm test` running
  `src/app/components/grading-recording/grading-feedback-prompt.test.ts`.
- Direction of failure: **RED** if, for ANY member of `SUBMISSION_KINDS` other
  than `"unknown"`, the returned string contains `"\n\nSubmission:\n"`. The test
  iterates `SUBMISSION_KINDS`, so it ranges over the union by construction and
  a fifth member added later cannot escape it (`traps-tests.md`: coverage a
  property of construction, not enumeration).
- Sabotage that must go red: restore the literal `Submission:` in the template.

### G-R2 - the on-screen label

> For a row whose kind the instructor confirmed, the on-screen label cannot say
> "Submission".

Two halves, and they are **not equally strong**. Saying so is the point.

**G-R2a, executable.** `submissionKindLabel(kind)` is a function in a `.ts`
leaf. Object: its return value. Instrument: `npm test` running
`src/lib/grade/submission-kind.test.ts`. Direction of failure: **RED** if, for
any member of `SUBMISSION_KINDS` other than `"unknown"`, the returned string
contains `"Submission"`. Iterates the union.

**G-R2b, a source-text claim and nothing more.** No component is rendered by any
test in this repo (`this-repo.md` section 2), so that `GradingTableRow.tsx`
actually uses the function is checked by reading the file. Object: the
comment-stripped source of
`src/app/components/grading-recording/GradingTableRow.tsx`. Instrument: `npm
test` running a source-text assertion in
`src/app/components/grading-recording/copy-feedback.test.ts`, which already
reads that exact path at `:267` (`readStripped("src/app/components/grading-recording/GradingTableRow.tsx")`)
and so needs no new reader. Direction of failure: **RED** if the source contains
either of the two byte sequences `>Submission</span>` or
`` `Submission from ${ `` , or if `submissionKindLabel(` appears fewer than
twice.

  **Canary, required** (`traps-search.md`: an absence claim needs a canary).
  The same two patterns are run against a fixture string that contains them, and
  both must match. Without it, a typo in the pattern reports clean.

  **Why absence-plus-presence and not a spelling pin.** `traps-tests.md` records
  twice that source-text assertions pinning an implementation's spelling forced
  contorted code. This pins the FACT (today's two defect literals are gone, the
  function is called) and never the label's wording.

  **A trap this dodges.** A naive `/Submission/` scan over that file
  false-positives on `GradingRowSubmissionTimeStatus` (`:41`),
  `gradingRowSubmissionTimeStatus` (`:223`, `:233`) and the CSS module keys
  `submissionBlock` / `submissionCell` (`:248`, `:258`). The two byte sequences
  above avoid all of them.

### G-R3 - the confirmed value is what travels (replacing the brand)

Ruling M withdrew `EffectiveSubmissionKind`. The replacement is the instrument
the repo already owns: a pinned call-site canary, modelled line for line on
`src/app/components/snapshot-grading/snapshot-role-setrole-callsites.structure.test.ts`
(read in full: `readdirSync` over a directory, comment-stripped, identifier
scan, a "more than N files" canary, then exact pinned file lists and per-file
counts).

New file: `src/app/components/grading-recording/submission-kind-callsites.structure.test.ts`.

Two pinned sets:

- **Set A, who may read the suggestion.** Files where the identifiers
  `suggestedSubmissionKind` or `submissionKindCue` may appear at all. The
  composers are deliberately NOT in it: `grading-feedback-prompt.ts`,
  `grading-submission-grade.ts`, `GradingRecordingPanel.tsx` and
  `src/lib/grade/submission-kind.ts` must contain zero references, so the
  suggestion physically cannot reach the prompt.
- **Set B, who may compose a label or a prompt header.** Files where
  `SUBMISSION_KIND_LABELS`, `SUBMISSION_KIND_PROMPT_LABELS` or
  `submissionKindLabel` may appear.

**The one way this canary must differ from its model, and it is not optional.**
`snapshot-role-setrole-callsites.structure.test.ts` scans ONE directory,
non-recursively. A8-R's composers span `src/app/components/grading-recording/`,
`src/app/actions/` and `src/lib/grade/`. A single-directory scan here would be
exactly the false absence `traps-search.md` warns about: a clean result that
checked nothing outside one folder. This canary walks all of `src/` recursively.

- Object: the comment-stripped source of every `.ts`/`.tsx` file under `src/`
  that is not a `.test.ts`.
- Instrument: `npm test` running that structure test.
- Direction of failure: **RED** if the set of files containing a Set A
  identifier differs from the pinned list in either direction, or if any of the
  four named composer files contains one. Plus two canaries: the walk found more
  than 200 files, and a known-positive identifier (`GradingRow`) is found in more
  than one of them - a broken walk otherwise reports every set empty and passes
  forever.

### NG-1 - the non-guarantee, unchanged

**Whether the kind is CORRECT is model-suggested and cannot be code-held on a
pixel input.** The extraction model reads screenshots; nothing in TypeScript can
know whether a block of transcribed prose really was a reply. What the code
holds is the three properties above - that a confirmed kind cannot be rendered
or transmitted as "Submission", that the confirmed value is the only one that
travels, and that nothing changes at all until an instructor confirms. It does
not hold that the suggestion was right, and no test in this repo can.

**And A8-R can change grades.** Telling the model `Reply:` instead of
`Submission:` may change what it returns. A8-R holds no property about any
score. This is in scope because Ruling A deferred exclusion and shipped
recognition, and it is bounded by G-R0: the request body is byte-identical until
an instructor confirms something.

---

## 6. The basis is the CUE, not the text

Round 1 required the suggestion to render its BASIS. On the snapshot surface a
basis discriminates because it is a transcript of a DIFFERENT shot. Here it
would be a slice of the model's transcription of the submission - and
`GradingTableRow.tsx:259` already renders `row.submissionText` in full one block
below. The evidence would be the thing itself, restated, identical whether the
model was right or wrong: a rubber stamp with a decoration on it, which is the
thing `snapshot-role-suggestion.ts:21-23` exists to prevent.

**CUE-1, the extraction contract.** `buildSubmissionExtractionPrompt`
(`grading-extraction-prompt.ts:64-105`) gains two output keys. Its `:97` clause
today reads `'Each element is either a submission - {"studentName": "...",
"submissionText": "..."} - ... No other keys.'` - that "No other keys" is the
line that has to change. The new contract asks for:

- `"submissionKind"`: one of `initial-post`, `reply`, `other`.
- `"kindCue"`: **the exact words or layout feature you SAW that made you choose
  that kind** - an opening `@Name`, a "Replying to X" line, a "Re:" prefix, an
  indented or nested position under another post, a thread-position label. Quote
  it verbatim when it is text. **If nothing on screen told you, return an empty
  string** rather than describing the submission's content.

A cue is discriminating precisely because it is not the submission restated: an
indentation or a thread position is not in `submissionText` at all, and an
`@Name` opener is a short, checkable fragment the instructor can verify against
the full text one block below. An EMPTY cue is informative, and the eligibility
rule below is built on that.

**CUE-2, what the batch accept actually is.** Not a blanket apply. A row is
eligible only when all three hold:

1. `suggestedSubmissionKind !== "unknown"`,
2. `submissionKindCue.trim() !== ""`,
3. `submissionKind === "unknown"` (not already confirmed - the instructor's own
   decision is never overwritten).

A suggestion the model could not justify is excluded from the bulk action and
must be confirmed one row at a time. If the model returns empty cues for
everything, the batch accept is simply empty and every row confirms
individually - it degrades to the safe behaviour rather than silently accepting.

- Object: the eligible-row set returned by the pure selector.
- Instrument: `npm test` running
  `src/app/components/grading-recording/grading-rows.test.ts`.
- Direction of failure: **RED** if a row failing any of the three conditions
  appears in the set, or if a row satisfying all three is absent from it. The
  oracle enumerates the product of {suggestion unknown / known} x {cue empty /
  non-empty} x {confirmed / unconfirmed} - eight cases by construction, not a
  hand-written sample.

**Whether real cues come back non-empty is not knowable here.** No API keys, no
live model (`this-repo.md` section 6). Residual RES-3.

**The instrument that makes RES-3 answerable.** `grading-recording-log.ts`'s
per-row log entry gains `submissionKind`, `suggestedSubmissionKind` and a
boolean `hadKindCue` - never the cue TEXT, because that file's header
deliberately excludes `submissionText` and the feedback fields and a cue is a
fragment of the submission. `grading-recording-log.test.ts:57-83` (re-measured
post-A16-2; was `:56-82`) (the `buildGradingRecordingLogRowEntry` describe,
whose `expect(entry).toEqual({...})` at `:73` (was `:72`) is an exact-object
assertion) pins the entry's key set and will red on the addition; bump it in
the same commit.

---

## 7. Wave 0: the panel line budget, derived

Ruling D aimed at the wrong file and the re-chunk corrected it. The squeeze is
`GradingRecordingPanel.tsx`.

**Measured now:**

```powershell
@(Get-Content src\app\components\grading-recording\GradingRecordingPanel.tsx).Count   # 995
```

`src/file-size-ceiling.structure.test.ts:30` sets `LIMIT = 1000`, and its
`ALLOWED_OVERAGE` map (`:64-81`) has exactly four entries, none of them this
file (`grep -n "ALLOWED_OVERAGE" -A 25`). **Five lines of headroom.**

### The derivation round 1 owed

**Additions A8-R makes to this panel**, enumerated rather than estimated. The
mutators live in `useGradingRows.ts`, not here - the panel already passes
`gradingRows.markSubmissionLate` and `gradingRows.editField` straight through at
`:969-981`, so the panel gains prop lines, not handlers. Deliberately **no new
hook**: `this-repo.md` section 1 records the sibling panel's hook extraction
failing lint with two React Compiler `preserve-manual-memoization` errors on an
untouched callback, and that rule reacts to a component's hook count and shape.

| Addition | Lines |
|---|---|
| `onConfirmSubmissionKind={gradingRows.confirmSubmissionKind}` at the `<GradingTable>` call (`:969-981`) | 1 |
| `onAcceptSuggestedKinds={gradingRows.acceptSuggestedKinds}` at the same call | 1 |
| `submissionKind: r.submissionKind,` in the grade map at `:561-565` | 1 |
| A comment block at the map explaining why the CONFIRMED field and not the suggestion is what reaches the model - the hinge of G-R1/G-R3 | up to 12 |
| **Additions budget (hard cap)** | **15** |

The comment allowance is not invented: this file is 30 percent comment lines
(`@(Get-Content $f).Count` = 995 against 298 lines matching `^\s*(//|/\*|\*|\{/\*)`),
and a hinge comment in this directory runs 6 to 12 lines.

**Margin: 20 lines.** Named, not rounded: the shipped workaround for the
React Compiler failure on the sibling panel keeps a ref declaration AND its
effect inside the panel and passes the ref into the hook
(`this-repo.md` section 1, `useSnapshotKeyboardShortcuts.ts`'s
`nextStudentCountsRef`). That is roughly 8 lines. The margin is two of them,
because A8-P is sequenced immediately behind this chunk and the re-chunk already
records this panel as the squeeze point.

**Wave-0 target = 1000 - 15 - 20 = 965.**

(Round 1 asserted 960 with no derivation. 965 is what the derivation produces;
the five-line difference is not important, the derivation is.)

### How wave 0 gets there: an ordered ladder with a measured stop

995 to 965 is **at least 30 lines removed**. Two extractions are available and
neither changes the panel's hook count:

**Step 1, the re-chunk's preferred one.** `currentGradingLog` and
`handleDownloadLog`, `:628-656` (29 lines: comment `:628-632`, code `:633-656`).
**Caution, measured:** `currentGradingLog` reads nine local state values
(`:635-643`), so moving the whole block does NOT save 29 - the panel would still
have to spell those nine at the new call site. What actually moves is
`handleDownloadLog` (`:647-656`, 10 lines) plus the three format/filename
imports and `triggerFileDownload`, which become unused. My estimate of the net is
about 12 lines, not 29. **This is an estimate and it is why step 2 exists.**

**Step 2, if step 1 leaves the file over 965.** The four `setLogGradingRuns`
blocks: `:544-555`, `:574-585`, `:604-607`, `:611-622` = 12 + 12 + 4 + 12 =
**exactly 40 lines** (re-measured here, agreeing with the kept round-1
arithmetic). They become three named builders in `grading-recording-log.ts` -
`blockedGradingRun`, `erroredGradingRun`, `completedGradingRun` - called in one
or two lines each. Estimated net about 31. No hook is added or removed; these
are `setState` calls inside an existing `useCallback` whose dependency array
(`:626`) is unchanged.

**Pass condition W0-P:**
- Object: `src/app/components/grading-recording/GradingRecordingPanel.tsx`.
- Instrument: `@(Get-Content <file>).Count` from PowerShell. Never
  `Measure-Object -Line`, which reads 42 low on this exact file
  (`this-repo.md` section 3).
- Direction of failure: **RED** if the count is greater than **965** at the
  wave-0 gate, and **RED** if `npm test` reports any failing test.

Because the target is a measurement rather than a prediction, my estimates for
steps 1 and 2 being wrong costs a re-measure, not a wrong ship.

**Wave-0 obligations that are not line counts.** Five test files read this panel
BY PATH and a by-name sweep does not see them (section 8): `buttonVariant.test.ts:157`,
`runLogRow.test.ts:16`, `AddKnowledgePages.test.ts:237`,
`GradingRecordingPanel.wiring.test.ts:35`, `GradingRecordingPanel.assessment.test.ts:37`,
and `GradingAssessmentDeclarationControls.test.ts:242`. `AddKnowledgePages.test.ts`
asserts on the ORDER of JSX gate blocks in this panel (`findGateBlockEnd`), so
moving markup, not just logic, can red it.

### The primary-button canary

`src/app/components/ui/buttonVariant.test.ts` walks `SECTION_4_DIRS` (`:85-93`),
which includes `src/app/components/grading-recording`, and compares a computed
map against `FROZEN_PRIMARY_SITES` (`:152-182`) with
`expect(actual).toEqual(FROZEN_PRIMARY_SITES)` at `:225`. `GradingRecordingPanel.tsx`
is pinned at **3**; `GradingTable.tsx` and `GradingTableRow.tsx` are ABSENT from
the map, and `:223` adds any file with a non-zero count, so their count must stay
**0** or the `toEqual` reds.

`countPrimaries` (`:137-145`) counts a tag carrying `variant="contained"`,
`variantFor(` or `idleVariant="contained"`, unless it also carries
`color="error"` or `color="warning"`.

**Consequence, and it is a design constraint not a note.** The batch-accept
control belongs in `GradingTable.tsx`'s toolbar beside "Clear table", and it must
use `ConfirmArmButtons` with `idleVariant="outlined"` - exactly what "Clear table"
already does at `:181-194`. The per-row confirm control in `GradingTableRow.tsx`
must be a text button, matching "Remove" and "Mark late" (`:188-197`, `:224-231`).
If any of these three counts is deliberately moved, bump `FROZEN_PRIMARY_SITES`
in the SAME commit with the reason, which is what that map's own comment
(`:148-151`) demands.

### The CSS orphan walker

`src/app/components/courses/page-module-css-orphan-classes.test.ts:411` writes
`docs/css-orphans.md` on every run (`fs.writeFileSync(DOCS_ORPHANS_PATH, ...)`),
stamped with a date-only timestamp (`:344`). `GradingTable.module.css` has no
entry today (`grep -n "GradingTable.module.css" docs/css-orphans.md` returns
nothing). Two consequences:

- New classes for the kind badge and the cue line must be REFERENCED as
  `rowStyles.name`, or the ratchet lists them as orphans and the file changes.
- `docs/css-orphans.md` is an EXPECTED modification path at every wave gate.
  List it in the assignment, or `git status --short` shows an unlisted path and
  the gate reads as an over-reaching agent.

---

## 8. `owns`

Ruling N sets a floor of about 35 and names the misses. `traps-spec.md` rules
that a handed-over enumeration is a floor and the receiver must derive the set
with its own instrument and report what the list missed. Derived here:

```
grep -rn 'nameMatch: "' src/
grep -rn "): GradingRow\b|: GradingRow = {|: GradingRow\[\] = \[" src/
grep -rln "grading-recording/" --include="*.test.ts" src/
grep -rn "grading-recording/[A-Za-z-]*\.\(tsx\|ts\|css\)" --include="*.test.ts" src/ -o | sort | uniq -c
```

The third and fourth commands are the ones a by-name sweep cannot replace: they
find tests that read a file BY PATH. Canary proving the instrument fires:
`grep -rn "grading-recording/" src/app/components/grading-recording/copy-feedback.test.ts`
returns `:267 readStripped("src/app/components/grading-recording/GradingTableRow.tsx")`.

### New (3)

| Path |
|---|
| `src/lib/grade/submission-kind.ts` |
| `src/lib/grade/submission-kind.test.ts` |
| `src/app/components/grading-recording/submission-kind-callsites.structure.test.ts` |

### Edited, `src/app/components/grading-recording/` (26)

`GradingRecordingPanel.tsx`, `GradingRecordingPanel.wiring.test.ts`,
`GradingRecordingPanel.assessment.test.ts`, `GradingTable.tsx`,
`GradingTableRow.tsx`, `GradingTable.module.css`,
`GradingAssessmentDeclarationControls.test.ts`, `copy-feedback.test.ts`,
`grading-capture-sync.ts`, `grading-capture-sync.test.ts`,
`grading-capture-tombstones.ts`, `grading-capture-tombstones.test.ts`,
`grading-extraction-prompt.ts`, `grading-extraction-prompt.test.ts`,
`grading-feedback-prompt.ts`, `grading-feedback-prompt.test.ts`,
`grading-recording-log.ts`, `grading-recording-log.test.ts`, `grading-row.ts`,
`grading-row.test.ts`, `grading-row-serialization.ts`,
`grading-row-serialization.test.ts`, `grading-rows.ts`, `grading-rows.test.ts`,
`useGradingRows.ts`, `useGradingRows.wiring.test.ts`.

### Edited, elsewhere (5)

| Path | Why |
|---|---|
| `src/app/actions/grading-submission-extract.ts` | T1, the mint. Reads `submissionKind` and `kindCue` off the model response |
| `src/app/actions/grading-submission-extract.test.ts` | its oracle |
| `src/app/actions/grading-submission-grade.ts` | T11 and the `buildGradingRecordingPrompt` call, now at `:152-157` (re-measured post-A16-2; was `:149-154`) |
| `src/app/actions/grading-submission-grade.test.ts` | its oracle |
| `src/app/components/grading-recording/GradingTable.module.css` | counted above |

### Not in Ruling N's floor - found by the instruments above (7)

| Path | Why it joins |
|---|---|
| `src/lib/course-intel/offline-payload.ts` | `buildGradingRow` at `:178` is a PRODUCTION full `GradingRow` literal. tsc reds on a required field |
| `src/lib/course-intel/offline-assembly.test.ts` | `gradingRow` factory base at `:44` |
| `src/lib/course-intel/cross-course.test.ts` | `gradingRow` factory base at `:119` |
| `src/app/components/recording/runLogRow.test.ts` | reads `GradingRecordingPanel.tsx` by path at `:16` and counts `<RunLogRow` occurrences |
| `src/app/components/recording/AddKnowledgePages.test.ts` | reads the panel by path at `:237` and asserts on JSX gate ORDER |
| `src/app/components/course-intel/courseIntelOfflineTables.test.ts` | reads `useGradingRows.ts` by path at `:35` |
| `src/app/components/ui/modalAdoption.wiring.test.ts` | reads two grading-recording modals by path (`:251`, `:256`, `:341`, `:345`) - **checked-safe**, A8-R touches neither, listed so the next pass does not rediscover it |

### Walkers and generated paths (4)

| Path | What moves it |
|---|---|
| `src/app/components/ui/buttonVariant.test.ts` | `FROZEN_PRIMARY_SITES` - section 7 |
| `src/app/components/courses/page-module-css-orphan-classes.test.ts` | new CSS classes - section 7 |
| `src/file-size-ceiling.structure.test.ts` | walks all of `src/`; the panel is five lines from `LIMIT` |
| `docs/css-orphans.md` | written by the walker on every run; an expected wave-gate path, not an over-reach |

**Total: 44 paths** (3 new + 26 + 4 actions + 7 + 4 walkers/generated, with
`GradingTable.module.css` counted once - Revision 2 stated this as 45, an
arithmetic slip: `3 + 26 + 4 + 7 + 4 = 44`, confirmed by writing all four
sub-lists to a file and running `sort -u | wc -l`, which returns 44 with no
duplicate path). Above Ruling N's floor of about 35, as
that ruling predicted a derived set would be.

`src/app/components/grading-recording/grading-rows.test.ts:425-437` owns the
exact set of `ta-rec-grade-*` storage keys this directory uses. **A8-R adds no
new persisted key** - all three fields ride the existing row blob through
`toWire`/`fromWire` - so that canary is checked-safe. The per-row kind control
still persists across a reload, which is what the standing UI rule requires,
because the row itself persists.

### Disjointness from A11

Ruling I already proved exact-path disjointness between A11's 14 paths and
A8-R's set, computed mechanically with a self-intersect canary. **Not re-derived
here**, per the brief. The one coupling it names - `grading-feedback-prompt.ts:89`
(re-measured post-A16-2; was `:78`) calling `buildSystemPrompt("", rubricText,
criteria)` with three positional arguments, against A11's defaulted fifth
parameter - is unaffected by A8-R:
A8-R's change to that file is to `buildGradingRecordingPrompt` (`:112-120`,
re-measured post-A16-2; was `:101-108`), a different function, and A8-R does
not add an argument to the `buildSystemPrompt` call (now `:89`, was `:78`).

**One thing the checker should look at that Ruling I did not cover.** Ruling I's
disjointness was computed against A8-R's round-1 set of 18 paths. This revision
derives 45. None of the 27 additions is under `src/app/components/snapshot-grading/`
or is `src/lib/grade/prompts.ts`, so I believe the intersection is still empty -
but I did not have A11's path list in front of me and did not run the
intersection myself. Residual RES-7.

---

## 9. Verify

- Object: the whole repository.
- Instrument: `npm test` from PowerShell at the repo root, plus
  `npm run lint`, plus `npm run build` grepped for the "Compiled successfully"
  line (never `&&` on the build - it exits 1 in the prerender tail with no
  `.env`). `npx tsc --noEmit` is run by the **wave gate only**, exactly one
  caller, because it races on `tsconfig.tsbuildinfo`.
- Direction of failure: **RED if any test fails.** Also RED if the test-file
  count drops below its baseline, and RED if `npm run lint` reports more than
  the four baseline warnings or any error.

**Baseline, re-measured post-A16-2.** `git ls-files 'src/*.test.ts'
'src/**/*.test.ts' | sort -u | wc -l` returns **1072** at HEAD - one more than
Revision 2's 1071, from `src/lib/grade/prompts-praise-routing.test.ts` landing
via the disjoint A11 item, not from A16-2. **Use the git-tracked count, not
raw `find`**: `find src -name "*.test.ts" | wc -l` returns 1074 in this working
tree right now because it also counts two `.test.ts` files that are untracked,
mid-flight edits from a concurrently running agent this session must not read
or depend on (`git status --short`). The TEST count (round 1: 21297) still
cannot be produced without running the suite,
and I did not run it: the only writer in that suite,
`page-module-css-orphan-classes.test.ts:411`, writes `docs/css-orphans.md`, and
this pass is permitted to write exactly one file. **RES-5** carries the
re-measure.

### The L15 flake, handled rather than hoped away

`src/source-bytes.structure.test.ts` walks all of `src/` under vitest's default
5 s timeout (`vitest.config.ts` sets no `testTimeout`) and has been measured
timing out at 9588 ms under concurrent load while passing in 538 ms alone
(backlog L15). A whole-suite verify inherits it. The rule:

1. Run `npm test` with nothing else running - no sibling agent's suite, no
   concurrent `tsc`, no build.
2. If the ONLY failure is `src/source-bytes.structure.test.ts` AND its message
   is a timeout, re-run that one file alone
   (`npx vitest run src/source-bytes.structure.test.ts`) and record BOTH runs in
   the verify. A pass there discharges it.
3. **Any other failure, and any non-timeout failure of that file, is RED.** A
   timeout on a second file is RED too - the exemption is one file, by name, for
   one failure mode.
4. When grepping vitest output, pipe through `tr -d` for NUL bytes or use
   `grep -a`. Vitest output contains NULs, so a plain `grep` prints
   "Binary file (standard input) matches" and a failing run looks like a silent
   pass (`traps-search.md`).

### Sabotage pass

Each guarantee names the mutation that must turn it red, and each must be
watched failing (`traps-tests.md`: a test is not evidence until you have watched
it fail). Restore `Submission:` in the prompt template (G-R1). Point
`SUBMISSION_KIND_LABELS.reply` at `"Submission"` (G-R2a). Re-introduce
`>Submission</span>` in `GradingTableRow.tsx` (G-R2b). Add a reference to
`suggestedSubmissionKind` inside `grading-submission-grade.ts` (G-R3). Change one
fold branch to keep the stale suggestion (TR-P).

**Sabotage restores use a `cp` backup, never `git checkout --`** - on an
uncommitted file that reverts to the index and destroys the chunk's work.

---

## 10. Residual register

Every entry names an owner, an instrument and the step that will measure it. An
entry missing any of the three is a deletion, and there are none here.

| id | What is not proven now | Owner | Instrument | Step |
|---|---|---|---|---|
| RES-1 | Route (c): `grading.ts:619/:636` `gradeOneSubmissionAction` bypasses `gradeCanvasUrl`, and `submission-detail.ts:120` gives it a body with no Post/Reply labels and no `discussion` field, so the defect is worse there and A8-R changes nothing | repo owner | one live single-submission grade against a real graded discussion | after A8-R lands (Ruling J) |
| RES-2 | Route (d): `canvas/submissions.ts:182-183` writes the merged intro-plus-replies blob to a file literally named `_post.txt` - this row's own "most literal instance in the tree". Nothing in this repo reads it back, so the contract is external-only and a rename could make the service miss the submission entirely - a 0 instead of a mislabel, strictly worse | repo owner | one run against the external Deterministic Grading API | **before any rename** (Ruling J) |
| RES-3 | Whether the extraction model returns non-empty `kindCue` values on real captures. No API keys here; every LLM path is mocked | repo owner | one real capture over a Canvas discussion submission list, then read `submissionKind` / `suggestedSubmissionKind` / `hadKindCue` in the downloadable run log (section 6) | first real run after A8-R lands |
| RES-4 | How the new label, badge and cue line actually READ to an instructor. No component is rendered by any test in this repo, so G-R2b is a source-text claim | repo owner | eyes on the grading table after a real capture | same first real run |
| RES-5 | The suite test COUNT baseline (round 1: 21297). Not re-measured by this pass, because running the suite writes `docs/css-orphans.md` and this pass may write one file. File-count baseline IS re-measured, at HEAD, as 1072 (section 9, this re-verification pass) | the wave-0 gate | `npm test`, recording the "Tests N passed" line | before wave 1 starts |
| RES-6 | Completeness of the section-0 disposition table. Round 1 is not on disk, so I reconstructed it from the rulings and the brief; a round-1 requirement neither source names is absent and I cannot know that | the round-2 checker | the round-1 check's own blocker list, read against section 0 | the disposition-table audit at the top of the round-2 check |
| RES-7 | Whether Ruling I's A11/A8-R disjointness still holds against this revision's 44 paths rather than round 1's 18. **Status disputed as of this re-verification pass**: commit `5b85ca6` (which shipped this file) claims in its own message "RES-7 discharged... re-intersected per path", but this row was never updated to reflect that. This pass did not independently re-run the intersection (A11's full path list was not available as a single enumerable list in the time budgeted) | the orchestrator | `sort` piped to `uniq -d` over A11's path list and section 8's, with a self-intersect canary | reconcile the commit-message claim against this row before A8-R and A11 run concurrently |
| RES-8 | An uncorroborated comment at `grading-submission-grade.ts:109-112` claims "a pending chunk extracts ~40 lines from above both call sites" (referring to this file and `grading-submission-extract.ts`). Not echoed in the sibling file, not referenced by any `docs/*.md`, and does not match any chunk in this document - see the re-verification section at the top. Both files measured at 192 and 195 lines (`wc -l` and `@(Get-Content).Count` agree), nowhere near the 1000-line ceiling, so no extraction is needed by anything A8-R does | repo owner | read the comment against the backlog and either delete it, correct it, or point it at the chunk it actually describes | before A8-P (the chunk sequenced after A8-R that imports this file's exports) is scoped |

### Handed over, with receiver and obligation

| What | Receiver | Obligation |
|---|---|---|
| The `GradingSubmissionKind` union, `SUBMISSION_KINDS`, and both label Records | **A8-P** | A8-P imports them rather than declaring a second copy, and extends the same Records if the LMS path needs a member. A8-P must NOT run concurrently with A8-R - the coupling is directional and informational, so sequence |
| Exclusion of reply text from scoring, and the disclosure that goes with it | deferred by Ruling A | waits until a rubric can carry a reply section AND the instructions shown to the model are narrowed in the same change. A8-R ships recognition only |
| `contributionCount` (`discussions.ts:152`) splitting into two numbers | nobody, deliberately | nine grep hits and zero readers - one declaration, three writes, five test fixtures. Splitting it would change a write-only field. Left out of every chunk on purpose, recorded so the next pass does not rediscover it |

---

## 11. Waves

Sequential. Each wave gate is `git status --short` in the main checkout against
the assignment, plus a check that no `.claude/worktrees` copy was edited instead
of the real tree (`Glob` returns the worktree copy FIRST).

**Wave 0 - headroom and the freeze.** `GradingRecordingPanel.tsx`,
`grading-recording-log.ts`, `grading-recording-log.test.ts`,
`GradingRecordingPanel.wiring.test.ts`, and the G-R0 frozen literal in
`grading-feedback-prompt.test.ts`. Gate: W0-P (count <= 965) plus a green suite.
Nothing else may start until this passes - the panel has five lines of headroom.

**Wave 1 - the type and the transport.** `src/lib/grade/submission-kind.ts`
(union, `SUBMISSION_KINDS`, `coerceSubmissionKind`) and every T1-T9 file, plus
the three `src/lib/course-intel/` sites. Every export added in this wave has a
caller in this wave: `coerceSubmissionKind` is called by `fromWire` and by the
extraction action. **Gate also includes W1-WIRE** (re-verification pass,
section 4.1): `EXPECTED_WIRE_KEYS` in `grading-row-serialization.test.ts`
(currently 16 entries, `:679-696`) must be bumped to 19 in this same wave, or
the wave ships the three new fields without the codec that persists them.

**Wave 2 - the surface and the prompt.** The label and prompt-label Records and
`submissionKindLabel` (added to the same leaf), `GradingTableRow.tsx`,
`GradingTable.tsx`, `GradingTable.module.css`, `grading-rows.ts`,
`useGradingRows.ts`, `grading-feedback-prompt.ts`,
`grading-submission-grade.ts`, T10/T11, `copy-feedback.test.ts`, and the
call-site canary. Same rule: every export added here has its caller here.
