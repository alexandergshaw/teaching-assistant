# A19 scope: two tones over the same captured pages

**Round 1 - first authoring.** `docs/backlog.yml:385-394` (`ls docs/a19-scope.md`
before this round: no such file - confirmed, this is not a restructuring, so
`iteration-caps.md`'s disposition-table requirement does not apply. Section 0
below says so and stops.

**Every quantity below names the command that produced it.** Line counts use
`@(Get-Content <path>).Count` (PowerShell) cross-checked with `wc -l` (Bash
tool) - both instruments, run this round, agree on every file cited here
(section 5 shows the one place they were run side by side and disagreed by 67
lines when the wrong instrument, `Measure-Object -Line`, was used - never use
that one). Every `file:line` citation was opened directly this round, not
inherited from `docs/backlog.yml`'s own instrument field, which I re-verified
rather than trusted.

**Owner's fork, settled, carried verbatim (`docs/backlog.yml:393`, 2026-09-20):
"two tones over the same captured pages."** Reading A (buildable: one capture
session produces a looking-ahead draft and a checking-in draft from the same
extracted pages) ships. Reading B (a midweek draft reflecting actual student
progress) is explicitly out of scope and this document adds a guard against it
being built by accident (section 6, AC-10).

**Leverage trigger: FIRED.** This is feature work - a new instructor-facing
capability, not a bug fix or refactor - so `seats.md`'s Acceptance-criteria
brief requires a leverage claim. See section 1.

**What I did not do.** I did not run `npx tsc --noEmit` (this repo's own rule:
exactly one caller, the wave gate - `this-repo.md` section 2 - and I am not the
wave gate). I did not write or run any code; this is a design document, so
every acceptance criterion's sabotage in section 7 is a **prescribed**
mutation/restore pair for the implementer and test seat to execute, not an
executed one - I say this plainly at each one rather than implying I watched a
test go red on code that does not exist yet. Where I could execute something
against the REAL, unmodified tree (grep sweeps, the two line-counting
instruments, the existing test suite's call-site inventory), I did, and the
output is pasted.

---

## 0. Disposition table

Not applicable. This is round 1 of a fresh scope document; there is no prior
`docs/a19-scope.md` to disposition against (`ls docs/a19-scope.md` returned "no
such file" before this round). `iteration-caps.md`'s entry gate 3 (disposition
table required "every restructuring round") does not fire here, and I am
recording that as the trigger check rather than silently omitting the section.

---

## 1. Leverage claim

**Class: GUARANTEED** (`docs/loop/leverage.md`, table row 6). The mechanism:
`buildWalkthroughAnnouncementPrompt`'s argument type carries no field capable
of representing a submission count, a completion fraction, or any other fact
about what a specific student has actually done - not merely unused, absent by
construction, mirroring this same file's own P11 argument for why the raw
exemplar text cannot leak (`src/lib/walkthrough-announcement-prompt.ts:16-21`,
opened this round). Section 6 (AC-10) adds a second guarantee alongside it: the
midweek branch's own instruction text is not optional copy a caller could omit
- it is emitted unconditionally by the composer whenever `timing ===
"midweek"`, so no call site can produce a midweek draft without ever also
being told not to invent tracked-progress claims.

**What the user does today instead, and what it costs.** A chat window has no
such guarantee: a chat cannot stop the user from pasting real gradebook data
into a "write a midweek check-in" prompt, and nothing in a chat's own machinery
prevents the model from reflecting or inventing a progress claim from
whatever is pasted. This app's midweek draft is guaranteed, by the absence of
any channel to carry that data into the composer plus an unconditional
in-band disclaimer, to never assert real tracking it was not given - a
property the instructor cannot get from a chat by being careful, because the
chat has no structural absence to rely on.

**Honest scope of the claim - what it does NOT cover.** This says nothing new
about a captured screen that itself showed a gradebook (the app already warns
against this - `AnnouncementCourseFieldset.tsx:254`, opened this round: "close
any gradebook, inbox, or student submission first"). If real numbers are
captured anyway, they can still reach `materialsText` and be described - that
pre-existing risk is identical for both timings and is not this chunk's to
fix. The guarantee claimed here is narrower and real: the model is never
handed such data by this composer, and is explicitly told not to invent it
when none was given.

**The removal test (AC-10, section 6/7).** Delete the midweek guard clause from
`timingClause` (defined in section 4) - the assertion that the composed prompt
contains the disclaiming instruction goes red; restoring it goes green. State
the deletion, trace the assertion: deleting the clause removes the ONLY
sentence in the whole prompt that forecloses a tracked-progress claim, and the
frozen-substring assertion in AC-10 is keyed to exactly that sentence, so its
observed value (present/absent) changes exactly when the guarantee is removed.
This is prescribed, not yet executed - see the front matter.

---

## 2. What exists today - reuse survey, every command paste real

Directory listing and line counts, this round:

```
$ ls src/app/components/walkthrough-announcement/
AnnouncementCourseFieldset.tsx
AnnouncementDraftSlot.tsx
WalkthroughAnnouncementPanel.tsx
announcement-draft-slots.test.ts
announcement-draft-slots.ts
useAnnouncementDraftSlots.test.ts
useAnnouncementDraftSlots.ts
walkthrough-announcement-coverage.test.ts
walkthrough-announcement-coverage.ts
walkthrough-announcement.structure.test.ts

$ wc -l src/app/components/walkthrough-announcement/*.ts src/app/components/walkthrough-announcement/*.tsx \
        src/lib/walkthrough-announcement-prompt.ts src/lib/walkthrough-script-prompt.ts
   686 announcement-draft-slots.test.ts
   488 announcement-draft-slots.ts
    93 useAnnouncementDraftSlots.test.ts
   408 useAnnouncementDraftSlots.ts
   120 walkthrough-announcement-coverage.test.ts
   127 walkthrough-announcement-coverage.ts
   457 walkthrough-announcement.structure.test.ts
   258 AnnouncementCourseFieldset.tsx
   262 AnnouncementDraftSlot.tsx
   979 WalkthroughAnnouncementPanel.tsx
   350 src/lib/walkthrough-announcement-prompt.ts
   234 src/lib/walkthrough-script-prompt.ts

$ wc -l src/app/actions/walkthrough-announcement.ts src/app/actions/walkthrough-announcement.test.ts \
        src/lib/walkthrough-announcement-prompt.test.ts src/lib/p11-containment-e2e.test.ts
   602 walkthrough-announcement.ts
   528 walkthrough-announcement.test.ts
   400 walkthrough-announcement-prompt.test.ts
    99 p11-containment-e2e.test.ts
```

**No video upload, confirmed by re-running the sweep** (not trusting
`docs/backlog.yml`'s own instrument field):

```
$ grep -rni "upload\|accept=\|type=\"file\"\|videoFile" src/app/components/walkthrough-announcement/
WalkthroughAnnouncementPanel.tsx:47:import { checkWireBudget, sumBase64WireBytes } from "@/lib/upload-budget";
```

Exactly one hit, an import for the frame wire budget, not a file input.
Capture is live: `WalkthroughAnnouncementPanel.tsx:515` calls `start({
saveVideo: false })` (opened this round). The per-item unit is a CAPTURE
SESSION. **Confirmed, backlog row's correction (1) stands.**

**The multi-draft-slot machinery, opened directly, not assumed from the doc:**

| Symbol | `file:line` | What it gives us |
|---|---|---|
| `TemplateChoice` (4 kinds: default/pasted/saved/none) | `announcement-draft-slots.ts:50-54` | The per-slot format-source discriminated union - the precedent for adding a SECOND, orthogonal per-slot dimension the same way. |
| `ResolvedTemplate` (3 kinds, no "default") | `:60-63` | The FROZEN fact of what a draft was actually built from - the precedent AC-2/AC-9 below copy for `timing`. |
| `Drafted.builtFrom`, REQUIRED | `:65-73`, comment at `:69-71` | "REQUIRED, not optional - an optional field lets a caller omit it with every gate green" - literally the argument this chunk applies to `Drafted.timing` (section 4, AC-2). |
| `FIRST_SLOT_ID` | `:44` | The first slot's constant id. |
| `choiceId` / `builtFromId` | `:148-156` | Stable string ids for the two TemplateChoice-shaped unions - not reused for `timing`, which is a plain 2-member string literal needing no id function (section 4). |
| `defaultOptionLabel` / `receiptLabel` | `:158-169`, `:209-213` | Presentational leaves paired with `TemplateChoice`/`ResolvedTemplate` - `timingLabel` (section 4) is a new, independent sibling, not a merge into either. |
| The frozen dropdown invariant | `:216-245`, doc comment | Re-derived, not assumed, in section 4.3: it does not carry over unchanged, and the reason is stated there. |
| `optionsForSlot` | `:246-283` | The function the invariant protects - untouched by this chunk (section 4.3). |
| `SlotsAction`, 14 members, exhaustive `Record` canary | `:339-360`; test canary `announcement-draft-slots.test.ts:668-684` | `expect(Object.keys(memberTypes)).toHaveLength(14)` - re-run this round, still 14. A 15th member (this chunk adds one, section 4.2) makes tsc refuse to compile the test file's own literal unless the canary is updated in the same commit - the enforcement mechanism this repo already proved works (comment at `:354-359`). |
| `makeSlot` / `initialSlots` | `:316-333` | Slot construction - both need a `timing` parameter (section 4.2). |
| `slotsReducer` | `:372-488` | The reducer - needs one new case (section 4.2). |

**The prompt seam, opened directly:**

- `buildWalkthroughAnnouncementPrompt`, `src/lib/walkthrough-announcement-prompt.ts:266-350`. Its argument interface `WalkthroughAnnouncementPromptArgs` is at `:213-258`; `emojiPolicy` (`:245-249`) and `researchedResources` (`:250-257`) are both REQUIRED fields whose own doc comments say why ("REQUIRED - an optional field is exactly how this control shipped dead in an earlier round").
- **Call-site census, this round, real command output:**
  ```
  $ grep -rn "buildWalkthroughAnnouncementPrompt(" src/ | cut -d: -f1 | sort | uniq -c
        1 src/app/actions/walkthrough-announcement.ts
        1 src/lib/p11-containment-e2e.test.ts
       35 src/lib/walkthrough-announcement-prompt.test.ts
        1 src/lib/walkthrough-announcement-prompt.ts   <- the definition itself
  ```
  All 35 calls in `walkthrough-announcement-prompt.test.ts` route through ONE
  shared builder, `baseArgs()` (`:35-48`) - confirmed by
  `grep -n "buildWalkthroughAnnouncementPrompt(" ... | grep -v "baseArgs"`,
  which returned 3 lines, each a multi-line call whose `baseArgs(` is on the
  following source line (verified by reading each: `:170`, `:282`, `:294`).
  **So adding a REQUIRED field to `WalkthroughAnnouncementPromptArgs` costs
  exactly THREE edits, not 37**: `baseArgs()`'s own returned object
  (`:35-48`), the one direct call in `p11-containment-e2e.test.ts:45-55`, and
  the one real production call in `walkthrough-announcement.ts:396-412`. This
  is the measured basis for section 4.1's design call.
- `walkthrough-script-prompt.ts` (234 lines) is the in-feature precedent for a
  SEPARATE module when two outputs genuinely differ in register, person, and
  ordering rule (script vs. announcement - see its own header, `:1-25`,
  opened this round). Section 4.1 argues the two timings do NOT differ this
  way and rejects the separate-module shape on that basis, not by default.

**No gradebook or submission data reaches this feature today, confirmed:**

```
$ grep -n "submission\|gradebook\|grade\b" -i src/app/actions/walkthrough-announcement.ts \
    src/lib/walkthrough-announcement-prompt.ts src/app/components/walkthrough-announcement/*.ts \
    src/app/components/walkthrough-announcement/*.tsx
src/lib/walkthrough-announcement-prompt.ts:64: * text (too small) nor deck-grade slide source material (needlessly large
src/app/components/walkthrough-announcement/walkthrough-announcement-coverage.ts:41: // heading that happens to contain a name or a grade - the acceptance
src/app/components/walkthrough-announcement/AnnouncementCourseFieldset.tsx:254: window rather than your whole screen, and close any gradebook, inbox, or student submission first.
```

No import of a Canvas-grades or submissions module anywhere in this directory
or its two `src/lib`/`src/app/actions` files. This is the baseline the
false-progress-claim guard (AC-10) is built against - the absence is real
today, and the guard's job is to keep it real after this chunk lands.

**Collision surface with A18 (concurrent scoping, same feature directory) -
flagged per the task's explicit instruction, not silently found later.**
`docs/backlog.yml:387,393` describes A18 as "this tool should stop saying it
records." A targeted grep this round for candidate copy A18 is likely to
touch:

```
$ grep -rn -i "record" src/app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx \
    src/app/components/walkthrough-announcement/AnnouncementCourseFieldset.tsx
```

Two live candidates for A18's edit: `WalkthroughAnnouncementPanel.tsx:883`
("Record and stop a walkthrough first - nothing has been read yet.") and
`AnnouncementCourseFieldset.tsx:253-254` ("Frames from your screen are sent to
a third-party AI provider to be read while you record."). **`docs/a18-scope.md`
does not exist yet** (`ls docs/a18-scope.md` this round: no such file), so I
cannot cite its final `owns` list - this is my own speculative-but-grep-backed
flag, not a read of A18's artifact. **`WalkthroughAnnouncementPanel.tsx` is the
one file both rows are likely to edit** - A18 at line 883 (copy), A19 at
several sites this document's section 4/5 names (the `addSlot` call sites near
`:780` and `:926`, and the `<AnnouncementDraftSlot` prop list near `:894-919`)
- none of A19's edit sites overlap A18's line-883 edit by line number, but both
land in the same 979-line file, so **the two implementations must be
sequenced, not run concurrently, on this one file**: whichever lands second
rebases on the first's diff before touching the file, and re-measures the line
count (section 5, AC-13) against the POST-first-landing baseline, not the 979
measured here. I recommend A18 (copy-only, smaller, no structural risk) lands
first.

---

## 3. What A19 must NOT build (the guard, restated as a constraint on the design)

The tool has no gradebook read, no submission count, and no memory of any
earlier announcement (section 2's grep confirms the first claim; the second
and third are architectural - there is no persistence of past announcements
anywhere in this directory, confirmed by the absence of any Supabase table
reference beyond `announcement-exemplars` and the exemplar store, neither of
which stores announcement HISTORY). Any midweek copy that reads as
"knowing" who is behind is false confidence. Section 4 designs the containment
this constraint drives; section 6 (AC-10) is its acceptance criterion.

---

## 4. The four design calls

### 4.1 Where `timing` lives, and its name

**Decision: a new, independently-named field, NOT reusing the word `kind`.**
`TemplateChoice`'s own discriminant field is already named `.kind`
(`announcement-draft-slots.ts:50-54`: `{ kind: "default" } | { kind: "pasted"
} | ...`). Naming the new per-slot dimension `kind` as well would put two
unrelated concepts behind the same identifier on the same object
(`slot.choice.kind` for format vs. a hypothetical `slot.kind` for the new
dimension) - a real grep hazard in a repo that leans on source-text tests for
wiring proof (`this-repo.md` section 2). The backlog row's own language
("ANNOUNCEMENT KIND... orthogonal to TemplateChoice") names the CONCEPT, not
an identifier; I am treating the identifier as my call to make and departing
from the word deliberately, stated here rather than silently.

**Chosen name: `AnnouncementTiming = "beginning-of-week" | "midweek"`, field
name `timing`.**

**Lives on BOTH the slot and the draft - the same two-part answer
`TemplateChoice`/`ResolvedTemplate`/`Drafted.builtFrom` already give, for the
same reason.** `Drafted.builtFrom` is REQUIRED specifically because "an
optional field lets a caller omit it with every gate green, which is exactly
how this notice shipped dead in an earlier round" (`announcement-draft-slots.ts:69-71`).
The identical argument applies to `timing`:

- **`DraftSlot.timing: AnnouncementTiming`** (REQUIRED) - the live, mutable
  control value, set before Generate and changeable afterward (mirroring
  `choice`, which the `"choose"` reducer case already allows to change
  post-draft with no phase guard - `announcement-draft-slots.ts:383-385`).
- **`Drafted.timing: AnnouncementTiming`** (REQUIRED) - the FROZEN fact of
  which tone a specific draft was actually built with, set once at draft time
  from the dispatch context (section 4.2), never re-read from the live slot.
  Without this half, changing a slot's timing selector AFTER a draft exists
  would either (a) silently relabel an already-drafted midweek announcement as
  beginning-of-week with no re-draft, or (b) have no way to detect the
  mismatch and prompt a Regenerate - the same "stale choice" bug class
  `staleChoice` (`AnnouncementDraftSlot.tsx:77-78`) already exists to prevent
  for `TemplateChoice`. A `staleTiming` flag is the direct analogue (section
  4.4).

**Where the TYPE is defined.** Not in `announcement-draft-slots.ts` (that file
is a leaf scoped to this component directory - its own header says so,
`:1-9`), and not in a new file. `src/lib/walkthrough-announcement-prompt.ts`
already defines `WALKTHROUGH_ANNOUNCEMENT_MATERIALS_CAP` and every prompt-only
constant, and `WalkthroughAnnouncementPanel.tsx:55` already imports that
constant directly from this lib file into the same component directory -
established, correct-direction precedent (component -> lib, never the
reverse; `announcement-outline-types.ts`'s `AnnouncementOutline` is the same
shape of shared type, imported by both the lib prompt composer and
`announcement-draft-slots.ts:11`). `AnnouncementTiming` and its presentational
sibling `timingLabel(timing): string` (parallel to `receiptLabel`, but
independent - section 4.4 explains why they stay two functions, not one)
belong in `walkthrough-announcement-prompt.ts`, and `announcement-draft-slots.ts`
re-exports the type (`export type { AnnouncementTiming } from
"@/lib/walkthrough-announcement-prompt";`) so every file in the directory that
already imports slot types from `./announcement-draft-slots` keeps doing so.

**Not persisted.** The five `ta-rec-wta-*` keys persist PANEL-WIDE settings
(course, module, notes, emoji, research) - `TemplateChoice` itself is
per-slot state and is NOT persisted (slots reset on reload; the panel's own
copy says so: "A capture in progress does not survive a reload"). `timing` is
at the same per-slot granularity as `choice` and follows the same rule: no new
`ta-` key, no change to the five-key canary (`walkthrough-announcement.structure.test.ts:106-112`,
re-run this round: `expect(distinctKeys.size).toBe(5)`, still 5 today). If an
implementer instead wants a STICKY panel-wide default for a new slot's
initial timing, that is a new persisted preference and MUST bump the canary
to 6 in the same commit - flagged here so it is not missed silently, but my
own recommendation is NOT to add one: new slots default to
`"beginning-of-week"` unconditionally (matching today's one implicit tone),
and the instructor flips a slot's control if they want the other - zero extra
persistence, zero extra clicks for the unchanged default path.

### 4.2 The prompt seam: one parameter, REQUIRED, not a sibling module

**Decision: `buildWalkthroughAnnouncementPrompt` gains one REQUIRED parameter,
`timing: AnnouncementTiming`, on `WalkthroughAnnouncementPromptArgs`.** Not a
second module.

**Why not a sibling module (rejecting the `walkthrough-script-prompt.ts`
precedent explicitly, not by default).** That split exists because a script
and an announcement differ in register (spoken vs. written), person (second
vs. whichever the exemplar dictates), ordering guarantee, and output format
entirely (`walkthrough-script-prompt.ts:1-25`, its own header). The two
TIMINGS do not differ this way: both are markdown announcements, both obey
the SAME outline-governs-format/style-governs-voice rule
(`walkthrough-announcement-prompt.ts:282-287`), the SAME coverage-order and
coverage-honesty rules (`:308-317`), the SAME announcement floor (`:294-300`).
Only ONE additional instruction block differs. Two whole modules sharing
everything except one paragraph would duplicate roughly 300 lines to vary
roughly 10 - the shape a parameter exists for, not the shape a sibling module
exists for.

**Why REQUIRED, not optional-with-a-default (departing from the row's literal
suggested syntax, with the measured reason).** The row's text recommends "a
DEFAULTED parameter whose default arm is byte-identical to today's output" -
sound advice for a value every existing caller implicitly already had (the
pattern `truncateMaterialsForPrompt`'s `cap` parameter already uses,
`:93-96`). But `emojiPolicy` and `researchedResources` on this SAME interface
are BOTH required, not defaulted, and their own doc comments name the reason:
"REQUIRED - an optional field is exactly how this control shipped dead in an
earlier round" - and `walkthrough-announcement.ts:328-338`'s own comment
records that this ALREADY HAPPENED ONCE in this exact file: `emojiPolicy` and
`researchedResources` sat on the ACTION's input type, REQUIRED, for a whole
wave, without ever reaching the composer, because the composer itself had no
matching parameter yet - "G3 wave 3 closed the wave-boundary gap." An optional
composer parameter reopens exactly that gap for `timing`: a caller could
satisfy TypeScript while never forwarding it.

**Reconciling both facts - required field, byte-identical default value.**
Making `timing` required does not cost the "byte-identical for existing
tests" property the row is really asking for, because the CHOSEN neutral
value contributes nothing to the output:

```ts
function timingClause(timing: AnnouncementTiming): string {
  if (timing !== "midweek") return "";
  return [ /* the midweek-only block, AC-9/AC-10 */ ].join("\n");
}
```

`"beginning-of-week"` renders as an empty string and is never pushed onto
`blocks` (mirroring the existing `if (notes) blocks.push(...)` /
`if (coverageBlock) blocks.push(...)` pattern already in the function,
`:333-346`), so every existing test's expected output is unchanged by
construction, not merely unchanged by coincidence of today's fixture values.
**The edit cost is exactly three lines across the whole repo** (section 2's
measured call-site census): `baseArgs()` gains `timing: "beginning-of-week"`,
the one direct call in `p11-containment-e2e.test.ts` gains the same field, and
the one real production call in `walkthrough-announcement.ts` forwards
`input.timing`. This is cheaper than the 40-site cost the row's own framing
worried about, and it closes the exact wiring-omission defect class this file
has already shipped once.

**The byte-identical proof, as an instrument for the implementer, not
executed by me.** Run the existing, UNCHANGED assertions in
`walkthrough-announcement-prompt.test.ts` and `p11-containment-e2e.test.ts`
(after only the two required-field additions above) and confirm every
pre-existing `toContain`/`toBe`/`toMatch` still passes - this repo's own
frozen fixtures across roughly three dozen argument tuples are a stronger
byte-identity oracle than a manual `git show HEAD:` diff, because they already
encode expected substrings for the materials cap, emoji policy, resource
citation, and outline rendering independently. Instrument:
`npx vitest run src/lib/walkthrough-announcement-prompt.test.ts src/lib/p11-containment-e2e.test.ts`
at the wave gate. Direction of failure: any red test here means the default
arm is NOT byte-identical.

**The wiring hop that needs its own canary (M5's shape, reused).** The one
real risk left is the ACTION's own call to the composer forgetting to forward
`timing: input.timing` even though `input.timing` is itself required -
exactly the shape `walkthrough-announcement.structure.test.ts:270-283`
("G3 Correction M5") already exists to close for `emojiPolicy`/
`researchOutcome`, pinning the READ (`emojiPolicy:\s*ctx\.emojiOn`), not just
the field's presence somewhere in the file. AC-7 (section 6) requires the
identical shape of assertion for `timing`.

**`SlotsAction` gains a 15th member.** `"choose-timing"`, mirroring
`"choose"`'s effect (sets the field, clears `regenerateArmed`) exactly
(`announcement-draft-slots.ts:383-385`). The exhaustive `Record<SlotsAction["type"],
true>` canary (`announcement-draft-slots.test.ts:668-684`) MUST add
`"choose-timing": true,` and its `toHaveLength(14)` MUST become `toHaveLength(15)`
in the SAME commit, or `npx tsc --noEmit` refuses to compile the test file
("Property 'choose-timing' is missing") - this is the enforcement mechanism
this file's own comment (`:354-359`) already describes, re-used, not
reinvented. AC-3 (section 6).

### 4.3 The frozen dropdown invariant - re-derived, does NOT carry over unchanged

The invariant at `announcement-draft-slots.ts:216-245` (`optionsForSlot`
always contains an option matching `slot.choice`) exists because
`TemplateChoice`'s option SET is LIVE-RESOLVED: it depends on whether text is
pasted, which saved exemplars have loaded, and whether a previously-chosen
saved exemplar was since deleted - none of which is knowable at render time
without a fetch. That is what lets the displayed dropdown and the drafted
value diverge, and that is the whole reason `optionsForSlot` has to
SYNTHESIZE a placeholder option for a `choice` no longer present in the live
list.

**`AnnouncementTiming` has none of that.** It is a closed, static, exactly-two-member
string literal union with no live source, no async fetch, no deletion-elsewhere
case, and no "default" arm that resolves against outside state the way
`TemplateChoice`'s `"default"` does (`resolveChoice`, `:293-314`). A control
rendering exactly two `<MenuItem>` elements for the two literal values of
`AnnouncementTiming` can never desync from `slot.timing`, because there is no
external state that could remove an option out from under it - unlike a saved
exemplar, a `"midweek"` or `"beginning-of-week"` label cannot be deleted by
the instructor elsewhere. **Re-derived conclusion: the invariant does not
apply to `timing` today, and `optionsForSlot`/`choiceId`/the synthesize-a-placeholder
mechanism are UNCHANGED by this chunk** - confirmed by re-reading
`optionsForSlot`'s signature (`:246`), which takes `slot: DraftSlot` and `src:
TemplateOptionSource`; `timing` never becomes part of either, and no
"multiplication of the option set" occurs because the two dimensions are
rendered by two SEPARATE, independently-populated controls, never merged into
one cartesian-product dropdown (this is also why the backlog note's warning
about the invariant "not carrying over" is correctly cautious in general, but
resolves to "does not apply" specifically here, for a stated, checkable
reason - not assumed).

**If `AnnouncementTiming` ever grows a third, live-resolved member** (not
requested here, and not designed for), this conclusion would need
re-deriving from scratch, exactly as this section did - noted so a future
reader does not extend the type without re-reading this reasoning.

### 4.4 The line budget - the panel's own growth is small, and why

`WalkthroughAnnouncementPanel.tsx` is **979 lines**, confirmed twice this
round with independent instruments on the SAME file:

```
$ wc -l src/app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx
979 src/app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx
```
```
PS> $f="src/app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx"
PS> @(Get-Content $f).Count
979
PS> (Get-Content $f | Measure-Object -Line).Lines
912
```

Both mandated instruments (`wc -l`, `@(Get-Content).Count`) agree at 979 -
matching `docs/backlog.yml`'s own cited figure, re-measured rather than
trusted. `Measure-Object -Line` disagrees by **67** on this file (a different
magnitude than the 42 cited for a different file in `this-repo.md` section 3,
same direction, same lesson: never use it). **21 lines of headroom against the
1000-line ceiling** (`src/file-size-ceiling.structure.test.ts:30`, `LIMIT =
1000`).

**Correction to the backlog row's own assumption, stated plainly.** The row's
instrument field predicts "any new control in that panel needs the extraction
IN the chunk, not after it," on the premise that a new control lands in the
panel itself. **It mostly does not, by the design in 4.1/4.2.** The per-slot
"Format to match" `TextField` that `TemplateChoice` uses today is rendered
entirely inside `AnnouncementDraftSlot.tsx` (`:84-100`), a 262-line sibling
file nowhere near the ceiling - not inside `WalkthroughAnnouncementPanel.tsx`.
The new per-slot timing control follows the identical pattern and lands in the
SAME sibling file. `WalkthroughAnnouncementPanel.tsx`'s own required edits are
narrow:

| Site | `file:line` (current) | Change | Est. lines |
|---|---|---|---|
| `buildRequest` | `:569-582` | **None.** `timing` is per-slot, assembled inside the hook at generate/regenerate time (section 4.2), never inside the panel-wide, shared `AnnouncementDraftRequestContext`. | 0 |
| `draftOne` | `:615-641` | Forward `timing: ctx.timing` into the `draftWalkthroughAnnouncementAction` call (AC-7). | +1 |
| Hook destructure | `:658-674` | Add `chooseTiming` to the destructured return of `useAnnouncementDraftSlots(...)`. | +1 |
| `addSlot` call sites | `:780-786`, `:926` | Both calls to `addSlot` gain a second argument, `"beginning-of-week"`. | 0 (same lines, edited) |
| `<AnnouncementDraftSlot>` props | `:894-919` | Pass `onChooseTiming={chooseTiming}` alongside the existing `onChooseTemplate={chooseTemplate}` (`:910`). | +1 |

**Estimated net growth: roughly 3-10 lines** (including any comment
explaining the new prop), landing the file at **982-989** - under the
ceiling, but close enough that I am NOT asserting this as measured (it is not
- the code does not exist yet). **AC-13 (section 6) requires the implementer
to re-measure with both instruments after the real diff and states the
failure direction plainly: if the measured count exceeds 1000, an extraction
is owed in THIS SAME chunk, not deferred - the backlog row's own directive,
which this document is not overriding, only narrowing to the case where it
actually fires.**

`AnnouncementDraftSlot.tsx` (262 lines) gains the new `TextField select` block
(mirroring `:84-100`, roughly 15-20 lines) plus a `staleTiming` hint (mirroring
`:147-151`, roughly 5 lines) - landing around 282-287, far under the ceiling.
`announcement-draft-slots.ts` (488), `useAnnouncementDraftSlots.ts` (408), and
`walkthrough-announcement-prompt.ts` (350) all have hundreds of lines of
headroom for the additions section 5 lists.

---

## 5. `owns` - exact paths

Derived from the directory listing and call-site census in section 2
(commands re-pasted there), not hand-typed from memory.

### Production (7 files)

| Path | Lines now | Role |
|---|---|---|
| `src/lib/walkthrough-announcement-prompt.ts` | 350 | Add `AnnouncementTiming`, `timingClause`, `timingLabel`; add REQUIRED `timing` field to `WalkthroughAnnouncementPromptArgs`; wire into `buildWalkthroughAnnouncementPrompt`'s `blocks`. |
| `src/app/actions/walkthrough-announcement.ts` | 602 | Add REQUIRED `timing: AnnouncementTiming` to `WalkthroughAnnouncementDraftInput` (mirroring `emojiPolicy`, `:328-340`); forward `input.timing` into the composer call (`:396-412`). |
| `src/app/components/walkthrough-announcement/announcement-draft-slots.ts` | 488 | Re-export `AnnouncementTiming`; add `timing` to `DraftSlot` and `Drafted`; add `"choose-timing"` to `SlotsAction`; add its reducer case; add `timing` param to `makeSlot`/`initialSlots`. |
| `src/app/components/walkthrough-announcement/useAnnouncementDraftSlots.ts` | 408 | Add `timing` to `AnnouncementDraftDispatchContext`; forward `slot.timing` into the per-slot dispatch context inside `generate()` (`:284-288`) and `regenerate()` (`:291-311`); forward `ctx.timing` into the `"result"` action's payload inside `runDraft`'s `onResult` (`:200-215`); add and return `chooseTiming`. |
| `src/app/components/walkthrough-announcement/AnnouncementDraftSlot.tsx` | 262 | New per-slot timing `TextField select` (two static options); `staleTiming` hint; render `timingLabel(...)` beside `receiptLabel(...)` (`:137`), never merged into it. |
| `src/app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx` | 979 | Narrow edits only - section 4.4's table. **Sequence after A18 if both are in flight (section 2's collision flag).** |
| `src/app/actions/walkthrough-announcement.test.ts` | 528 | Extend to cover `WalkthroughAnnouncementDraftInput.timing` forwarding (AC-6 area), if not already reachable through an existing fixture. |

### Tests (5 files, at minimum)

| Path | Lines now | Change |
|---|---|---|
| `src/lib/walkthrough-announcement-prompt.test.ts` | 400 | `baseArgs()` (`:35-48`) gains `timing: "beginning-of-week"`; new `describe` blocks for AC-8/AC-9/AC-10. |
| `src/lib/p11-containment-e2e.test.ts` | 99 | The one direct call (`:45-55`) gains `timing: "beginning-of-week"` (byte-identity requires this file's existing assertions to still pass unchanged). |
| `src/app/components/walkthrough-announcement/announcement-draft-slots.test.ts` | 686 | C1 canary `:668-684` updated to 15 members, `"choose-timing": true,` added; new `describe("\"choose-timing\"")` block mirroring `describe('"choose"'` (`:289-309`). |
| `src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts` | 457 | New M5-shaped canary for `timing: ctx.timing` (mirroring `:270-283`); the five-key ta- canary (`:106-112`) is asserted UNCHANGED (still 5), not bumped, per section 4.1. |
| `src/app/components/walkthrough-announcement/useAnnouncementDraftSlots.test.ts` | 93 | No change expected - this file tests only the pure decision functions (`cachedResearchFor`, `shouldReuseInFlightResearch`, `resolveRegenerateResearchOutcome`), none of which touch `timing` (section 4.1's fingerprint decision, AC-15). Implementer confirms this by re-reading the file before skipping it, not by assuming this document is still accurate once code changes land. |

**No file is added.** Everything above is an edit to an existing path -
confirmed against section 2's directory listing.

---

## 6. Acceptance criteria

Each names the object under comparison, the instrument, and the direction of
failure, per `traps-spec.md`'s three-part rule.

**AC-1 - `AnnouncementTiming` is a closed 2-member union, defined once.**
Object: the type declaration in `walkthrough-announcement-prompt.ts`.
Instrument: `npx tsc --noEmit` at the wave gate, plus a source-text grep for a
single `export type AnnouncementTiming` declaration. Direction of failure:
RED if a second, divergent declaration exists anywhere in the tree (a type
duplicated instead of imported).

**AC-2 - `Drafted.timing` and `DraftSlot.timing` are both REQUIRED, not
optional.** Object: the two interface declarations in
`announcement-draft-slots.ts`. Instrument: `npx tsc --noEmit` against a
sabotage that constructs a `Drafted` object literal omitting `timing`.
Direction of failure: RED (compile error) is the PASSING condition for the
sabotage - if the sabotage compiles, the criterion fails.

**AC-3 - the `SlotsAction` exhaustive canary is bumped in the same commit as
the 15th member.** Object: `announcement-draft-slots.test.ts:668-684`.
Instrument: `npx tsc --noEmit`. Direction of failure: RED ("Property
'choose-timing' is missing") if `SlotsAction` gains the member without the
canary being updated; this is the PASSING behavior of the un-fixed sabotage,
proving the mechanism - the shipped state must show the canary updated and
the suite green.

**AC-4 - `makeSlot`/`initialSlots`/both `addSlot` call sites thread `timing`
end to end.** Object: `announcement-draft-slots.ts:316-333`,
`WalkthroughAnnouncementPanel.tsx:780-786,926`. Instrument: source-text grep
for `timing` as an argument at both call sites, plus `npx tsc --noEmit`
(a missing argument on a function whose parameter is required is a compile
error). Direction of failure: RED if either call site omits the second
argument.

**AC-5 - `generate()` and `regenerate()` forward the SLOT's `timing`, not a
shared/batch value.** Object: `useAnnouncementDraftSlots.ts:284-288` (inside
the `for (const id of ids)` loop) and `:291-311` (`regenerate`). Instrument:
source-text assertion that the dispatch-context object literal at each site
reads `slot.timing` (or `slotsRef.current.find(...).timing`), not `ctx.timing`
(there is no `ctx.timing` - `ctx` is the shared, panel-wide request context,
section 4.4). Direction of failure: RED if either site reads a
batch-shared value instead of the per-slot one - the tell is two slots with
different `timing` producing drafts tagged with the SAME timing.

**AC-6 - `draftOne` forwards `ctx.timing` into
`WalkthroughAnnouncementDraftInput.timing`.** Object:
`WalkthroughAnnouncementPanel.tsx`'s `draftOne` callback (`:615-641`).
Instrument: source-text match for `timing: ctx.timing` inside the callback
body (mirroring the existing `emojiPolicy: ctx.emojiOn` pin at `:633`).
Direction of failure: RED if the field name appears elsewhere in the file
(e.g. only in a type import) without this exact read - the M5-class defect
this repo has already shipped once.

**AC-7 - `draftWalkthroughAnnouncementAction` forwards `input.timing` into the
composer call.** Object: `walkthrough-announcement.ts:396-412`. Instrument: a
new structure-test assertion, same shape as
`walkthrough-announcement.structure.test.ts:276-282` ("G3 Correction M5"):
`expect(actionSource).toMatch(/timing:\s*input\.timing/)`. Direction of
failure: RED if `input.timing` exists on the interface (AC-2's REQUIRED field)
but is never read at the one real call site - the exact gap `emojiPolicy` had
for a whole wave before G3 wave 3 closed it.

**AC-8 - the default arm (`timing: "beginning-of-week"`) is byte-identical to
pre-change output across every existing fixture.** Object: every assertion in
`walkthrough-announcement-prompt.test.ts` and `p11-containment-e2e.test.ts`,
unchanged except for the two required `timing: "beginning-of-week"` additions
(section 4.2). Instrument:
`npx vitest run src/lib/walkthrough-announcement-prompt.test.ts src/lib/p11-containment-e2e.test.ts`.
Direction of failure: RED (any prior assertion now fails) means the default
arm changed observable output; the pass condition is the full pre-existing
suite passing unmodified in substance.

**AC-9 - `timing: "midweek"` measurably changes the composed prompt; the two
timings are texually distinct.** Object: `buildWalkthroughAnnouncementPrompt(baseArgs({
timing: "midweek" }))` vs. `buildWalkthroughAnnouncementPrompt(baseArgs({
timing: "beginning-of-week" }))`. Instrument: a new test asserting the two
outputs differ (`expect(midweek).not.toBe(beginningOfWeek)`) and that the
midweek output contains a stable, pinned FACT-level substring naming the
check-in framing (per `traps-tests.md`'s "pin the fact and the ordering, never
the exact spelling" rule - the substring should be something load-bearing like
"midweek" or "check-in" appearing in the instruction block, not a full
sentence). Direction of failure: RED if the two outputs are identical (the
parameter is wired but never consulted) or if the pinned substring is absent
from the midweek output only.

**AC-10 (FIRST-CLASS - the false-progress-claim guard). Two independent
clauses, both required.**

- **10a - the midweek instruction text is present whenever, and only when,
  `timing === "midweek"`.** Object: `timingClause`'s return value. Instrument:
  a table-driven test over BOTH members of the closed 2-member union (not a
  hand-picked pair - `AnnouncementTiming` has exactly two members, so this is
  already an exhaustive enumeration, not a partial one). Direction of failure:
  RED if the beginning-of-week arm returns anything non-empty (byte-identity
  violation, AC-8) or if the midweek arm returns an empty string (the guard
  silently missing).
- **10b - the midweek instruction text explicitly forecloses claiming tracked
  progress.** Object: the midweek arm's own returned string. Instrument: a
  frozen-substring assertion pinning the FACT (the text disclaims any
  knowledge of what students have actually done - e.g. asserting the presence
  of BOTH a phrase disclaiming information about student progress AND an
  explicit ban on claiming who is behind or how many have submitted, without
  pinning the exact sentence per `traps-tests.md`'s rule). Direction of
  failure: RED if the disclaiming clause is removed or reworded to lose either
  half.
- **10c - no parameter on `WalkthroughAnnouncementPromptArgs` or
  `WalkthroughAnnouncementDraftInput` can carry a submission count or
  completion fact.** Object: the two interfaces' own field lists. Instrument:
  an exhaustive-key test in the spirit of the `SlotsAction` `Record` canary
  (AC-3) - enumerate every field name on each interface (via a `keyof`-driven
  `Record<..., true>` literal, which tsc refuses to compile if a field is
  added without updating the enumeration) and assert none matches a frozen
  denylist of name PATTERNS (`/submi(t|ssion)|complet|progress|behind/i`) -
  built as a WALLED SET over the type's own keys, not a hand-maintained list
  of today's field names, so a future field addition is caught by the same
  mechanism that already catches a missing `SlotsAction` member. Direction of
  failure: RED if a future field matching the denylist pattern is added to
  either interface without this test being touched - the test must fail to
  compile (missing enumeration entry) OR fail at runtime (name matches the
  denylist), not silently pass.

**AC-11 - the per-slot timing control is reachable from the rendered row (a
reading claim, not a rendered one - `this-repo.md` section 6).** Object:
`AnnouncementDraftSlot.tsx`'s JSX. Instrument: reading the diff directly (no
test in this repo renders a component) plus a source-text assertion that the
control exists and calls `onChooseTiming` (mirroring the existing
`onChooseTemplate` pin pattern used throughout
`walkthrough-announcement.structure.test.ts`). Direction of failure: verify
FAILS if the prop is destructured but never wired to an `onChange`/`onClick`
handler - stated as a reading-claim limit, not asserted as machine-proven.

**AC-12 - `staleTiming` mirrors `staleChoice` exactly.** Object:
`AnnouncementDraftSlot.tsx`'s new `staleTiming` computation, alongside
`staleChoice` (`:77-78`). Instrument: source-text comparison of the two
expressions' shape (both `phase === "drafted" && ... !== slot.draft.draft....`).
Direction of failure: RED if `staleTiming` is missing the `phase === "drafted"`
guard (would read `slot.draft.draft` on a non-drafted union member, a type
error tsc catches) or omits the comparison entirely (a silently-stale draft
that never prompts Regenerate).

**AC-13 - `WalkthroughAnnouncementPanel.tsx` stays at or under 1000 lines,
MEASURED, not estimated.** Object: the file, post-diff. Instrument:
`@(Get-Content src/app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx).Count`
AND `wc -l` (Bash), both run, both pasted, matching (`src/file-size-ceiling.structure.test.ts`
also gates this automatically at the wave gate). Direction of failure: RED if
either instrument exceeds 1000 - the required corrective is an extraction
inside THIS chunk (per the backlog row's own directive, narrowed by section
4.4 to the case where it actually fires), never deferred to a follow-up.

**AC-14 - the five-key `ta-` canary is unchanged, or deliberately bumped with
a stated reason.** Object: `walkthrough-announcement.structure.test.ts:106-112`.
Instrument: `npx vitest run src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts`.
Direction of failure: RED (silently, on an UNRELATED assertion) if a new
persisted key is added without touching this test - the test's own "exactly
five" assertion is the only gate in this repo that can see it (section 4.1's
"this-directory-has-no-canary-anywhere-else" comment, `:92`). Per section
4.1's recommendation, the expected count stays 5; if the implementer instead
adds a persisted default, this AC's expected value becomes 6 and the change
must be justified in the commit message, not silent.

**AC-15 - `researchFingerprint` does NOT include `timing`.** Object:
`WalkthroughAnnouncementPanel.tsx`'s `researchFingerprint` callback
(`:605-613`). Instrument: source-text assertion that the `JSON.stringify([...])`
array literal does not reference `ctx.timing` or `timing`. Direction of
failure: RED if `timing` is added to the fingerprint - this is a deliberate
NON-goal (section 4, general note): the researched resources depend on
course/module/materials content, not on which tone the draft will use, so
including `timing` would cause two slots reading the SAME captured pages to
duplicate an identical `fetchResources` call for no reason, defeating Ruling
17/34's whole dedup purpose (`useAnnouncementDraftSlots.ts:78-92,94-108`).

---

## 7. Sabotage per criterion

**All of the following are PRESCRIBED, not executed** - the code does not
exist yet (front matter). Each names the mutation and the expected red, and
the restore and the expected green, for the implementer/test seat to actually
run once the wave lands. Any I expect NOT to discriminate are named as such,
per the task's own requirement.

| AC | Mutation (expected RED) | Restore (expected GREEN) | Executed this round? |
|---|---|---|---|
| AC-1 | Declare a second, structurally-different `AnnouncementTiming` in a second file and import the wrong one somewhere. | Delete the duplicate; single declaration only. | No - prescribed. |
| AC-2 | Remove `timing` from `Drafted`'s interface body only (leave `DraftSlot.timing`). | Restore the field. | No - prescribed. `npx tsc --noEmit` is the instrument; this is a real, mechanically certain compile-error mutation, following the identical proof already on record for `builtFrom` (`announcement-draft-slots.ts:69-71`'s own comment describes this exact class of prior failure). |
| AC-3 | Add the `"choose-timing"` member to `SlotsAction` without touching the test's `memberTypes` literal or its `toHaveLength`. | Add both. | No - prescribed, but this is the SAME mechanism already proven for the existing 14 members (the file's own comment at `:354-359` documents it was sabotage-checked when written). |
| AC-4 | Remove the second argument from one of the two `addSlot(...)` call sites, leaving `makeSlot`'s `timing` parameter required. | Restore the argument. | No - prescribed; `npx tsc --noEmit` catches a missing required argument mechanically. |
| AC-5 | Change `generate()`'s per-slot dispatch to read `ctx.timing` (which does not exist on `AnnouncementDraftRequestContext`) instead of `slot.timing`. | Revert to `slot.timing`. | No - prescribed; also mechanically certain (tsc: `Property 'timing' does not exist on type 'AnnouncementDraftRequestContext'`) UNLESS `timing` is (wrongly) also added to the shared request context, in which case this sabotage would NOT discriminate - flagged explicitly: the real risk is a design mistake that adds `timing` to the WRONG interface, which this specific mutation cannot catch by itself; AC-5's source-text assertion (reads `slot.timing`, not `ctx.timing`, at the specific call site) is the instrument that catches that version instead. |
| AC-6 | Delete `timing: ctx.timing,` from `draftOne`'s call to the action, leaving the field name present elsewhere in the file (e.g., in a type import). | Restore the line. | No - prescribed; mirrors the already-proven M5 sabotage shape for `emojiPolicy`. |
| AC-7 | Delete `timing: input.timing,` from the composer call inside `draftWalkthroughAnnouncementAction`. | Restore it. | No - prescribed; mirrors the already-proven M5 shape. |
| AC-8 | Make `"beginning-of-week"`'s arm of `timingClause` return a non-empty string. | Restore the empty-string return. | No - prescribed; the existing frozen-substring assertions in `walkthrough-announcement-prompt.test.ts` are the instrument, and this mutation is exactly what they would catch. |
| AC-9 | Make `timingClause` ignore its argument and always return the midweek block (or always the empty string). | Restore the branch. | No - prescribed. |
| AC-10a | Delete the `if (timing !== "midweek") return "";` guard, so BOTH arms return the midweek text. | Restore the guard. | No - prescribed. |
| AC-10b | Delete the disclaiming sentence from the midweek block, leaving the rest of the block (e.g. the "common sticking point" framing) intact. | Restore the sentence. | No - prescribed; this is the leverage removal test (section 1). |
| AC-10c | Add a field named `submittedCount: number` to `WalkthroughAnnouncementDraftInput` without updating the exhaustive-key enumeration test. | Add the field to the test's enumeration; watch it then fail on the denylist pattern match; remove the field. | No - prescribed. **Explicit note on discrimination:** this sabotage only fires if the exhaustive-key test is itself well-built (an `keyof`-driven `Record` literal, not a hand-copied list) - if the implementer instead hand-writes today's field names into a plain array, THIS EXACT MUTATION WOULD NOT DISCRIMINATE (a hand-written list simply would not "see" the new field, the same failure class `iteration-caps.md`'s entry gate 1 and `traps-tests.md`'s "coverage must be a property of construction" both warn about) - flagged here so the test seat builds it as a `Record` from the start, not as a list to be caught missing it later. |
| AC-11 | Delete the `onChange`/`onClick` wiring from the new control, leaving the `<TextField>` or equivalent present but inert. | Restore the handler. | No - prescribed; and per AC-11's own text, this is a READING claim - no test here renders the component, so even the "restore" half is verified by re-reading the diff, not by a green suite. |
| AC-12 | Remove the `phase === "drafted"` guard from `staleTiming`'s condition. | Restore it. | No - prescribed; `npx tsc --noEmit` (accessing `.draft.draft` outside the narrowed branch) is the instrument. |
| AC-13 | N/A - this is a measurement, not a boolean assertion; there is no "mutation" to sabotage, only a re-run of `@(Get-Content ...).Count` after the real diff lands. Recorded as a residual-shaped instrument, not a sabotage row. | | Executed THIS round only for the PRE-change baseline (979, both instruments, section 4.4) - the post-diff number does not exist yet. |
| AC-14 | Add a sixth `ta-` key to any file in the directory without touching the canary. | Bump the canary to 6 with a stated reason, or remove the key. | No - prescribed; mirrors the already-proven mechanism (comment at `walkthrough-announcement.structure.test.ts:107-110` records the same class from 3 to 5). |
| AC-15 | Add `ctx.timing` to the `JSON.stringify([...])` array in `researchFingerprint`. | Remove it. | No - prescribed. |

---

## 8. Residual register

Every entry names an owner, an instrument, and the step that measures it -
anything short of that is a deletion (`iteration-caps.md`'s anti-gaming rule),
and I am stating that rule rather than quietly filling a gap with an
assumption.

- **RES-1: exact copy for the two `TextField`/hint labels (the timing
  control's own option labels, the `staleTiming` hint sentence, the midweek
  disclaiming sentence's final wording).** I proposed concrete draft copy in
  section 4/6 (AC-10b) but I am not the dedicated UX seat, and `seats.md`
  requires exact user-facing copy for empty/loading/partial/error states from
  that seat specifically. Owner: the Wave-3 User-experience seat, on the
  as-built diff (per `DEV_LOOP.md`'s "Follow-up design seats against the
  as-built diff, not the plan"). Instrument: the frozen-substring tests in
  AC-9/AC-10 pin only the FACT, per `traps-tests.md`'s rule, leaving the exact
  sentence open for that pass to set. Step: the follow-up UX pass, before
  final review.
- **RES-2: the panel's post-diff line count.** Not measurable now because the
  code does not exist (section 4.4 gives an ESTIMATE, 982-989, explicitly
  flagged as unmeasured). Owner: the implementer wave's own gate. Instrument:
  `@(Get-Content WalkthroughAnnouncementPanel.tsx).Count` and `wc -l`, both,
  matching AC-13. Step: the wave gate, before this chunk is considered built.
- **RES-3: whether A18 lands first.** Section 2 recommends A18 (copy-only)
  land before A19 on `WalkthroughAnnouncementPanel.tsx`, but I do not control
  sequencing and `docs/a18-scope.md` does not exist yet to confirm A18's own
  final `owns` list agrees there is no deeper overlap. Owner: whichever
  orchestrator turn dispatches the two implementer waves. Instrument:
  `git status --short` compared against each row's own `owns` list before
  either wave starts (`traps-orchestration.md`'s wave-gate rule). Step:
  immediately before dispatch, not after.
- **RES-4: accessibility of the new per-slot control** (focus order, ARIA
  naming, keyboard reachability of a second `TextField select` inside
  `AnnouncementDraftSlot.tsx`, alongside the existing "Format to match" one).
  No component is rendered by any test here (`this-repo.md` section 6), so
  this is unverifiable by any instrument in this repo. Owner: the Wave-3
  Accessibility seat. Instrument: reading the diff (a reading claim, stated as
  one). Step: the follow-up accessibility pass.
- **RES-5: whether the owner wants a STICKY panel-wide default timing for new
  slots** (section 4.1 recommends against it; a real product preference either
  way is the owner's call, not mine to default silently). Owner: the repo
  owner. Instrument: a direct question, batched, not gating. Step: before or
  during the implementer wave - the default-to-`"beginning-of-week"`-per-new-slot
  behavior ships either way in the meantime, since it is the cheaper,
  zero-persistence option and is trivially compatible with adding persistence
  later without a migration (it is a `useState`/reducer-initial-value change,
  not a stored-schema change).

---

## 9. What I could not determine

- **Whether the model, given the midweek instruction block, will actually
  comply with the no-progress-claim guard.** This environment has no API keys
  and every LLM path is exercised only through mocks (`this-repo.md` section
  6) - no claim about real model output is verifiable here, and AC-10's
  instruments all test the PROMPT TEXT, never a live completion. This is the
  honest ceiling of what a prompt-level guard can guarantee; it forecloses the
  channel and instructs against the claim, it cannot force compliance.
- **Whether `docs/a18-scope.md`'s own final `owns` list agrees with my
  grep-based collision flag** (section 2) - that document does not exist yet.
- **The real post-diff line count of every touched file** (section 4.4,
  RES-2) - by construction, since none of this code has been written.
- **Exact UI copy** (RES-1) - deliberately left to the UX seat, not defaulted
  by me past the fact-level pins in AC-9/AC-10b.
