# A18 scope: stop the walkthrough-announcement tool's copy from claiming it records

Seat: SCOPING, round 2. Authored 2026-09-20.

**Tree state at authoring.** `git rev-parse --short HEAD` returns `58a4254` on
`main`. `git status --short` shows other agents mid-flight on
`src/app/components/GradingResults.tsx`,
`src/app/components/grading-recording/grading-capture-tombstones.{ts,test.ts}`,
`grading-recording/grading-row-serialization.{ts,test.ts}`,
`grading-recording/grading-row.ts`, `grading-recording/grading-submission-merge.ts`,
`grading-results/gradingResultsHelpers.test.ts`, plus three untracked
`grading-results/ungradedDisclosure.{ts,test.ts}` and `lib/grade/submission-kind.{ts,test.ts}`
files. **I edited only this file** - no source, no test, no other doc. None of
these mid-flight paths intersect any file this row reads or proposes to edit
(verified below, section 3); the file this round's own re-verification
depends on for a read-only citation, `classTrendsDraft.not-postable.test.ts`,
is **not** in this list - it is not currently modified in the working tree, so
its round-1 citation (section 3 table) was re-read at HEAD `58a4254` and is
current as stated, not carried forward from round 1 unchecked.

**No code or test file was changed in this round**, so the repo's four gates
(`npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`) were not run
against this row - there is nothing for them to check yet, and running `tsc`
here would race the wave gate other agents may be holding
(`this-repo.md` section 2, "exactly one caller runs `tsc`"). Every line count
and every grep below was executed by me, this turn, from the repo root, in
this round - none are carried forward from round 1 without re-running the
command.

---

## Rulings applied this round (orchestrator, round 1 check)

The round-1 check returned NOT CLEAN: 3 blockers, 5 majors, 9 minors. Three
rulings settled the blockers and are load-bearing for everything below; they
are restated here (not just referenced) because the disposition table in
section 12 checks every subsequent section against them.

- **W1 (settles B1):** `RecordingTab.tsx:569` (the TabShell **subtitle**) is
  now IN SCOPE for this row - it is rendered above this tool, unconditionally,
  for all twelve inner views, and asserts a plain factual falsehood in the
  invasive direction for eleven of them. `:567` (eyebrow), `:568` (title) and
  `:591` (aria-label) stay layer 3, escalated, not bundled.
- **W2 (settles B2):** the privacy disclosure's **second sentence** (the
  screen/window recommendation and the three named surfaces to close) must be
  frozen as a literal - zero characters changed - because the round-1
  recommended fix already left it untouched. The noun-keyword approach is
  retired for that sentence; it is replaced by exact-string protection.
- **W3 (settles B3):** AC-1 gains an explicit anchor-resolves assertion with
  its own stated direction of failure, so a mutation that destroys the
  anchor cannot pass by returning early from an unresolved `indexOf`.

## Reframing the row

Per the round-1 check's closing point: three of the four in-tool strings an
instructor reads are already correct (`:725-726`, `:801`, `:244` - see section
1). The row is better stated as **one word, one hint, one duplicated error
string, and the tab subtitle** than as "layer 1 now, layer 3 maybe later" -
the shared TabShell subtitle is no longer a someday-escalation, it is the
single largest remaining inaccuracy this row closes, larger in reach (all
twelve inner views) than any of the four in-tool strings (one tool each).

---

## 0. Leverage

This is a bug fix, not a new or changed capability - the tool's behaviour
(reads frames off a shared screen, discards them, never saves video) is
unchanged; only the words describing that behaviour move to match it, plus
one shared header string that misdescribes all twelve inner views of the tab
this tool sits under. **Correction from round 1:** the fired trigger is **"bug
fix,"** not "doc correction" - every changed path in this row's own `owns`
table (section 3) is under `src/`, not `docs/`; only this scoping artifact
itself lives under `docs/`. The disposal is unchanged (no claim is made, and
none is owed), only the label was wrong.

**Fired trigger: "bug fix" exemption in `seats.md`'s Acceptance criteria
section - "On a bug fix, a refactor, a doc correction or an owner
verification there is no claim to make; record that as the fired trigger and
move on."** No leverage claim is made, and none is owed.

---

## 1. Re-measuring row A18's own instrument

Every citation below was re-opened this round, not copied from round 1.

| Row A18 claim | Command | Result |
|---|---|---|
| `WalkthroughAnnouncementPanel.tsx:515` calls `start({ saveVideo: false })` | `Read` the file at that line | **Confirmed**, verbatim: `await start({ saveVideo: false });` at line 515. |
| `:801` tells the instructor a capture does not survive a reload | `Read` lines 800-803 | **Confirmed**, unchanged from round 1. |
| `:725-726` "Share your screen and click through a series of LMS pages" is the house style to match | `Read` lines 724-728 | **Confirmed** verbatim, including "the app reads what is visible." |
| `:883` says "Record and stop a walkthrough first - nothing has been read yet" | `Read` line 883 | **Confirmed** verbatim, in scope (AC-1). |
| `:871` "Generate video script" | `Read` line 871 | **Confirmed** verbatim. Not in scope - names an output, not an action. |
| `:937` "Video script draft" legend | `Read` line 937 | **Confirmed** verbatim. Protected (AC-4). |
| `AnnouncementCourseFieldset.tsx:253-254` privacy disclosure | `Read` lines 252-255 | **Confirmed** verbatim (see full text in section 4, AC-3). In scope for the word "record" only; second sentence now frozen (W2). |
| `:244` notes-box label | `Read` line 244 | **Confirmed** verbatim (it is a template literal with a live character count appended; the wording itself is unchanged and contains no misleading word). |
| `walkthrough-announcement.ts:392` and `:538` "Nothing was captured yet - record a walkthrough first." | `grep -n "Nothing was captured yet" src/app/actions/walkthrough-announcement.ts` | **Confirmed**, both lines identical, verbatim. In scope (AC-2). |
| `WalkthroughAnnouncementPanel.tsx` is 979 lines against the 1000-line ceiling | `wc -l` (Bash) **and** `@(Get-Content <path>).Count` (PowerShell), both run this round | **Confirmed both ways: 979.** 21 lines of headroom, unchanged. |
| `walkthrough-announcement.ts` is 602 lines | Same two commands, this round | **Confirmed both ways: 602.** |
| `RecordingTab.tsx` is the mount file, at 917 lines | `wc -l` and `@(Get-Content).Count`, this round | **Confirmed both ways: 917.** 83 lines of headroom against the 1000-line ceiling enforced by `recording-split.structure.test.ts:47-53`. |

