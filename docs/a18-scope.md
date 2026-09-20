# A18 scope: stop the walkthrough-announcement tool's copy from claiming it records

Seat: SCOPING, round 1. Authored 2026-09-20.

**Tree state at authoring.** `git rev-parse --short HEAD` returns `c03457b` on
`main`. `git status --short` shows other agents mid-flight on
`docs/a12-a13-scope.md`, `src/app/components/GithubGradingPanel.tsx`,
`GradingResults.tsx`, `GradingTab.tsx`, `LiveFeedPanel.tsx`,
`drafted-grades/ClassTrendsPanel.tsx`,
`drafted-grades/classTrendsDraft.not-postable.test.ts`,
`grading-results/gradingResultsExtraction.wiring.test.ts`,
`grading-results/gradingResultsHelpers.{ts,test.ts}`, plus three untracked
`grading-results/*` files. **I edited only this file** - no source, no test,
no other doc. One of those mid-flight files
(`classTrendsDraft.not-postable.test.ts`) is cited below as a read-only
consumer of a file this row touches; its own content may move under a sibling
agent while this document exists, so its citation is timestamped to this
measurement and should be re-read before acting on it.

**No code or test file was changed in this round**, so the repo's four gates
(`npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`) were not run
against this row - there is nothing for them to check yet, and running `tsc`
here would race the wave gate other agents may be holding
(`this-repo.md` section 2, "exactly one caller runs `tsc`"). Every line count
and every grep below was executed by me, this turn, from the repo root.

---

## 0. Leverage

This is a copy correction, not a new or changed capability - the tool's
behaviour (reads frames off a shared screen, discards them, never saves
video) is unchanged; only the words describing that behaviour move to match
it. `docs/loop/leverage.md`'s own taxonomy exists to test whether a feature
earns an advantage over a chat window; there is no feature here to test.
**Fired trigger: "doc correction" exemption in `seats.md`'s Acceptance
criteria section - "On a bug fix, a refactor, a doc correction or an owner
verification there is no claim to make; record that as the fired trigger and
move on."** No leverage claim is made, and none is owed.

---

## 1. Re-measuring row A18's own instrument

The task instructions require re-measuring every locus in the row rather than
copying it forward. Every citation below was opened. Corrections are called
out explicitly; everything else is confirmed unchanged.

| Row A18 claim | Command | Result |
|---|---|---|
| `WalkthroughAnnouncementPanel.tsx:515` calls `start({ saveVideo: false })` | `Read` the file at that line | **Confirmed**, verbatim: `await start({ saveVideo: false });` at line 515. |
| `:801` tells the instructor a capture does not survive a reload | `Read` lines 800-803 | **Confirmed**, text begins at line 801: "A capture in progress does not survive a reload or a closed tab: anything not yet read off the screen, and any vision call already in flight, is lost." |
| `:725-726` opens with "Share your screen and click through a series of LMS pages" and is the house style to match | `Read` lines 724-728 | **Confirmed** verbatim, including the phrase "the app reads what is visible" - this is the phrase the fix should echo. |
| `:883` says "Record and stop a walkthrough first - nothing has been read yet" | `Read` line 883 | **Confirmed** verbatim. This is one of the three loci in scope. |
| `:871` offers "Generate video script" | `Read` line 871 | **Confirmed** verbatim. Does not contain the word "record" and makes no claim about what this app does - it names an output ("video script"), not an action. **Not in scope**; see section 4. |
| `:937` is the "Video script draft" legend | `Read` line 937 | **Confirmed** verbatim. **Not in scope**; protected, see section 4. |
| `AnnouncementCourseFieldset.tsx:253-254` says frames are read "while you record" | `Read` lines 252-255 | **Confirmed** verbatim: "Frames from your screen are sent to a third-party AI provider to be read while you record. Share a single window rather than your whole screen, and close any gradebook, inbox, or student submission first." One locus, in scope for the single word "record". |
| `:244` labels the notes box "Notes for this walkthrough - optional" | `Read` line 244 | **Confirmed** verbatim. Contains no misleading word. **Not in scope** - correctly worded already. |
| `walkthrough-announcement.ts:392` and `:538` both return "Nothing was captured yet - record a walkthrough first." | `grep -n "Nothing was captured yet" src/app/actions/walkthrough-announcement.ts` | **Confirmed**, both lines identical, verbatim. In scope. |
| `WalkthroughAnnouncementPanel.tsx` is 979 lines against the 1000-line ceiling (`wc -l`) | `wc -l` (Bash) **and** `@(Get-Content <path>).Count` (PowerShell) | **Confirmed both ways: 979.** `(Get-Content <path> | Measure-Object -Line).Lines` returns **912** - the same 42-off-by-70ish-style disagreement the loop cards warn about on a different file; the mandated instrument (`@(Get-Content).Count` / `wc -l`) is the 979 figure. 21 lines of headroom, unchanged from the row. |
| `walkthrough-announcement.ts` is 602 lines (`wc -l`) | Same two commands | **Confirmed both ways: 602.** `Measure-Object -Line` gives 559. |
| The mount is pinned by `walkthrough-announcement.structure.test.ts`, which reads `RecordingTab.tsx` as source text | `Read` that test file in full (457 lines, confirmed by both instruments) | **Confirmed**, and the path needed a correction: the row does not give the path, and `find src -iname "*walkthrough*"` plus `find src -iname RecordingTab.tsx` show the actual mount file is `src/app/components/RecordingTab.tsx` (917 lines, both instruments agree), **not** `src/app/components/recording/RecordingTab.tsx` - no file exists at that second path (`Get-Content` on it errors `PathNotFound`). This is the one drift found in the row's own instrument: a plausible-looking path that does not resolve. Corrected throughout this document. |