**On the path correction from round 1 (M4 - striking the drift framing):**
Row A18's own text never gives a path for the mount file at all - it says
only "The mount is pinned by `walkthrough-announcement.structure.test.ts`,
which reads `RecordingTab.tsx` as source text," naming no directory. Round 1
mischaracterised this silence as an "upstream correction" ("a plausible-
looking path that does not resolve"), which manufactures a hit in the one
section whose purpose is re-measurement, not correction of the row. **The
honest statement is: the row was silent on the path, and I resolved it
myself** - `find src -iname RecordingTab.tsx` returns exactly one file,
`src/app/components/RecordingTab.tsx` (917 lines, confirmed above). There is
no second drift to report and no "no other drift found" claim is made -
every other cited line, string and file in the row resolved exactly as
stated, and that is reported plainly above rather than under a heading that
implies a search for drift that did not happen.

---

## 2. The three layers, and the boundary

### Layer 1 - user-facing copy in this tool, plus the shared tab header (IN SCOPE)

Re-derived independently this round with a fresh scan, not carried from round 1:

```
grep -in "record" src/app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx
grep -in "record" src/app/components/walkthrough-announcement/AnnouncementCourseFieldset.tsx
grep -in "record" src/app/actions/walkthrough-announcement.ts
```

**Panel: 15 hits** (round 1 said 14 and then listed 15 lines - the recount
below is the corrected, internally-consistent figure), at lines 3, 15, 31,
39, 42, 45, 46, 92, 94, 129, 177, 753, 852, 883, 934. Of these, exactly
**one** (line 883) is rendered, user-facing prose that wrongly claims the app
records. The rest are code comments (3, 15, 31, 92, 94, 129, 177, 753, 852,
934) or an import path/identifier (39, 42, 45, 46). Two of the comments (31,
753) use the specific stale phrase "the record button" - see AC-6 below;
this was previously left as an unwatched residual (round 1's R2) and is now
gated cheaply instead (M5's fix).

**Fieldset: 2 hits** (19 the CSS import, 253 the disclosure) - unchanged from
round 1's count; no discrepancy here.

**Actions file: 6 hits** (round 1 said 5 and omitted one - the recount below
is the corrected figure): 3 (header comment), 80 (the built-in TypeScript
utility type `Record<string, unknown>` - a false positive a naive
whole-word-free scan would wrongly flag), 156 (a comment), **392 and 538**
(the error string, in scope), and **527** ("never posted anywhere; the
instructor reads it, edits it, and re-records" - a comment describing a
recording the instructor makes *elsewhere*, not a locus this row touches; not
user-facing, not gated). Round 1 missed line 527 in its own count while
correctly excluding it from scope; both facts are stated here explicitly
rather than only the second.

**Total layer-1 loci: five, across four files, four distinct strings:**

1. `WalkthroughAnnouncementPanel.tsx:883` - the empty-material hint (AC-1).
2. `AnnouncementCourseFieldset.tsx:253` - the privacy disclosure, first
   sentence only (AC-3); second sentence frozen, not edited (W2).
3. `walkthrough-announcement.ts:392` - the announcement-draft empty-input
   error (AC-2).
4. `walkthrough-announcement.ts:538` - the video-script-draft empty-input
   error, identical string to #3 (AC-2).
5. **`RecordingTab.tsx:569` - the shared TabShell subtitle (AC-5, new this
   round per ruling W1).** This is the one locus outside the
   `walkthrough-announcement` directory; it is shared by all twelve inner
   views of the Recording tab, not owned by this tool alone, so its fix
   cannot be a straight word swap - see AC-5 for the twelve-view check.

Additionally, two stale code comments at `WalkthroughAnnouncementPanel.tsx:31,753`
("the record button") are now gated by AC-6, cheaply, rather than left as an
unwatched residual (M5's disposal).

### Layer 2 - identifiers and keys (LEFT, per the row's default)

Unchanged from round 1; this was not challenged by the check and is not
relitigated here beyond re-confirming the same facts still hold:

- **View id `"walkannounce"`**, validated at runtime against
  `RECORDING_LAUNCH_VIEWS`, a literal array at `src/lib/recording-launch.ts:71-84`
  (re-measured this round; round 1 cited `:71-81`, which stopped one line
  short of the array's closing `];` at line 84 - corrected), separate from the
  `RecordingLaunchView` type union at `:57-69` (re-measured; round 1 cited
  `:57-67`, two lines short of the union's closing `| "snapgrade";` at line
  69 - corrected). `isValidView` reads the array, not the type. Also
  load-bearing in `RecordingTab.tsx` at four points (`:63` union, `:75`
  restore guard, `:592` tab-strip literal, `:887-888` mounted panel), and
  pinned by five assertions in `walkthrough-announcement.structure.test.ts`.
  **Priced and left.**
- **The `ta-rec-wta-*` keys (five of them).** Re-confirmed this round: the
  directory-wide canary at `walkthrough-announcement.structure.test.ts:106`
  (`it(` opens here) asserts `expect(distinctKeys.size).toBe(5)` at **line
  111** (re-measured by `grep -n "^  it(\|distinctKeys.size"` on the file this
  round - round 1's own text cited `:106-111` as a range for this canary,
  which is the assertion's actual span and is correct; a separate, unrelated
  citation appears in this round's brief giving `:108` for the same
  assertion, which my own re-grep does not reproduce - I am reporting what I
  measured, at line 111, over what was asserted to me, per this project's own
  "brief from the tree" rule). This canary is the only gate in this repo that
  can see a persisted key added anywhere in this directory; renaming any of
  the five keys would silently drop every instructor's saved course, module,
  notes text and toggle states on their next visit. **Priced and left.**
- **The `recording/RecordingControls.module.css` import**, shared by **56
  files** (re-measured this round: `grep -rln "RecordingControls\.module\.css" src | wc -l`
  returns 56 - my round-1 grep pattern required a literal `recording/` prefix
  and undercounted at 34 by missing same-directory and CSS-`composes`
  importers; this is the corrected, properly-anchored count). One instance,
  confirmed by grep: `src/app/components/recording/LectureScriptPanel.tsx:6`
  (`import controls from "./RecordingControls.module.css";`), a genuine
  recording tool whose own "while you record" copy (line 91) is correct.
  Additionally, `AnnouncementDraftSlot.tsx:17` also imports this module
  (missed in round 1's section-7 list of importers in this directory; now
  listed there). Moving or renaming this stylesheet for one consumer is a
  repo-wide refactor with no copy benefit. **Priced and left.**

### Layer 3 - the tool living under a tab called "Recording" (NOT bundled, escalated)

`RecordingTab.tsx:567` sets `eyebrow="Recording"`; `:568` sets
`title="Record from a camera"`; `:591` labels the inner tab strip
`aria-label="Recording tools"`. All three remain escalated, unchanged by this
round's fix to `:569` (the subtitle, now AC-5, layer 1).

**Correction from round 1 (m3):** round 1's count here was wrong. The
twelve inner views (re-confirmed this round: `RecordingTab.tsx:592`'s
tab-strip literal, `grep -o` for `\["[a-z]+",...\]` pairs, 12 entries) include
**one other** screen-reading tool besides this one that is clearly of the
same shape: `moduledeck` ("Module walkthrough deck", confirmed at
`ModuleDeckCapturePanel.tsx` - screen capture, frames read and discarded,
same as `walkannounce`). `snapgrade` ("Grading (from screenshots)") is
**arguably a third** - `SnapshotGradingPanel.tsx:1-4`'s own header comment
("Arm a role, snap the shared screen... then read and grade") describes the
same discard-after-read shape - but it was left unnamed in round 1's
sentence, which is corrected here rather than repeated.

**A further finding from this round's own twelve-view research (section 4,
AC-5), surfaced but not bundled:** `discussions`, `messages` and `grading`
also capture the shared screen via the same `getDisplayMedia` mechanism
(`useDiscussionCapture.ts:387`, reused by `DiscussionRepliesPanel.tsx`,
`MessageRepliesPanel.tsx`'s own header comment, and
`GradingRecordingPanel.tsx`'s own header comment respectively) and never save
that capture as a video file either - so the count of "screen-reading, not
video-recording" tools under this tab is at least six of twelve, not two or
three. This is **not** a correction to m3 (m3 was about one specific
sentence's count, now fixed above) - it is a new observation from fresh
research, recorded as residual R6 in section 10 rather than acted on, because
acting on it (re-labelling individual tab-strip entries such as "Grading
(from a recording)") is outside this row's charge, which is the shared
TabShell furniture and the walkannounce tool's own copy, not the twelve
tab-strip labels themselves.

**Correction to section 9's pricing:** the round-1 escalation priced the
whole layer-3 fix as "a one-line change in `RecordingTab.tsx:567,591`" -
wrong in both the **line set** (it is three lines - `:567` eyebrow, `:568`
title, `:591` aria-label - not two, and `:568` was omitted entirely) and the
**character** (a title fix is not a find-and-replace: `title="Record from a
camera"` makes the identical kind of universal, false-for-most-views claim
that the old subtitle made, for the same twelve views, so it inherits the
exact same "must hold for all twelve, or say why not" problem this round
solved for the subtitle - it is not free just because it is short). See
section 9 for the corrected pricing.

---

## 3. Owns - derived by command, not asserted

**Command 1** (files containing the strings this row changes):

```
grep -rln "Record and stop a walkthrough first\|Nothing was captured yet - record a walkthrough first\|while you record" src
```

Result, pasted in full (four lines, not three - round 1's text said "the
three files below, and no others" while its own command returns four):

```
src/app/actions/walkthrough-announcement.ts
src/app/components/recording/LectureScriptPanel.tsx
src/app/components/walkthrough-announcement/AnnouncementCourseFieldset.tsx
src/app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx
```

`LectureScriptPanel.tsx:91` reads `"Draft a teleprompter-ready script with AI,
edit it, then read it while you record."` - confirmed correct as written:
this panel sits inside the `record` view's always-mounted stack and is
literally about narrating while the camera/screen records. **Excluded on
this stated basis**, not silently dropped.

**Command 2** (files that read any of the walkthrough-announcement three as
source text):

```
grep -rln "WalkthroughAnnouncementPanel\.tsx\|AnnouncementCourseFieldset\.tsx\|actions/walkthrough-announcement\"" src --include="*.test.ts"
```

Result: three files, one a false positive (`useAnnouncementDraftSlots.test.ts:21`
matches only a code comment naming the panel file and never reads any file as
source text - confirmed again this round: `grep -n "readFileSync\|import \* as fs\|from \"fs\""`
on that file returns nothing). Excluded. Unchanged from round 1.

**Command 3** (new this round, for the subtitle and the stale-comment fix):

```
grep -rln "Record video from any attached camera" src
grep -rln "RecordingTab\.tsx" src --include="*.test.ts"
grep -rln "record button" src --include="*.test.ts"
```

Results: the old subtitle literal exists in exactly one file
(`RecordingTab.tsx` itself - no duplicate to hunt down). Nine test files read
`RecordingTab.tsx` as source text
(`message-replies.structure.test.ts`, `module-deck-capture.structure.test.ts`,
`ModuleDeckCapturePanel.wiring.test.ts`, `recording-split.structure.test.ts`,
`snapshot-grading.structure.test.ts`, `buttonVariant.test.ts`,
`walkthrough-announcement.structure.test.ts`, `file-size-ceiling.structure.test.ts`,
`recording-launch.test.ts`); each was opened this round and grepped for
`eyebrow|subtitle=|title=|Record from a camera|Recording tools` - **none
match in any of the nine** (all nine greps returned empty). No test anchors
on the subtitle text, so AC-5's edit collides with nothing. No test file
contains the phrase "record button" either, so AC-6 collides with nothing.

**Final owns:**

| File | Role | Line(s) |
|---|---|---|
| `src/app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx` | Edit: the empty-material hint (AC-1); two stale comments (AC-6) | 883; 31, 753 |
| `src/app/actions/walkthrough-announcement.ts` | Edit: duplicated empty-input error string (AC-2) | 392, 538 |
| `src/app/components/walkthrough-announcement/AnnouncementCourseFieldset.tsx` | Edit: the privacy disclosure's first sentence only (AC-3) | 253 |
| **`src/app/components/RecordingTab.tsx`** | **Edit: the shared TabShell subtitle (AC-5, new this round)** | **569** |
| `src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts` | Add new source-text assertions (AC-1, AC-3, AC-4, AC-6); existing 17 `describe(` blocks (`grep -c "^describe(" walkthrough-announcement.structure.test.ts`, re-run this round, still 17) must keep passing unmodified - checked individually against every existing `indexOf`/`toMatch` target (section 5) | New describes appended |
| `src/app/actions/walkthrough-announcement.test.ts` | Add new source-text assertions (AC-2); existing runtime assertions at `:209` and `:431` only check `toHaveProperty("error")`, never the string's text | New describe appended |
| **`src/app/components/recording/recording-split.structure.test.ts` or a sibling structure test** | **Add new source-text assertion (AC-5).** This file already reads `RecordingTab.tsx` as source text for unrelated reasons (the twelve-tab-strip count, the restore guard); it is the natural home for the subtitle check, though a new adjacent test file is equally acceptable - the assertion, not its filename, is the requirement. Re-confirmed this round: none of its 12+ existing `it(` blocks anchor within 400 characters of line 567-569 (checked directly, section 5). | New `it(` appended |
| `src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts` | **Read-only, no edit.** Re-confirmed at HEAD `58a4254` this round (not in the concurrent-edit set at this measurement): "canary 2a" (`:185-195`, re-grepped this round, unchanged line numbers) uses `WalkthroughAnnouncementPanel.tsx` as a positive-control fixture for a forbidden-import-graph walk, asserting only `violations.length > 0` - never inspects string literals. None of this row's edits touch an import statement, so this test is unaffected. | n/a |

Nothing else reads these five strings/loci as source text; nothing else
needs to change.

---

## 4. Acceptance criteria

Each names the object under comparison, the instrument, and the direction of
failure. Every assertion pins a FACT and a STRUCTURAL anchor - never the
replacement sentence itself - per this row's own instruction and the
recorded class of source-text tests over-specifying (`traps-tests.md`).

### AC-1: the empty-material hint stops saying "Record" (revised - fixes B3)

**Object:** the JSX text rendered when `!hasMaterial` is true, at
`WalkthroughAnnouncementPanel.tsx:883`.

**Instrument**, corrected from round 1 to close two named holes: the missing
anchor-resolves check (B3), and the reformat risk the check named (the
panel's other hints at `:800-803` and `:885-887` are already multi-line, so a
reflow of `:883` into the same shape is a realistic, non-adversarial edit,
not just a sabotage scenario).

```
const ANCHOR_RE = /\{!hasMaterial\s*&&\s*<p\s+className=\{styles\.fieldHint\}>/;
const anchorMatch = source.match(ANCHOR_RE);
expect(anchorMatch, "expected to find the empty-material hint's conditional " +
  "+ <p className={styles.fieldHint}> opening (whitespace-tolerant); if this " +
  "is not found, the conditional's returned content was likely replaced with " +
  "something other than a reworded <p> - e.g. null - which is the wrong fix"
).toBeTruthy();
const afterAnchor = anchorMatch!.index! + anchorMatch![0].length;
const closeIdx = source.indexOf("</p>", afterAnchor);
expect(closeIdx, "expected to find the hint's closing </p>").toBeGreaterThan(-1);
const hintText = source.slice(afterAnchor, closeIdx).replace(/\s+/g, " ").trim();
```

- **Assertion 1 (anchor resolves, NEW this round):**
  `expect(anchorMatch).toBeTruthy()`. **Direction of failure: RED if the
  conditional's `<p className={styles.fieldHint}>` opening is not found at
  all** - this is the direct fix for B3: under S1b's mutation
  (`{!hasMaterial && null}`), this assertion fails with an explicit message
  instead of silently returning early from an unresolved `indexOf`. **This
  assertion must run, and must be allowed to throw, before any extraction
  logic** - do not wrap it in a defensive `if (!anchorMatch) return;` ahead of
  it, or the mutation this criterion exists to catch passes silently again,
  which is exactly B3's failure mode.
- **Assertion 2 (close tag resolves, NEW this round):**
  `expect(closeIdx).toBeGreaterThan(-1)`. **Direction of failure: RED if no
  `</p>` follows the anchor.**
- **Assertion 3:** `hintText` does **not** match `/\brecord(ing)?\b/i`.
  **Direction of failure: RED if "record"/"recording" (whole word) appears.**
- **Assertion 4:** `hintText.length` is greater than 0, **and** `hintText`
  matches `/\b(captur|read)\w*\b/i`. **Direction of failure: RED if the hint
  is deleted outright or reworded to drop any mention of capturing/reading** -
  closes the loophole where assertion 3 would pass trivially on empty text.

**Why the regex anchor, not a plain-string `indexOf` (addresses the
second-order path the check named):** a plain string anchor breaks the
moment anyone inserts a line break between `&&` and `<p`, exactly the shape
`:800-803` and `:885-887` already use elsewhere in this same file. The
whitespace-tolerant regex plus the `.replace(/\s+/g, " ")` normalization on
the extracted text means a pure reflow of line 883 into that same multi-line
shape, with identical words, does not trip this criterion - see sabotage row
S1c.

**Recommended replacement** (not itself pinned): `"Capture and stop a
walkthrough first - nothing has been read yet."`

### AC-2: the empty-input error strings stop saying "record a walkthrough" (unchanged from round 1)

Not challenged by the round-1 check; re-verified, not re-designed.

**Object:** the two identical error strings at `walkthrough-announcement.ts:392`
and `:538` (re-confirmed this round, both lines, identical text).

**Instrument:** a new source-text assertion in `walkthrough-announcement.test.ts`,
anchored on the stable, unchanged prefix `"Nothing was captured yet - "`.

- Assertion (a): `(source.match(/Nothing was captured yet - /g) ?? []).length === 2`.
  **Direction of failure: RED if the count is not exactly 2** - named failure
  modes: a stray third guard added elsewhere with the same prefix, or one of
  the two edited without the other.
- Assertion (b): for each of the two matches, the text from the prefix to the
  following `.` does not match `/\brecord\b/i`. **Direction of failure: RED
  if either occurrence still contains the whole word "record".**

**Recommended replacement:** `"Nothing was captured yet - capture a
walkthrough first."`

### AC-3: the privacy disclosure drops the word "record," first sentence only - second sentence frozen verbatim (revised - fixes B2)

**Object:** the paragraph at `AnnouncementCourseFieldset.tsx:253-255`, current
text (re-read this round, verbatim):

> "Frames from your screen are sent to a third-party AI provider to be read
> while you record. Share a single window rather than your whole screen, and
> close any gradebook, inbox, or student submission first."

**What changed and why (W2).** The round-1 check demonstrated a rewrite that
keeps all seven of round-1's keyword nouns while inverting the advice: "You
may share a single window or your whole screen; there is no need to close
your gradebook, inbox, or student submission first." Every keyword present,
notice destroyed. The recommended fix in round 1 (and this round) changes
exactly one word, in the **first** sentence only - "record" to "capture" -
and leaves the **second** sentence, the one carrying the actual weakening
risk, unchanged by zero characters. That fact makes it freezable: instead of
checking for the presence of nouns the second sentence contains, this
criterion now checks that the second sentence, whitespace-normalized, is
byte-for-byte the frozen literal below. This makes the round-1 attack
unrepresentable rather than merely undetected by a stronger keyword list -
the construction `iteration-caps.md` and `seats.md` both call for over
"strengthening the same mechanism."

**Instrument:**

```
const fieldsetCloseIdx = source.lastIndexOf("</fieldset>");
const pOpenIdx = source.lastIndexOf('<p className={styles.fieldHint}>', fieldsetCloseIdx);
expect(pOpenIdx, "expected to find the privacy disclosure's opening <p> " +
  "before the fieldset's close").toBeGreaterThan(-1);
const pCloseIdx = source.indexOf("</p>", pOpenIdx);
expect(pCloseIdx, "expected to find the disclosure's closing </p>").toBeGreaterThan(-1);
const raw = source.slice(pOpenIdx + '<p className={styles.fieldHint}>'.length, pCloseIdx);
const normalized = raw.replace(/\s+/g, " ").trim();

const FROZEN_SECOND_SENTENCE =
  "Share a single window rather than your whole screen, and close any " +
  "gradebook, inbox, or student submission first.";
expect(normalized.endsWith(FROZEN_SECOND_SENTENCE),
  "the disclosure's second sentence - the screen/window recommendation and " +
  "the three named surfaces - must not change by even one character"
).toBe(true);

const firstSentence = normalized.slice(0, normalized.length - FROZEN_SECOND_SENTENCE.length).trim();
expect(firstSentence.length, "expected non-empty text before the frozen second sentence").toBeGreaterThan(0);
```

- **Assertions 1-2 (anchor resolves, NEW this round, closing the same class
  of hole W3 fixed in AC-1):** `pOpenIdx > -1` and `pCloseIdx > -1`.
  **Direction of failure: RED if the disclosure paragraph is not found at
  all** (e.g. deleted outright). See sabotage row S3c.
- **Assertion 3 (the fix for B2, NEW this round):** `normalized.endsWith(FROZEN_SECOND_SENTENCE)`.
  **Direction of failure: RED if the second sentence changes in any way** -
  this single assertion now covers the recipient-adjacent scope
  recommendation, the window-vs-screen advice, and all three named surfaces
  (gradebook, inbox, student submission) at once, closing the "`/screen/i`
  guards nothing in the recommendation" hole the check named, without
  re-litigating which nouns to keyword-check.
- **Assertion 4 (non-empty first sentence):** `firstSentence.length > 0`.
  **Direction of failure: RED if the whole disclosure collapses to just the
  frozen second sentence** (the word-fix path deleted instead of reworded).
- **Assertion 5:** `firstSentence` does not match `/\brecord(ing)?\b/i`.
  **Direction of failure: RED if "record"/"recording" (whole word) survives
  in the mutable sentence.**
- **Assertion 6 (closes the "nothing pins 'Frames'" hole, NEW this round):**
  `firstSentence` matches `/\bframes\b/i`. **Direction of failure: RED if the
  fix drops WHAT is transmitted** - the check's own example, "Information
  from your screen is sent...", passes every other check while silently
  dropping this fact; this assertion catches it directly.
- **Assertion 7:** `firstSentence` matches `/third-party/i`. **Direction of
  failure: RED if the recipient's arm's-length nature is dropped.**
- **Assertion 8:** `firstSentence` matches `/AI provider/i`. **Direction of
  failure: RED if the recipient type is dropped.**

**Recounted, by command (M1's fix):** eight `expect(...)` calls total in the
pseudocode above - two anchor-resolves, one frozen-suffix equality, one
non-empty guard, and four fact checks on the first sentence - counted
directly by reading the block, not carried from round 1's internally
inconsistent "four facts, four checks... six keyword checks" over what was,
recounted, seven regexes.

**Recommended replacement:** `"Frames from your screen are sent to a
third-party AI provider to be read while you capture. Share a single window
rather than your whole screen, and close any gradebook, inbox, or student
submission first."` - checked against the instrument above: the second
sentence is copied verbatim (zero characters changed, satisfying assertion
3); the first sentence contains "Frames" (assertion 6), "third-party"
(assertion 7), "AI provider" (assertion 8), and no whole-word "record"
(assertion 5).

### AC-4: the protected video-script wording is untouched (revised - fixes m8)

**Object:** the four loci row A18 rules must survive: the code comment at
`WalkthroughAnnouncementPanel.tsx:933-934`, the "Video script draft" legend
at `:937`, the "Generate video script" button label at `:871`, and the
downloaded filename `"walkthrough-video-script.txt"` at `:964` (all
re-confirmed this round at these exact line numbers).

**What changed and why (m8).** Round 1 pinned the two-line comment at
`:933-934` as one verbatim string, spanning a real line break plus
indentation in the source (`"AC5: the video script - never posted, just read
aloud while\n          re-recording."`). A pure reflow with zero semantic
change - moving the wrap point - would go RED under that pin, which is
exactly the recorded over-specification class this repo already carries two
instances of. The other three pins (legend, button label, filename) are
single-line literals and are unaffected; only the comment pin changes.

**Instrument:**

- Legend: `expect(source).toContain('Video script draft')`.
- Button label: `expect(source).toContain('Generate video script')`.
- Filename: `expect(source).toContain('"walkthrough-video-script.txt"')`.
- Comment, **now two independent fragment checks instead of one whole-string
  pin**: `expect(source).toContain('read aloud while')` and
  `expect(source).toContain('re-recording')`. Each fragment sits entirely
  within one physical source line today (confirmed: "read aloud while" ends
  line 933; "re-recording" begins line 934 after the wrap), so neither
  depends on where the line break falls - a rewrap that keeps the same words
  leaves both fragments intact (sabotage row S4c); a real edit that drops
  either phrase's words still trips its own check (sabotage row S4b).

**Direction of failure: RED if any of the four loci is altered, or if either
comment fragment is removed.** A pure reflow of the comment must NOT go red
under the two-fragment design - that is the fix, checked in section 6.

### AC-5: the shared TabShell subtitle stops promising every inner view records (NEW this round - implements W1)

**Object:** `subtitle="Record video from any attached camera or your screen,
preview it live, and download the takes."` at `RecordingTab.tsx:569`, shared
by all twelve inner views listed in the tab-strip literal at `:592`
(`record`, `announcement`, `discussions`, `messages`, `grading`, `snapgrade`,
`moduledeck`, `walkannounce`, `speed`, `captions`, `slides`, `avatar` -
re-confirmed this round: 12 entries by direct read of `:592`, matching
`recording-split.structure.test.ts:126-132`'s own "exactly twelve" canary).

**Why a straight word swap cannot work here (the constraint from the
ruling).** The current subtitle asserts, unconditionally, that the tab
records video, previews it live, and produces downloadable takes. That is
true for `record`/`announcement` and, more narrowly, for `avatar` and part of
`slides` (voice-sample recording); it is false as a universal claim for the
other seven-to-eight views, each of which either reads a shared screen and
discards the frames, or works from a recording the instructor already has.
Deleting the recording language outright would make the subtitle false in
the other direction for the views that genuinely do record. **I checked the
replacement below against each of the twelve views, individually, citing
what I opened for each:**

| View (key, label) | What it actually does | Citation opened this round | Which clause of the replacement subtitle applies |
|---|---|---|---|
| `record`, "Record" | Records camera/screen, previews live, downloads takes | `RecordingTab.tsx:686-740` (StagePanel + TakesPanel in the always-mounted stack) | "some record and preview live" |
| `announcement`, "Record announcement" | Shares the identical record/preview/download panel as `record` | `RecordingTab.tsx:631-828` (`display: recView === "record" \|\| recView === "announcement"`) | "some record and preview live" |
| `discussions`, "Discussion replies" | Screen-shares to read Canvas discussion pages, drafts replies; nothing saved as video | `useDiscussionCapture.ts:387` (`navigator.mediaDevices.getDisplayMedia`) | "others read a shared screen" |
| `messages`, "Message replies" | Same mechanism as discussions, its own header comment says so verbatim | `MessageRepliesPanel.tsx:1-11` header comment ("mirroring DiscussionRepliesPanel.tsx's own header note") | "others read a shared screen" |
| `grading`, "Grading (from a recording)" | Reuses the discussion-capture screen-share to read submissions; nothing saved as video | `GradingRecordingPanel.tsx:1-12` header comment ("capture (useDiscussionCapture, reused whole - R4)") | "others read a shared screen" |
| `snapgrade`, "Grading (from screenshots)" | Snaps the shared screen, reads and grades; nothing saved as video | `SnapshotGradingPanel.tsx:1-4` header comment ("Arm a role, snap the shared screen...") | "others read a shared screen" |
| `moduledeck`, "Module walkthrough deck" | Screen capture, frames read and discarded, built into a deck | `RecordingTab.tsx:876` comment ("an in-progress screen-share capture") | "others read a shared screen" |
| `walkannounce`, "Announcement from a walkthrough" | This row's own subject: screen capture, frames read and discarded, never saved as video | `WalkthroughAnnouncementPanel.tsx:515` (`start({ saveVideo: false })`) | "others read a shared screen" |
| `speed`, "Change speed" | Re-encodes an existing take/backup/library file at a different speed; nothing newly captured | `SpeedPanel.tsx:1-11` header comment ("watch a picked video back... session take / backup folder / library file") | "others work from a recording you already have" |
| `captions`, "Caption a video" | Burns captions onto an existing take/library file; nothing newly captured | `SpeedPanel.tsx:9` ("Source picking reuses `useVideoImport()` exactly as CaptionStudio.tsx does") | "others work from a recording you already have" |
| `slides`, "Narrate a deck" | Narrates an uploaded PowerPoint; a voice sample IS recorded via the mic for cloning | `useVoiceCloning.ts` (confirmed via `grep -l "getUserMedia\|MediaRecorder"` over `slide-studio/`) | "some record" (the voice-sample path) |
| `avatar`, "Avatar" | Records camera samples to train a likeness | `AvatarStudioPanel.tsx` + `useAvatarStudio` (camera-capture consent flow) | "some record" |

**Every one of the twelve is covered by at least one clause of the proposed
subtitle, and none is asserted something false about it** - the sentence
below is a disjunctive description of the tab's contents ("some do X, others
do Y"), not a uniform claim that every view does everything, which is the
specific defect the ruling requires fixed.

**Recommended replacement** (not itself pinned by the test, for the same
over-specification reason as every other AC in this document): `"Camera,
screen, and recording-library tools for this course. Some record and
preview live; others read a shared screen, or work from a recording you
already have."`

**Instrument** (source-text assertion, new `it(` in
`recording-split.structure.test.ts` or a sibling structure test - see the
`owns` table's note on filename flexibility):

```
const eyebrowIdx = source.indexOf('eyebrow="Recording"');
expect(eyebrowIdx, "expected to find eyebrow=\"Recording\" on the TabShell " +
  "this tool is rendered under").toBeGreaterThan(-1);
const subtitleMatch = source.slice(eyebrowIdx, eyebrowIdx + 400).match(/subtitle="([^"]*)"/);
expect(subtitleMatch, "expected to find a subtitle attribute near the " +
  "Recording tab's TabShell").toBeTruthy();
const subtitleText = subtitleMatch![1];
```

- **Assertion 1 (anchor resolves):** `eyebrowIdx > -1`. **Direction of
  failure: RED if the eyebrow this subtitle sits beside disappears** - an
  early, cheap signal that the whole `TabShell` call was restructured.
- **Assertion 2 (anchor resolves):** `subtitleMatch` is truthy. **Direction
  of failure: RED if no `subtitle="..."` attribute is found within 400
  characters of the eyebrow.**
- **Assertion 3 (regression guard):** `subtitleText !==
  "Record video from any attached camera or your screen, preview it live, and download the takes."`.
  **Direction of failure: RED if the exact old, false-for-most-views
  sentence is still present verbatim.**
- **Assertion 4 (the actual fix, checkable by construction rather than by
  wording):** `subtitleText` matches `/\brecord/i` **and** matches
  `/\bread\b/i|/\bcaptur\w*\b/i`. **Direction of failure: RED if the subtitle
  mentions recording without also acknowledging that some views only read or
  capture** - this is a necessary-not-sufficient proxy for "does not claim
  every view records," chosen because it is mechanically checkable without
  pinning exact wording, and because it would also have caught the ORIGINAL
  defect (the current live sentence contains no form of "read" or "captur"
  at all, so this exact check fails against today's text, confirming it
  discriminates the real bug, not just a hypothetical one - see sabotage
  row S5).

**Honest limit, stated rather than oversold:** these four assertions check
that the sentence is not the old one, and that it lexically acknowledges
both categories of view. They cannot check that the chosen prose *reads
naturally* or is *unambiguous* to an instructor - no component is rendered
by any test in this repo, so that is a reading claim only. Recorded as
residual R5.

### AC-6: the two stale "record button" comments are corrected (NEW this round - resolves M5)

**Object:** the phrase "the record button" at `WalkthroughAnnouncementPanel.tsx:31`
and `:753` (re-confirmed this round via `grep -in "record button"`, exactly
two hits, both lines). There is no "record button" anywhere in this panel -
the actual controls are labelled "Start capture" / "Stop capture" (`:807`,
re-confirmed this round).

**Why this is gated now instead of left as a residual (M5's disposal).**
Round 1's residual R2 justified leaving these on the claim that "no
acceptance criterion or test can observe a code comment's wording" - false,
and load-bearing: AC-4 above pins comment fragments, and this repo has 17
`*.structure.test.ts` files that read comments as source text
(`find src -name "*.structure.test.ts" | wc -l`, re-run this round). The
check's own suggested fix is cheap enough to take rather than argue past:
two `not.toMatch` checks.

**Instrument:**

```
expect((source.match(/\brecord button\b/i) ?? []).length,
  "expected zero occurrences of the stale phrase \"record button\" - the " +
  "actual controls are \"Start capture\" / \"Stop capture\""
).toBe(0);
```

**Direction of failure: RED if the phrase "record button" (whole phrase,
case-insensitive) appears anywhere in the file.** This is a count assertion
with a named failure mode (traps-tests.md's requirement): it fires today (2
occurrences) and must fire again if a future comment reintroduces the phrase.

**Recommended replacement:** "before the capture controls" at both sites (or
any wording that does not use the word "record" for these buttons); not
itself pinned.

---

## 5. Anchor-collision check against the existing structure tests

Extended this round to cover the two new anchors (AC-5's `eyebrow`/`subtitle`
pair in a `RecordingTab.tsx`-reading test, and AC-6's file-wide phrase scan),
in addition to re-confirming round 1's check for AC-1/AC-3/AC-4.

- **AC-1/AC-3/AC-4 (`walkthrough-announcement.structure.test.ts`, 457 lines,
  re-measured this round by both `wc -l` and `@(Get-Content).Count`):** the
  file's `hasMaterial`-adjacent assertions anchor on `disabled={` (`:397-411`,
  re-confirmed - not `savedFormatsState === "loading"` as a standalone
  anchor; see m4's correction below) and `onRetryOptions=` (`:382-395`),
  neither within 300 characters of line 883. No existing assertion reads the
  fieldset's tail or the video-script block. **No collision, re-confirmed.**
- **Correction (m4):** round 1 described the `:397-411` assertion's anchor as
  `savedFormatsState === "loading"`, itself used as the disable-gate anchor,
  and separately said it "uses `disabled={` only in a comparison." Re-read
  this round: the assertion slices the source around the literal
  `savedFormatsState === "loading"` substring and then checks that slice
  **contains** `disabled={` as a plain substring test - it does not anchor
  ON `disabled={` at all; `savedFormatsState === "loading"` is the only
  anchor. Round 1's conclusion (no collision with AC-1's territory) was
  correct; only the description of the mechanism was wrong, and is corrected
  here.
- **AC-5 (new):** the proposed `it(` anchors on `eyebrow="Recording"` and a
  `subtitle="..."` attribute within 400 characters of it. Checked against
  `recording-split.structure.test.ts`'s own 12+ existing `it(` blocks (line
  ranges re-read this round): none contain the strings `eyebrow`, `subtitle=`,
  or `title=` anywhere in the file (`grep -n` returns nothing), so there is
  no existing assertion to collide with, and the new one introduces no
  anchor any other block already depends on.
- **AC-6 (new):** a whole-file phrase scan for "record button" collides with
  nothing by construction (it does not anchor on a code structure another
  test depends on) and no existing test contains that phrase (`grep -rln
  "record button" src --include="*.test.ts"` returns nothing, re-run this
  round).

**No collision found**, across both the four original criteria and the two
new ones.

---

## 6. Sabotage per criterion

**None of this has been executed** - this round writes no code and no test
file. Rows carried from round 1 are re-stated against the REVISED
instruments where those changed (AC-1, AC-3, AC-4); rows are added for the
new criteria (AC-5, AC-6) and for the negative controls the m8/W3 fixes call
for (a reflow must NOT go red).

| # | Criterion | Mutation | Expected before restore | Expected after restore | Discriminates? |
|---|---|---|---|---|---|
| S1a | AC-1 asrt.3 | Leave `:883` unedited | RED - "Record" present | GREEN once fixed | Yes - direct word-boundary check. |
| S1b | AC-1 asrt.1 (**fixes B3**) | Apply the over-eager fix `{!hasMaterial && null}` instead of rewording | RED - `anchorMatch` is `null`, assertion 1 throws with its stated message | GREEN once real hint text is restored | Yes - this is the exact mutation B3 named; the new anchor-resolves assertion fails explicitly instead of an unresolved `indexOf` letting a defensive early-return pass silently. |
| S1c | AC-1 (negative control, NEW - addresses the reformat risk the check named) | Reflow line 883 into the same multi-line shape as `:800-803`, identical words, no semantic change | GREEN | GREEN (must **not** flip) | Confirms the regex anchor + whitespace normalization tolerate a realistic, non-adversarial reformat - the risk the check explicitly flagged. |
| S2a | AC-2 asrt.(a) | Duplicate the error-returning guard a third time with the same prefix | RED - count is 3 | GREEN once the duplicate is removed | Yes, for a stray third copy specifically; does not discriminate a prefix-text change at constant count 2 (that is S2b's job). |
| S2b | AC-2 asrt.(b) | Fix only `:392`, not `:538` | RED - the unedited occurrence still matches `/\brecord\b/i` | GREEN once both are edited | Yes - the exact failure mode the row calls out. |
| S3a | AC-3 asrt.5 | Leave `:253` unedited | RED - "record" present in `firstSentence` | GREEN once fixed | Yes. |
| S3b | AC-3 asrt.3 (**fixes B2, the demonstrated attack**) | Apply the word fix to the first sentence correctly, then invert the second sentence to "there is no need to close your gradebook, inbox, or student submission first" while keeping every noun the old design checked | RED - `normalized` no longer ends with `FROZEN_SECOND_SENTENCE` | GREEN once the second sentence is restored verbatim | Yes - this is the exact rewrite the round-1 check demonstrated defeats a keyword-only design; the frozen-suffix check catches it because the two sentences are no longer byte-equal, regardless of which nouns survive. |
| S3c | AC-3 asrt.1-2 (**fixes the same B3-class hole in AC-3**) | Delete the entire disclosure `<p>` | RED - `pOpenIdx` (or `pCloseIdx`) is `-1`, assertion throws | GREEN once the paragraph is restored | Yes - same construction as S1b, applied here proactively rather than waiting for a second finding of the same class. |
| S3d | AC-3 (negative control, NEW) | Rewrap the two sentences across a different line break, identical words | GREEN | GREEN (must **not** flip) | Confirms whitespace normalization tolerates reflow, same reasoning as S1c. |
| S4 | AC-4 (filename/legend/button) | Change `"walkthrough-video-script.txt"` to any other string | RED - literal mismatch | GREEN once restored | Yes - straightforward. |
| S4b | AC-4 (comment fragments, **fixes m8**) | Delete the word "re-recording" from the comment | RED - `toContain('re-recording')` fails | GREEN once restored | Yes - a real content change still trips its own fragment check. |
| S4c | AC-4 (negative control, **proves m8's fix**) | Rewrap the two-line comment at a different point (e.g. after "just" instead of after "while"), identical words | GREEN | GREEN (must **not** flip) | This is the case round 1's whole-string pin would have failed with zero semantic change - the fragment design must not. |
| S5 | AC-5 asrt.4 | Leave `:569` unedited (today's live text) | RED - contains no form of "read" or "captur", so assertion 4 fails (confirms the check discriminates the real, current bug, not a hypothetical one) | GREEN once replaced | Yes. |
| S5b | AC-5 asrt.4 (regression to the same defect shape, NEW) | Replace the subtitle with new wording that still claims universal recording without acknowledging reading/capturing, e.g. "Camera and screen recording tools - record, preview, and download." | RED - matches `/\brecord/i` but not `/\bread\b/i` or `/\bcaptur\w*\b/i` | GREEN once a disjunctive replacement is used | Yes - catches a regression to the same shape of defect under different wording, not just the literal old sentence (which S5/asrt.3 already covers). |
| S6 | AC-6 | Leave "record button" in either comment | RED - count is 1 or 2, not 0 | GREEN once both are edited | Yes. |

**Cannot-discriminate case, named rather than hidden:** none of the fourteen
rows above is expected to fail on both mutation and restore, or pass on
both, except the four explicitly-labelled negative controls (S1c, S3d, S4c),
which are expected to stay GREEN through the mutation by design - that is
their whole purpose, and it is stated up front rather than discovered as a
surprise. If the test seat finds any row behaving opposite to its stated
expectation, that is a defect in the assertion's construction.

---

## 7. Strings and loci explicitly NOT changed, and why

| Locus | Text/identifier | Why left |
|---|---|---|
| `WalkthroughAnnouncementPanel.tsx:871` | `"Generate video script"` | Names an output, makes no claim about what this app does. |
| `WalkthroughAnnouncementPanel.tsx:933-934` (comment) | "the video script - never posted, just read aloud while re-recording" | Describes a recording made *elsewhere*, after this tool's job is done - correct as written; protected by AC-4's fragment pins. |
| `WalkthroughAnnouncementPanel.tsx:937` | `"Video script draft"` legend | Same reason; protected by AC-4. |
| `WalkthroughAnnouncementPanel.tsx:964` | `"walkthrough-video-script.txt"` | Downloaded filename for the same protected feature; protected by AC-4. |
| `AnnouncementCourseFieldset.tsx:244` | `"Notes for this walkthrough - optional"` | Contains no misleading word. |
| `AnnouncementCourseFieldset.tsx:253-255` second sentence | Screen/window recommendation, three named surfaces | Frozen verbatim by AC-3 (W2) - not edited, protected. |
| `"walkannounce"` (view id) | `recording-launch.ts`, `RecordingTab.tsx` (4 sites), structure test (5 assertions) | Layer 2, contract not copy; priced in section 2. |
| `ta-rec-wta-*` (5 keys) | `WalkthroughAnnouncementPanel.tsx:97-102` | Layer 2, pinned persistence; priced in section 2. |
| `recording/RecordingControls.module.css` import | `WalkthroughAnnouncementPanel.tsx:39`, `AnnouncementCourseFieldset.tsx:19`, `AnnouncementDraftSlot.tsx:17` | Layer 2, shared by 56 files; priced in section 2. |
| `eyebrow="Recording"` (`:567`) / `title="Record from a camera"` (`:568`) / `aria-label="Recording tools"` (`:591`) | `RecordingTab.tsx` | Layer 3, placement question, escalated in section 9, not bundled. |
| Code comments at `WalkthroughAnnouncementPanel.tsx:3,15,31,92,94,129,177,753,852,934` and `walkthrough-announcement.ts:3,156,527` | Various "record"/"recording" mentions | Not user-facing. `:31` and `:753`'s specific "record button" phrase is now gated by AC-6; the rest describe the code's own history/precedent or a recording the instructor makes elsewhere, and state no user-facing fact incorrectly. |

---

## 8. What could not be determined here

Per `this-repo.md` section 6: no component is rendered by any test in this
repo, so whether the reworded hint, error text, disclosure, and the new
shared subtitle actually read well and remain legible in the real UI (font,
wrapping, truncation across twelve different inner-view contexts) is not
observable from this checkout. This is a reading claim only.

**Added this round:** AC-5's mechanical checks (section 4) are proxies -
they confirm the subtitle is not the old sentence and lexically acknowledges
both "record" and "read/capture" vocabulary, but cannot confirm the chosen
prose is unambiguous or well-written to a human reader. Recorded as R5.

**Also could not be fully reconciled this round:** the round-1 brief's own
citation of `walkthrough-announcement.structure.test.ts:108` for the
five-key canary's assertion does not match this round's direct re-grep
(`expect(distinctKeys.size).toBe(5)` resolves to line 111, with `it(` at
106). I am reporting the measured line rather than silently adopting the
cited one; a fresh checker should re-run `grep -n "^  it(\|distinctKeys.size"
walkthrough-announcement.structure.test.ts` to settle which is current before
relying on either number.

---

## 9. Owner escalation - layer 3 (batched, non-gating)

**What is blocked:** whether the walkthrough-announcement tool (and
`module-deck-capture`, and arguably `snapgrade`, `discussions`, `messages`
and `grading` - section 2's expanded count) should keep living under a tab
whose own `eyebrow` and `title` make the same kind of universal,
mostly-false claim the subtitle made before this round's fix.

**What would unblock it:** a one-line answer - keep the eyebrow/title, or
rename them (and if renaming, to what, and which of the six-plus
screen-reading views move with it).

**What it costs to leave it, corrected this round:** `grep -rn
"eyebrow.*Recording\|Recording tools" src --include="*.test.ts"` returns no
matches (re-run this round), so no test pins either string. **The fix is
three single-line edits, not one** - `:567` (eyebrow), `:568` (title), and
`:591` (aria-label) - round 1's "a one-line change in `:567,591`" both
undercounted the line set (omitting `:568` entirely) and understated the
character of the work: `title="Record from a camera"` makes the identical
shape of universal claim that the old subtitle made, for the same twelve
views, so a competent fix is not a find-and-replace - it needs the same
"check against all twelve, or say why not" treatment AC-5 just did for the
subtitle. The disjunctive technique developed there ("some X, others Y",
verified per-view against a citation) is directly reusable for the title,
should the owner choose to fix it rather than rename the tab outright.

**Recommendation:** unchanged from round 1 - leave the tab name and title
for this row. A16 already ruled a "fan out, do not build a destination"
preference for this tab family; renaming or re-titling touches multiple
tools' placement at once and deserves its own scoped row. If the owner wants
it fixed, the AC-5 technique above is a ready template and the cost is now
accurately priced (three single-line edits, no pinned test, no persisted-key
migration, but a real per-view accuracy check each time, not a trivial
swap).

---

## 10. Residual register

| # | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| R1 | The fourteen sabotage mutations in section 6 are planned, not executed | Test seat / implementer | The extended `walkthrough-announcement.structure.test.ts`, `walkthrough-announcement.test.ts`, and the new `recording-split.structure.test.ts` (or sibling) assertion, once written | The Build/Test wave that follows this scoping round |
| R3 | Layer 3 placement (`eyebrow`/`title`/`aria-label`, corrected pricing in section 9) | Owner | None available in this checkout (IA/product decision) | Owner answers the escalation in section 9; if renamed or re-titled, a new backlog row is scoped, using the AC-5 twelve-view technique |
| R4 | `docs/REGRESSION.md` gets an entry for this fix at push, naming the discharging commit, **and must fold in a PARTIAL-coverage correction (new this round, per m9 / `seats.md`'s Baseline instruction):** `docs/REGRESSION.md:41936` records `walkthrough-announcement.structure.test.ts` as **427 lines**, against this round's measured **457** (`@(Get-Content ...).Count`, re-run this round) - that entry is stale and should be corrected inline by the push rather than perpetuated. Separately, `:41688` and `:41805` cite `:107`/`:111` for an earlier, three-key version of the ta- key canary; those are historical (section "413a - what is measured true today") and are not claimed to be current - no correction owed there, only to the 427-line figure. | Orchestrator, at push | `docs/REGRESSION.md` append + correction, per `DEV_LOOP.md`'s push checklist | The push that lands this row's code change |
| R5 | AC-5's checks are mechanical proxies (not the old sentence; mentions both "record" and "read/captur" vocabulary) and cannot verify the replacement copy reads naturally to a human across all twelve contexts - no component is rendered by any test here | Owner / UX seat | Manual read of the rendered tab header once implemented | The Verify stage of the Build wave that follows this scoping round |
| R6 | New finding from this round's twelve-view research (section 2): at least six of twelve inner views (`discussions`, `messages`, `grading`, `snapgrade`, `moduledeck`, `walkannounce`) capture the shared screen and discard frames rather than save video, yet the tab-strip's own labels (e.g. "Grading (from a recording)") sometimes still imply a saved recording. Out of scope for A18, which is charged with the shared TabShell furniture and the walkannounce tool's own copy, not the twelve tab-strip labels. | Owner | None in this checkout (scope decision) | A new backlog row, if the owner wants the tab-strip labels themselves audited the way this row audited the subtitle |

**Disposed, not carried forward as a residual (M5):** round 1's R2 ("stale
'record button' wording, not gated") is now AC-6, an executed criterion with
its own sabotage rows (S6), not a residual - see the disposition table
(section 12) for the formal record of this change.

---

## 11. Line budget for the two grown test files (m5, measured this round)

| File | Current lines | Instrument | Against |
|---|---|---|---|
| `walkthrough-announcement.structure.test.ts` | 457 | `wc -l` and `@(Get-Content).Count`, both agree | `LIMIT = 1000` (`src/file-size-ceiling.structure.test.ts:30`); not in `ALLOWED_OVERAGE` (`:64-81`, re-read this round, four entries, none matching this file) |
| `walkthrough-announcement.test.ts` | 528 | Same two instruments, agree | Same ceiling, same non-membership in `ALLOWED_OVERAGE` |

Both files gain a handful of new `it(` blocks across AC-1/AC-2/AC-3/AC-4/AC-6
(no line estimate is asserted here beyond "well under 1000 either way," per
this row's own instrument requirement not to guess line counts the
implementer's actual diff will settle).

---

## 12. Disposition table

This is a restructuring round (round 1 to round 2), so per
`iteration-caps.md`'s entry gate 3, every round-1 finding id is accounted for
below. The **New id** column is filled in last, after every section above
was finalized, rather than forward-declared - the checker for this round
should audit this table before reading the rest on its own terms.

| Round-1 id | Finding | Disposition | New id / location |
|---|---|---|---|
| B1 | Shared TabShell subtitle at `:569` misdescribes all 12 views, escalated rather than fixed | **Relocated** into layer 1 by ruling W1; receiver: this document, obligation: a per-view-checked replacement | AC-5 (section 4); twelve-view table in AC-5; sabotage S5/S5b; escalation correction in section 9 |
| B2 | AC-3(b)'s keyword checks pass a demonstrated advice-inverting rewrite | **Constructed away** (not merely strengthened) by ruling W2: the vulnerable sentence is frozen as a literal instead of keyword-checked | AC-3 assertion 3 (section 4); sabotage S3b (section 6) |
| B3 | AC-1's anchor has no resolves-check; `idx === -1` defensive return would pass the exact mutation it exists to catch | **Constructed away** by ruling W3: explicit anchor-resolves assertions added to AC-1 (and, proactively, to AC-3) | AC-1 assertions 1-2; AC-3 assertions 1-2 (section 4); sabotage S1b, S3c (section 6) |
| M1 | Four unmeasured/inconsistent counts (panel 14 vs 15; actions 5 vs 6; AC-3(b) four/six/seven; section 6 six vs seven rows) | **Kept as corrected measurements** - every count re-run this round with its command shown | Section 2 (panel 15, actions 6); AC-3 recount (section 4, "eight `expect` calls"); section 6 table (14 rows, all negative controls labelled) |
| M2 | Section 3 Command 1 claims "three files, no others" but returns four; excluded 4th file not pasted | **Kept, corrected** - full four-line output pasted, exclusion rationale kept beside it | Section 3, Command 1 |
| M3 | Section 2's CSS-module claim cites "confirmed by grep below" with no grep present | **Kept, corrected** - grep and its 56-file result pasted | Section 2, Layer 2, third bullet |
| M4 | Section 3's "No other drift found" / "upstream correction" framing manufactures a hit where the row was simply silent on the mount file's path | **Withdrawn** - the drift framing is struck; restated plainly as "the row was silent, I resolved it" | Section 1, closing paragraph |
| M5 | Section 7 justifies leaving stale "record button" comments with "no acceptance criterion or test can observe a code comment's wording" - false and load-bearing (AC-4 does; 17 structure tests read comments) | **Withdrawn** - the false claim is deleted; the residual it protected (round-1 R2) is now an executed criterion (AC-6), not a residual | AC-6 (section 4); disposed in section 10's closing note |
| m1 | `AnnouncementDraftSlot.tsx:17` also imports the shared CSS module, missing from section 7's list | **Kept, corrected** | Section 2, Layer 2, third bullet; section 7 table |
| m2 | Citation ranges wrong: `RECORDING_LAUNCH_VIEWS` `:71-81` should be `:71-84`; `RecordingLaunchView` union `:57-67` should be `:57-69`; five-key canary `it(`/assertion range overshoots | **Kept, corrected**, with an honest note where my own re-measurement of the assertion's exact line (111) did not reproduce the brief's cited `:108` | Section 2, Layer 2, second bullet; section 8's "could not be fully reconciled" note |
| m3 | Section 2 layer 3 miscounts "at least two others" while naming only one (`moduledeck`); `snapgrade` arguably a third, unnamed | **Kept, corrected** | Section 2, Layer 3 |
| m4 | Section 5 misdescribes `:397-411`'s anchor mechanism (says it anchors on `disabled={`; it anchors on `savedFormatsState === "loading"` and merely checks the slice contains `disabled={`) | **Kept, corrected** - description fixed, conclusion (no collision) reaffirmed | Section 5, first bullet |
| m5 | Missing line budget for the two grown test files | **Kept, added** | Section 11 |
| m6 | Unnamed gate risk: the directory-wide `ta-` key canary matches across ALL non-test source including prose, at exactly 5 | **Kept, named explicitly** | Section 2, Layer 2, second bullet (canary description now states the exact-match mechanism and risk) |
| m7 | Fired leverage trigger mislabelled "doc correction"; should be "bug fix" | **Kept, corrected** | Section 0 |
| m8 | AC-4's verbatim pin on a two-line, line-broken comment goes RED on pure reflow | **Constructed away** - replaced with two independent single-line fragment pins | AC-4 (section 4); sabotage S4b/S4c (section 6) |
| m9 | R4 lacks the PARTIAL-coverage check `seats.md` requires; nested citations (`:41688`/`:41805`) reference stale test line numbers; `:41936` records 427 lines against measured 457 | **Kept, corrected** - R4 now carries the partial-coverage note; the historical `:41688`/`:41805` citations are confirmed as intentionally historical (413a section) and not owed a correction, only the 427-line figure is | R4 (section 10) |