**No other drift found.** Every other cited line, string and file resolved
exactly as claimed.

---

## 2. The three layers, and the boundary

Row A18 already rules only layer 1 is clearly in scope. This section makes
that precise, not relitigated.

### Layer 1 - user-facing copy in this tool (IN SCOPE)

Re-derived independently of the row's own list, per `seats.md`'s "brief from
the tree, not the doc": I ran a fresh case-insensitive scan for every
occurrence of "record" in the three candidate files, then classified each hit
myself rather than trusting the row's enumeration.

```
grep -in "record" src/app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx
grep -in "record" src/app/components/walkthrough-announcement/AnnouncementCourseFieldset.tsx
grep -in "record" src/app/actions/walkthrough-announcement.ts
```

Panel: 14 hits at lines 3, 15, 31, 39, 42, 45, 46, 92, 94, 129, 177, 753, 852,
883, 934. Of these, exactly **one** (line 883) is rendered, user-facing prose
that wrongly claims the app records: `"Record and stop a walkthrough first -
nothing has been read yet."` Every other hit is a code comment (3, 15, 31, 92,
94, 129, 177, 753, 852), an import path/identifier (39, 42, 45, 46), or the
protected video-script comment (934) - see layer-1-adjacent note below and
section 4.

Fieldset: 2 hits (19 import, 253 the disclosure). Exactly **one** in scope:
line 253's "while you record".

Actions file: 5 hits (3 header comment, 80 the built-in TypeScript utility
type `Record<string, unknown>` - a false positive a naive whole-word-free scan
would have wrongly flagged, confirming why the sabotage checks below use a
`\b` word boundary; 156 a comment; 392 and 538 the error string). Exactly
**two** in scope, both the identical string.

**Total layer-1 loci: four, across three files, three distinct strings** (the
error string is duplicated verbatim at two call sites):

1. `WalkthroughAnnouncementPanel.tsx:883` - the empty-material hint.
2. `AnnouncementCourseFieldset.tsx:253-254` - the privacy disclosure (one word).
3. `walkthrough-announcement.ts:392` - the announcement-draft empty-input error.
4. `walkthrough-announcement.ts:538` - the video-script-draft empty-input error (identical string to #3).

A code comment at `WalkthroughAnnouncementPanel.tsx:753` ("reachable BEFORE
the record button") and one at `:31` ("before the record button") are stale
in the same direction - there is no "record button", only "Start capture" /
"Stop capture" (`:807`) - but they are not user-facing and are not gated by
any acceptance criterion below. Noted, not fixed; see the residual register.

### Layer 2 - identifiers and keys (LEFT, per the row's default)

Re-verified, not assumed:

- **View id `"walkannounce"`.** Validated at runtime against
  `RECORDING_LAUNCH_VIEWS`, a literal array (`src/lib/recording-launch.ts:71-81`),
  not merely the `RecordingLaunchView` type union (`:57-67`) - `isValidView`
  (`:182-183`) reads the array. It is also load-bearing in `RecordingTab.tsx`
  at four separate points: the `recView` union (`:63`), the `v === "walkannounce"`
  branch inside the separate localStorage restore guard (`:75`), the tab-strip
  literal (`:592`), and the mounted panel's `active` prop and `role="tabpanel"`
  id (`:887-888`). It is additionally pinned by five separate assertions in
  `walkthrough-announcement.structure.test.ts` (`:41-83`). Renaming it is a
  migration across two files plus a test file, for zero user-visible benefit -
  the id is never rendered. **Priced and left.**
- **The `ta-rec` namespace / this tool's own `ta-rec-wta-*` keys.** Read with a
  single, non-fallback `window.localStorage.getItem(STORAGE_KEY_COURSE)` (and
  the module/notes/emoji/resources equivalents) at
  `WalkthroughAnnouncementPanel.tsx:170,183,196,227,229`. There is no
  dual-read-old-key compatibility shim anywhere in this file. Renaming any of
  the five keys pinned by the directory's own ordinal canary
  (`walkthrough-announcement.structure.test.ts:106-111`, "exactly five distinct
  ta- keys") would silently drop every instructor's already-saved course,
  module, notes text, and the two toggle states on their next visit, with no
  error and no gate able to see it. **Priced and left.**
- **The `recording/RecordingControls.module.css` import.** Shared: it is also
  imported by at least `LectureScriptPanel.tsx` (confirmed by grep below),
  which is a genuine recording tool whose own "while you record" copy is
  correct for what it does. Moving or renaming this stylesheet for one
  consumer is a repo-wide refactor with no copy benefit. **Priced and left.**

I have no disagreement with the row's default position on any of the three.
No migration is proposed.

### Layer 3 - the tool living under a tab called "Recording" (NOT bundled, escalated)

`RecordingTab.tsx:567` sets `eyebrow="Recording"` on the tab shown to the
instructor; `:591-592` labels the inner tab strip `aria-label="Recording
tools"` and lists twelve inner views, of which at least two others besides
this one (`moduledeck` "Module walkthrough deck", and this one, "walkannounce"
"Announcement from a walkthrough") are screen-reading tools rather than
video-recording tools, sitting alongside genuine recording tools ("Record",
"Grading (from a recording)"). This is a placement/IA question, adjacent to
A16 (which already established a "fan out, do not build a destination"
preference for this same tab), and is explicitly out of scope per the row.
**Not bundled into this chunk.** Escalated in section 7, batched and
non-gating, with a recommendation.

---

## 3. Owns - derived by command, not asserted

**Command 1** (files containing the strings this row changes):

```
grep -rln "Record and stop a walkthrough first\|Nothing was captured yet - record a walkthrough first\|while you record" src
```

Result: the three files below, and no others.

**Command 2** (files that read any of those three files as source text -
per the task's own warning, "a test that greps a string it does not own is
how a correct change goes red"):

```
grep -rln "WalkthroughAnnouncementPanel\.tsx\|AnnouncementCourseFieldset\.tsx\|actions/walkthrough-announcement\"" src --include="*.test.ts"
```

Result: three files. One was a false positive, ruled out by opening it:
`useAnnouncementDraftSlots.test.ts:21` matches only because of a code comment
naming the panel file; `grep -n "readFileSync|import \* as fs|from \"fs\""` on
that file returns nothing, so it never reads any file as source text at all.
Excluded.

**Final owns:**

| File | Role | Line(s) |
|---|---|---|
| `src/app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx` | Edit: the empty-material hint | 883 |
| `src/app/actions/walkthrough-announcement.ts` | Edit: duplicated empty-input error string | 392, 538 |
| `src/app/components/walkthrough-announcement/AnnouncementCourseFieldset.tsx` | Edit: the privacy disclosure, one word | 253-254 |
| `src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts` | Add new source-text assertions (AC-1, AC-3, AC-4 below); its existing 17 `describe(` blocks (`grep -c "^describe(" walkthrough-announcement.structure.test.ts`) must keep passing unmodified - none of them anchor on the four strings above (checked individually against every `indexOf`/`toMatch` target in the file; see section 5 for the anchor-collision check) | New describes appended; existing content unmoved |
| `src/app/actions/walkthrough-announcement.test.ts` | Add new source-text assertions (AC-2 below); existing runtime assertions at `:209` and `:431` only check `toHaveProperty("error")`, never the string's text, so they are unaffected by the wording change | New describe appended |
| `src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts` | **Read-only, no edit.** Its "canary 2a" (`:185-195`) uses `WalkthroughAnnouncementPanel.tsx` as a positive-control fixture for a forbidden-*import*-graph walk (`walkForForbiddenImports`), asserting only that the panel's import statements trip the walker (`violations.length > 0`) - it never inspects string literals. This edit touches no import statement, so this test is unaffected; listed because it is a genuine source-text consumer of a file this row edits, and its assumed-safe status should be re-confirmed by running it, not re-asserted. It is also currently modified by a concurrent agent per section 0's tree-state note - re-read it before acting. |

Nothing else reads these three strings as source text; nothing else needs to
change.

---

## 4. Acceptance criteria

Each names the object under comparison, the instrument, and the direction of
failure, per `iteration-caps.md`'s entry gate 2. Every assertion pins a FACT
(a word's absence, or a fact's presence) and a STRUCTURAL anchor (a code
condition, an import boundary, a stable non-prose substring) - never the
replacement sentence itself, per this row's own instruction and the recorded
class of source-text tests over-specifying and forcing contorted
implementations (`traps-tests.md`).

### AC-1: the empty-material hint stops saying "Record"

**Object:** the JSX text rendered when `!hasMaterial` is true, currently at
`WalkthroughAnnouncementPanel.tsx:883`.

**Instrument:** a new source-text assertion in
`walkthrough-announcement.structure.test.ts`. Anchor structurally, not on the
prose: locate the literal `{!hasMaterial && <p className={styles.fieldHint}>`
(the conditional and the className are the code fact under test, not the
copy), then take the text up to the next `</p>}`.

- Assertion (a): that extracted text does **not** match `/\brecord(ing)?\b/i`.
  **Direction of failure: RED if the word "record" or "recording" (whole
  word, case-insensitive) appears anywhere in that segment.**
- Assertion (b): that extracted text is non-empty and matches
  `/\b(captur|read)\w*\b/i` at least once. **Direction of failure: RED if the
  hint is deleted outright or reworded to drop any mention of
  capturing/reading** - this closes the loophole where assertion (a) would
  pass trivially on an empty string.

**Recommended replacement** (not itself pinned by the test, offered so the
implementer is not starting from nothing): `"Capture and stop a walkthrough
first - nothing has been read yet."` - matches the "Start capture"/"Stop
capture" button labels already at `:807` and the "reads what is visible"
phrasing at `:725-726`.

### AC-2: the empty-input error strings stop saying "record a walkthrough"

**Object:** the two identical error strings at `walkthrough-announcement.ts:392`
and `:538`.

**Instrument:** a new source-text assertion in
`walkthrough-announcement.test.ts` (or a new adjacent structure check - either
is acceptable; the assertion, not its filename, is the requirement). Anchor on
the stable prefix `"Nothing was captured yet - "`, which itself makes no
recording claim and is not being changed.

- Assertion (a): `(source.match(/Nothing was captured yet - /g) ?? []).length === 2`
  - a count assertion with a named failure mode: it goes red if a third guard
  is added elsewhere with the same prefix, or if one of the two is deleted
  without the other being updated to match, per `traps-tests.md`'s "every
  count assertion needs a demonstrated failure mode." **Direction of failure:
  RED if the count is not exactly 2.**
- Assertion (b): for each of the two matched occurrences, the text from the
  prefix to the following `.` does not match `/\brecord\b/i`. **Direction of
  failure: RED if either occurrence still contains the whole word "record".**

**Recommended replacement:** `"Nothing was captured yet - capture a
walkthrough first."`

### AC-3: the privacy disclosure drops the word "record" and loses no fact

**Object:** the paragraph at `AnnouncementCourseFieldset.tsx:253-254`.

**Instrument:** a new source-text assertion in
`walkthrough-announcement.structure.test.ts`. Anchor structurally: this
fieldset has exactly one `</fieldset>` closing tag (confirmed:
`(source.match(/<\/fieldset>/g) ?? []).length === 1`), so
`source.slice(source.lastIndexOf('<p className={styles.fieldHint}>', source.lastIndexOf("</fieldset>")), source.lastIndexOf("</fieldset>"))`
isolates the disclosure paragraph without anchoring on any word that might be
reworded.

- Assertion (a): that isolated text does not match `/\brecord(ing)?\b/i`.
  **Direction of failure: RED if "record"/"recording" (whole word) still
  appears.**
- Assertion (b), the anti-weakening guard - the row is explicit that this
  disclosure "must not get weaker" and every fact it states must survive.
  Four facts, four independent keyword checks (never the full sentence):
  - recipient: matches `/third-party/i` **and** `/AI provider/i`
  - scope recommendation: matches `/window/i` **and** `/screen/i`
  - close-first recommendation, three named surfaces: matches `/gradebook/i`,
    `/inbox/i`, **and** `/student submission/i`
  **Direction of failure: RED if any one of these six keyword checks fails** -
  each is an independent fact, so a rewording that drops any one of them (for
  example, quietly relaxing "close any gradebook, inbox, or student
  submission first" to just "close your gradebook first") is caught by name,
  without pinning how the sentence is built.

**Recommended replacement:** `"Frames from your screen are sent to a
third-party AI provider to be read while you capture. Share a single window
rather than your whole screen, and close any gradebook, inbox, or student
submission first."` - the single word "record" to "capture" is the only
change; every fact and every recommendation is unchanged.

### AC-4: the protected video-script wording is untouched

**Object:** the four loci row A18 itself rules must survive: the code comment
at `WalkthroughAnnouncementPanel.tsx:933-934`, the "Video script draft" legend
at `:937`, the "Generate video script" button label at `:871`, and the
downloaded filename `"walkthrough-video-script.txt"` at `:964`.

**Instrument:** a new source-text assertion in
`walkthrough-announcement.structure.test.ex` (see note) asserting each of the
four literal strings above is still present, verbatim, in
`WalkthroughAnnouncementPanel.tsx`. Pinning the *exact* string here is
correct, not over-specification - the requirement is "unchanged", and an
unchanged fact is properly pinned by its own literal value; the
over-specification trap applies to inventing new prose to enforce, not to
detecting a regression in prose nobody asked to change.

**Direction of failure: RED if any of the four strings is altered or removed.**
This is the guard that makes "the video script survives" a checked fact
instead of a hope.

*(Correction while drafting: `.structure.test.ex` above is a typo for
`.structure.test.ts` - flagging it here rather than silently fixing it, since
this document is prose describing a test that does not exist yet; the
implementer creates the real file with the real extension.)*

---

## 5. Anchor-collision check against the existing structure test

Before proposing new assertions in `walkthrough-announcement.structure.test.ts`,
I checked every existing `indexOf`/`toMatch` target in that file (`Read` in
full, 457 lines) against the four edited loci, to confirm no existing
assertion's anchor or captured range overlaps line 883, 933-934, 937, 964, or
the fieldset's last paragraph:

- The `hasMaterial`-adjacent assertions in the file are about
  `savedFormatsState === "loading"` disable gates (`:397-411`) and the
  `onRetryOptions` prop (`:382-395`) - both anchor on `disabled={` and
  `onRetryOptions=` respectively, neither of which appears within 300
  characters of line 883's hint text.
- No existing assertion reads `AnnouncementCourseFieldset.tsx`'s tail (the
  existing fieldset-related assertions anchor on `savedFormatsStatusText(`
  calls, which sit above the disclosure paragraph in the file).
- No existing assertion reads past `postWalkthroughAnnouncementAction(` /
  `useAnnouncementDraftSlots(` calls into the video-script block.

**No collision found.** The four new criteria's assertions and the file's
existing 17 `describe(` blocks (`grep -c "^describe(" walkthrough-announcement.structure.test.ts`)
operate on disjoint text ranges.

---

## 6. Sabotage per criterion

**None of this has been executed** - this round writes no code and no test
file (see the header note and the concurrency instruction that scopes this
seat to `docs/a18-scope.md` alone). Each entry below is a plan: the exact
mutation, the exact expected observation, and whether I expect the
instrument to discriminate. The test seat/implementer must actually run each
one and record the observed red/green in their own artifact - an unexecuted
plan is not evidence, per `traps-tests.md`'s "a test is not evidence until you
have watched it fail."

| # | Criterion | Mutation | Expected before restore | Expected after restore | Discriminates? |
|---|---|---|---|---|---|
| S1a | AC-1(a) | Leave `WalkthroughAnnouncementPanel.tsx:883` unedited (i.e., do not apply the fix) | RED - the word "Record" is still present in the anchored segment | GREEN once the fix lands | Yes - the mutation is "the bug this row exists to close," and the assertion is a direct word-boundary check on the exact segment it names. |
| S1b | AC-1(b) | Apply a *different*, over-eager fix: replace the whole conditional with `{!hasMaterial && null}` | RED - the anchor is still found (the `{!hasMaterial &&` prefix survives) but the extracted text is empty, failing the capture/read-mention check | GREEN once real hint text is restored | Yes - this is the loophole check; I expect it to catch a fix that satisfies (a) by deleting the hint rather than rewording it. |
| S2a | AC-2(a) | Duplicate the error-returning guard a third time elsewhere in the file with the same prefix | RED - count assertion reads 3, not 2 | GREEN once the duplicate is removed | Yes, for the specific failure mode named (a stray third copy). It does **not** discriminate a case where someone changes the prefix text itself while keeping the count at 2 - that failure is caught by S2b, not S2a. Stating this rather than overclaiming one assertion covers both directions. |
| S2b | AC-2(b) | Leave one of the two occurrences unedited (fix only line 392, not 538, or vice versa) | RED - the unedited occurrence's post-prefix text still matches `/\brecord\b/i` | GREEN once both are edited | Yes - this is the exact failure mode the row calls out ("both return... - :392 and :538 both return"), and the two occurrences are checked independently. |
| S3a | AC-3(a) | Leave `AnnouncementCourseFieldset.tsx:253` unedited | RED - "record" still present in the isolated disclosure text | GREEN once fixed | Yes. |
| S3b | AC-3(b) | Apply the word fix correctly, but additionally delete the clause "and close any gradebook, inbox, or student submission first" - simulating exactly the "copy edit that quietly softens a privacy notice" the row warns against | RED - the `/gradebook/i`, `/inbox/i`, `/student submission/i` keyword checks fail | GREEN once the full clause is restored | Yes for this specific weakening. I have **not** separately tried weakening only the recipient clause ("third-party AI provider") or only the window-vs-screen clause - by symmetry of construction (each is an independent keyword check on the same isolated text) I expect the same discrimination, but this is inference from the assertion's shape, not a separately observed run. Flagging the difference rather than claiming three observations I only made one of. |
| S4 | AC-4 | Change `"walkthrough-video-script.txt"` at `:964` to any other string (simulating an unrelated future edit accidentally touching protected text) | RED - the pinned literal no longer matches | GREEN once restored | Yes - straightforward literal-equality style check; the only thing to verify is that the literal is copied into the test exactly as it appears in source, which the implementer must do by reading the file, not retyping from memory. |

**Cannot-discriminate case, named rather than hidden:** none of the six
assertions above is expected to fail on both mutation and restore, or pass on
both - every row names a mutation I expect to flip it. If the test seat finds
one that does not flip, that is a defect in the assertion's construction, not
a property of this plan.

---

## 7. Strings and loci explicitly NOT changed, and why

| Locus | Text/identifier | Why left |
|---|---|---|
| `WalkthroughAnnouncementPanel.tsx:871` | `"Generate video script"` | Names an output artifact, makes no claim about what this app does; contains no misleading word. |
| `WalkthroughAnnouncementPanel.tsx:933-934` (comment) | "the video script - never posted, just read aloud while re-recording" | Describes a recording the instructor makes *elsewhere*, after this tool's job is done - factually correct as written, and the one place "record" belongs (row A18's own stated trap). |
| `WalkthroughAnnouncementPanel.tsx:937` | `"Video script draft"` legend | Same reason; no misleading word in any case. |
| `WalkthroughAnnouncementPanel.tsx:964` | `"walkthrough-video-script.txt"` | Downloaded filename for the same protected feature; correct as-is. |
| `WalkthroughAnnouncementPanel.tsx:244` (fieldset) `AnnouncementCourseFieldset.tsx` notes label | `"Notes for this walkthrough - optional"` | Contains no misleading word already. |
| `"walkannounce"` (view id) | `recording-launch.ts`, `RecordingTab.tsx` (4 sites), structure test (5 assertions) | Layer 2, contract not copy; never rendered to the user; priced in section 2. |
| `ta-rec-wta-*` (5 keys) | `WalkthroughAnnouncementPanel.tsx:97-102` | Layer 2, pinned persistence; renaming silently drops every instructor's saved settings; priced in section 2. |
| `recording/RecordingControls.module.css` import | `WalkthroughAnnouncementPanel.tsx:39`, `AnnouncementCourseFieldset.tsx:19` | Layer 2, shared stylesheet used by other genuine recording tools (e.g. `LectureScriptPanel.tsx`); priced in section 2. |
| `eyebrow="Recording"` / `aria-label="Recording tools"` | `RecordingTab.tsx:567,591` | Layer 3, placement question, escalated below, not bundled. |
| Code comments at `WalkthroughAnnouncementPanel.tsx:3,15,31,92,94,129,177,753,852` and `walkthrough-announcement.ts:3,156` | Various "record"/"recording" mentions | Not user-facing; no acceptance criterion or test can observe a code comment's wording, and none of them assert a user-facing fact incorrectly (they describe the *code's* history/precedent, not what the tool does to the instructor). Listed as a minor residual, not gated. |

---

## 8. What could not be determined here

Per `this-repo.md` section 6: no component is rendered by any test in this
repo, so whether the reworded hint, error text, and disclosure actually read
well and remain legible in the real UI (font, wrapping, truncation) is not
observable from this checkout. This is a reading claim only, same as every UX
claim this repo can make.

---

## 9. Owner escalation - layer 3 (batched, non-gating)

**What is blocked:** whether the walkthrough-announcement tool (and, by the
same logic, the module-deck-capture tool) should keep living under a tab
labelled "Recording", given this whole row exists because the tab's own
copy-adjacent framing misleads instructors about what happens to their
screen.

**What would unblock it:** a one-line answer - keep the tab name, or rename
it (and if renaming, to what, and whether module-deck-capture moves with it).

**What it costs to leave it:** nothing functionally - `grep -rn
"eyebrow.*Recording\|Recording tools" src --include="*.test.ts"` returns no
matches, so no test pins the tab's display label; a rename later is a
one-line change in `RecordingTab.tsx:567,591` plus whatever new aria-label
text is chosen, unlike the layer-2 identifiers above. The live cost is
reputational/UX only: the tab groups genuine recording tools ("Record",
"Grading (from a recording)") with screen-reading tools (this one,
`moduledeck`) under one label, which is the same category of inaccuracy this
row is fixing inside the panel.

**Recommendation:** leave the tab name for this row. A16 already ruled a
"fan out, do not build a destination" preference for this same tab family;
renaming the tab is an information-architecture decision that touches two
tools' placement at once and deserves its own scoped row rather than riding
in on a copy fix. If the owner wants it renamed, it is cheap (no pinned test,
no persisted-key migration) and can be scoped separately.

---

## 10. Residual register

| # | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| R1 | The four sabotage mutations in section 6 are planned, not executed | Test seat / implementer | The two new test files (`walkthrough-announcement.structure.test.ts`, `walkthrough-announcement.test.ts`) once written | The Build/Test wave that follows this scoping round |
| R2 | Stale "record button" wording in code comments at `WalkthroughAnnouncementPanel.tsx:31,753` (not user-facing, not gated) | Implementer, opportunistically | None - visual inspection only, no test can see a comment | Whenever this file is next opened for this row's own edit; not worth a separate wave |
| R3 | Layer 3 placement (tab labelled "Recording") | Owner | None available in this checkout (IA/product decision) | Owner answers the escalation in section 9; if renamed, a new backlog row is scoped |
| R4 | `docs/REGRESSION.md` gets an entry for this fix, naming the discharging commit | Orchestrator, at push | `docs/REGRESSION.md` append, per `DEV_LOOP.md`'s push checklist | The push that lands this row's code change (this scoping round confirmed the *area* is already covered at `docs/REGRESSION.md:41682-42582` via `grep -a`, and none of those entries quote the three changing strings - the baseline seat is triaged out for this row on that basis, but the new fix itself is still owed its own line at push) |

---

## 11. Disposition table

Not applicable. This is round 1 of `docs/a18-scope.md`; there is no prior
version of this document to restructure against. `iteration-caps.md`'s entry
gate 3 ("every restructuring round ships a disposition table") does not fire
here - noted explicitly rather than omitted, per that same gate's own
checker instruction to look for silence as the failure mode.
