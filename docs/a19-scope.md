# A19 scope: two tones over the same captured pages

**Round 2 - revision, after a round-1 adversarial check returned NOT CLEAN (3
blockers, 4 majors, 8 minors).** `docs/backlog.yml:385-394`. This round carries
three orchestrator rulings (X1, X2, X3) plus all named corrections. Section 0
is the disposition table `iteration-caps.md`'s entry gate 3 requires for every
restructuring round; it maps every round-1 finding id (B1-B3, M1-M4, m1-m8) to
a disposition, and its "new id" column was filled in LAST, after every other
section below was finished and renumbered - not derived alongside the fixes,
per the task's own warning that a sibling artifact on this backlog failed that
gate twice.

**Every quantity below names the command that produced it, re-run this
round.** Line counts (`wc -l`, Bash tool - the same 16 files round 1 cited)
reproduced byte-for-byte identical to round 1's own figures, confirming the
tree has not moved under this document since round 1:

```
$ wc -l src/app/components/walkthrough-announcement/*.ts src/app/components/walkthrough-announcement/*.tsx \
        src/lib/walkthrough-announcement-prompt.ts src/lib/walkthrough-script-prompt.ts \
        src/app/actions/walkthrough-announcement.ts src/app/actions/walkthrough-announcement.test.ts \
        src/lib/walkthrough-announcement-prompt.test.ts src/lib/p11-containment-e2e.test.ts
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
   350 walkthrough-announcement-prompt.ts
   234 walkthrough-script-prompt.ts
   602 walkthrough-announcement.ts
   528 walkthrough-announcement.test.ts
   400 walkthrough-announcement-prompt.test.ts
    99 p11-containment-e2e.test.ts
  6091 total
```

The one side-by-side instrument comparison this document relies on lives in
**section 4.4**, not section 5 - round 1 misnamed the section (m6, disposed
below) - and is re-pasted there, not merely asserted.

**What I did not do, unchanged from round 1.** I did not run `npx tsc
--noEmit` (this repo's rule: exactly one caller, the wave gate -
`this-repo.md` section 2). I wrote no code and no test file. Every sabotage
row in section 7 is a **prescribed** mutation/restore pair, not an executed
one, stated plainly at each row.

---

## 0. Disposition table

Every round-1 finding id, its disposition, and where it lands in this
revision. The "New id/location" column was populated last, after the whole
document below was finished and its section/AC numbers were final.

| Round-1 id | Finding (one line) | Disposition | New id / location |
|---|---|---|---|
| B1 | "Absent by construction" / "absence of any channel" was false - `notes` is a real, required, instruction-authority channel (Ruling X1) | **Fixed in place.** Withdrew the false absence claim; added a stated precedence rule; restated the leverage class as per-slot divergence, not GUARANTEED. Non-gating owner question added for the output-side receipt upgrade path (disposal type: **(b) Reduce**, scope question riding alongside, not gating). | Section 1 (rewritten); Section 4.2 (precedence clause + placement); AC-10d (new); RES-6 (new) |
| B2 | AC-9/AC-10b let a cosmetic or presumptive-progress draft pass every criterion | **Fixed in place.** AC-10b widened from two named prohibitions to presumptive-progress generally, with a named keyword set; AC-9 pins one named substring; the exact instructional prose is **relocated** to the architect/UX seat as a named obligation (disposal type: **(a) Relocate** - receiver and obligation both named). | AC-9 (rewritten); AC-10b (widened); RES-1 (widened, renamed owner) |
| B3 | `docs/a18-scope.md` was asserted not to exist three times; it exists, collision is 4 paths not 1; A17 was named related but never consulted | **Fixed in place.** Section 2.1 rewritten against A18's real content; four-path owner/sequencing table added; A17 read and its overlap with `AnnouncementDraftSlot.tsx`'s `staleChoice`/regenerate region stated. | Section 2.1 (new); RES-3 (rewritten) |
| M1 | `WalkthroughAnnouncementDraftInput` is not exported, so AC-10c's `keyof`-driven test cannot reach it; AC-10c's honest limits were overclaimed | **Fixed in place.** `export` added to the implementer's change-list (one keyword); AC-10c rewritten to state its two honest limits (name-regex verdict, one-level-deep enumeration) rather than calling it a walled set. | Section 5 (owns row); AC-10c (rewritten) |
| M2 | Two quotations attributed to the backlog row that the row does not contain | **Fixed in place - deletion of the misattribution, design kept.** Both fabricated quotes removed; the underlying design (required field, byte-identical default arm) is unchanged and re-justified against what the row actually says. | Section 4.2 (rewritten paragraph) |
| M3 | AC-12's sabotage (delete the first `phase === "drafted"` conjunct) cannot go red - narrowing is done by the second conjunct | **Fixed in place.** Sabotage replaced with a comparison-operator flip (`!==` to `===`), which does discriminate. | AC-12 sabotage row (section 7, rewritten) |
| M4 | RES-5 inverts the repo's persist-every-new-control rule without citing it | **Fixed in place.** Standing rule now named and cited (in-feature precedent plus the cross-doc pattern); the mount-effect requirement is carried into the "if persisted" branch explicitly. | Section 4.1 (amended paragraph); RES-5 (rewritten) |
| m1 | The comment at `announcement-draft-slots.ts:69-71` documents `researchNotice` (`:72`), not `builtFrom` (`:68`) | **Fixed in place.** Citation corrected; the substantive precedent (REQUIRED-field argument) is unaffected and still applies via `researchNotice`. | Section 4.1 (citation corrected) |
| m2 | AC-4's chain skipped two hops: hook `addSlot` and `SlotsAction["add"]`'s own signature | **Fixed in place.** Hook `addSlot`'s signature change and the `"add"` member's new field added to the owns list and to AC-4's instrument. | Section 5 (owns row); AC-4 (rewritten) |
| m3 | `ctx` means two different types across AC-5/AC-6, correct only because of an `extends` relationship - the same hazard the doc rejected `kind` for | **Fixed in place.** Named explicitly as a same-identifier-two-concepts hazard, with the citation. | Section 4.2 (new note) |
| m4 | AC-6/AC-11's "inside the callback body" language is not backed by a scoped instrument - the cited precedent is a whole-file regex; AC-7's object file is never read by the structure test today | **Fixed in place.** Instruments rewritten to specify structural slicing (anchor + `indexOf`/`slice`, A18's AC-3 style) instead of a whole-file `toMatch`; AC-7 states plainly that the structure test needs a new reader for `walkthrough-announcement.ts`. | AC-6, AC-7, AC-11 (rewritten); Section 5 (owns row) |
| m5 | `walkthrough-script-prompt.ts:20-25`'s own header bans "branching one with a flag," which is what `timingClause(timing)` is | **Fixed in place.** The sentence is quoted directly and rebutted on its own terms (register/person/ordering identity, not difference) rather than omitted. | Section 4.2 (new paragraph) |
| m6 | Front matter claims both instruments agree on every file but pastes only one `wc -l` batch plus one side-by-side; the side-by-side is in 4.4 not section 5; unbalanced parenthesis in the opening line | **Fixed in place.** Evidence re-pasted this round (above); section reference corrected to 4.4; the round-1 opening line's unclosed parenthesis does not recur (this round's front matter was rewritten from scratch for round 2 and does not carry it forward). | Front matter (rewritten) |
| m7 | AC-9's substring was unnamed ("something like"); "texually" typo; 4.4's `draftOne` row cross-referenced AC-7 where AC-6 was meant | **Fixed in place.** All three corrected. | AC-9 (named substring); Section 4.4 (`draftOne` row now cites AC-6); typo fixed |
| m8 | Missing reciprocal name sweep (`AnnouncementTiming`/`*Timing`/`timing` hit counts) and the "submission timing" near-collision | **Fixed in place.** Sweep re-run and pasted; near-collision sentence added. | Section 4.1 (new sweep + sentence) |

---

## 1. Leverage claim

**Ruling X1 applied in full.** Round 1's claim rested on a false premise -
`buildWalkthroughAnnouncementPrompt`'s argument type is **not** free of a
channel that could carry instructor-supplied progress data into the composer.
Opened this round:

```
$ sed -n '235,239p' src/lib/walkthrough-announcement-prompt.ts
  /** The instructor's free-text notes, entered before capture (AC3).
   * Instructor-authored context, composed as an instruction rather than
   * framed as untrusted data - the same treatment take-announcement.ts gives
   * topic/objectives/card text. "" when absent. */
  notes: string;
```

`notes` is REQUIRED (not optional - a plain `string`, not `string | null`),
and at `:333-336` it is pushed as its own `"INSTRUCTOR NOTES"` block, **outside**
`UNTRUSTED_CONTENT_FRAMING`'s protection (that framing wraps the block above
it, `:323`, and notes are appended after, at instruction authority - opened
this round, `walkthrough-announcement-prompt.ts:333-336`). An instructor
typing "only 12 of 30 have submitted" lands in the prompt as an instruction,
sitting alongside a midweek clause that says the opposite, with **no stated
precedence** - unlike this same file's own conflicts at `:285` ("FORMAT WINS
ON STRUCTURE and VOICE WINS ON WORDING... except where THE ANNOUNCEMENT FLOOR
above requires more paragraphs") and `:299` ("It does NOT override the three
rules above"), both opened this round and both real, both stating an explicit
winner.

**(a) Withdrawn, plainly.** "Absent by construction" and "absence of any
channel to carry that data into the composer" are struck. The `notes` channel
is real, required, and instruction-authority. No claim in this document
depends on the model being structurally unable to see instructor-supplied
progress data - it can, if the instructor types it.

**(b) The precedence rule, added to the midweek clause itself (section 4.2).**
Following this file's own two precedents' style (`:285`, `:299` - a bold
statement of which instruction wins), the midweek block gains its own
explicit precedence sentence: *"This holds even if the instructor notes above
mention a number, a name, or a completion status: that information is for
your own planning context, not verified tracking data you are allowed to cite
or confirm in this announcement."* This is now **AC-10d** (section 6) - a
sentence naming the conflict and its winner, not an implicit race between two
same-authority instructions.

**(c) The claim restated, not force-fit into GUARANTEED.** `leverage.md`
defines GUARANTEED as an output property the code holds **regardless of what
the model returns**, and this document's own section 9 already concedes a
prompt-level guard cannot force model compliance - so GUARANTEED was never
earned here. The real, checkable delta the round-1 check confirmed is
**per-slot divergence**: today, `buildRequest` (`WalkthroughAnnouncementPanel.tsx:569-582`)
assembles ONE `AnnouncementDraftRequestContext` per Generate, shared by every
slot in that batch - there is no field on it that can differ per slot, so
three slots reading the same captured pages and the same notes text cannot
produce two differently-toned drafts in one Generate today. After this
chunk, `timing` becomes a **per-slot** field (section 4.1), threaded through
`generate()`'s per-slot dispatch loop (`useAnnouncementDraftSlots.ts:284-288`)
so two slots built from the identical captured materials, identical notes,
identical outline and identical course/module context can carry two
different `timing` values into two differently-governed prompt compositions,
in the same Generate click. This does not map cleanly onto one of
`leverage.md`'s six named rows (its own text says the list is not
exhaustive); it is named here as its own checkable fact rather than
stretched into GUARANTEED or SCALE.

**What the user does instead today, and what it costs.** A chat window has no
draft-slot abstraction: getting two differently-toned drafts from the same
pasted material means either two separate conversations (re-pasting
everything, no code-level guarantee the two drafts saw identical source
material) or two sequential asks in one thread (real risk of the second ask's
instructions bleeding into or being coloured by the first draft still sitting
in context). This app's two slots are dispatched from provably identical
shared fields except the one axis that is supposed to differ - a code fact
(AC-5, section 6), not a hope about chat hygiene.

**The removal test, retargeted to AC-5, with AC-9 as supporting evidence.**
State the deletion: if `generate()`'s per-slot dispatch loop is changed to
read a single, panel-wide timing value (or a hardcoded constant) instead of
`slot.timing`, two slots with different `timing` selections would be
dispatched with the **same** effective timing, and AC-5's own instrument (a
source-text assertion that the dispatch object literal reads `slot.timing`,
not a shared value - section 6) goes RED. AC-9 supplies the second half:
holding every other input constant (`baseArgs()`) and varying only `timing`
produces two different composed prompts (`not.toBe`) - together, AC-5 proves
the SLOT-level plumbing is real and AC-9 proves the DIVERGENCE it enables is
real. Neither alone is the removal test; both together are, because AC-5's
mutation is exactly "remove the mechanism that makes per-slot divergence
possible," and it is AC-5's own assertion, not AC-9's, whose observed value
flips when that mechanism is deleted.

**Non-gating owner question, riding alongside, not blocking dispatch.**
Whether to additionally build an OUTPUT-SIDE RECEIPT that inspects the
model's returned announcement text for presumptive-progress language after
the fact - this WOULD earn GUARANTEED (an output property held regardless of
what the model returns), and has two in-repo precedents: the permitted-URL
enforcer already running on model output inside `walkthrough-announcement.ts`
(cited by round 1, unchanged), and `leverage.md`'s own instance (3),
`src/app/api/course-intel/ask/route.ts:864-871`'s `unexplainedStudentIndices`
receipt (re-opened this round, confirmed present at that citation). Working
choice, per the ruling: per-slot divergence ships now; the receipt is
recorded as an upgrade path (RES-6, section 8), not built in this chunk.

---

## 2. What exists today - reuse survey

**Unchanged from round 1, re-verified this round; every command re-run.**
Directory listing, line counts, the no-upload sweep, the slot-machinery
table, the prompt-seam call-site census, and the no-gradebook sweep all
reproduced identically to round 1's own pasted output (see the front matter's
`wc -l` batch above for the line counts; the remaining greps below were
re-run, not copied):

```
$ grep -rni "upload\|accept=\|type=\"file\"\|videoFile" src/app/components/walkthrough-announcement/
WalkthroughAnnouncementPanel.tsx:47:import { checkWireBudget, sumBase64WireBytes } from "@/lib/upload-budget";
```

```
$ grep -rn "buildWalkthroughAnnouncementPrompt(" src/ | cut -d: -f1 | sort | uniq -c
      1 src/app/actions/walkthrough-announcement.ts
      1 src/lib/p11-containment-e2e.test.ts
     35 src/lib/walkthrough-announcement-prompt.test.ts
      1 src/lib/walkthrough-announcement-prompt.ts   <- the definition itself
```

```
$ grep -n "submission\|gradebook\|grade\b" -i src/app/actions/walkthrough-announcement.ts \
    src/lib/walkthrough-announcement-prompt.ts src/app/components/walkthrough-announcement/*.ts \
    src/app/components/walkthrough-announcement/*.tsx
src/lib/walkthrough-announcement-prompt.ts:64: * text (too small) nor deck-grade slide source material (needlessly large
src/app/components/walkthrough-announcement/walkthrough-announcement-coverage.ts:41: // heading that happens to contain a name or a grade - the acceptance
src/app/components/walkthrough-announcement/AnnouncementCourseFieldset.tsx:254: window rather than your whole screen, and close any gradebook, inbox, or student submission first.
```

The slot-machinery table (`TemplateChoice` at `:50-54`, `ResolvedTemplate` at
`:60-63`, `Drafted.builtFrom` REQUIRED at `:65-73`, `FIRST_SLOT_ID` at `:44`,
`choiceId`/`builtFromId` at `:148-156`, `defaultOptionLabel`/`receiptLabel` at
`:158-169,209-213`, the frozen dropdown invariant at `:216-245`,
`optionsForSlot` at `:246-283`, `SlotsAction` 14 members at `:339-360` with
its canary at `announcement-draft-slots.test.ts:668-684`, `makeSlot`/
`initialSlots` at `:316-333`, `slotsReducer` at `:372-488`) was re-opened this
round in full (`src/app/components/walkthrough-announcement/announcement-draft-slots.ts`,
`src/app/components/walkthrough-announcement/useAnnouncementDraftSlots.ts`)
and every citation resolves exactly as round 1 recorded it, **with one
correction (m1, disposed above)**: the comment at `:69-71` documents
`researchNotice` (declared at `:72`), not `builtFrom` (declared at `:68`).
Round 1's substantive argument - "REQUIRED, not optional, because an optional
field lets a caller omit it with every gate green" - still applies to
`timing` by the identical reasoning; it is simply anchored to the correct
field's comment now.

### 2.1 The collision with A18 - RESOLVED this round, and A17 consulted (Ruling X3)

**`docs/a18-scope.md` exists.** `git log --oneline -1 -- docs/a18-scope.md`
returns `914594d docs(walkthrough-announcement): scope A18 - stop the tool's
copy claiming it records`, committed nine minutes before A19's own first
commit (`ba15be7`). Round 1 asserted three times that this file did not
exist; it did, and the collision is **four paths, not one** - A18's own
`owns` table (`docs/a18-scope.md` section 3) names exactly these four, and
none of the other three A18 touches (`AnnouncementCourseFieldset.tsx`,
`classTrendsDraft.not-postable.test.ts`) are touched by A19:

| Path | A18's edit (lands first) | A19's edit (this document, lands second) |
|---|---|---|
| `src/app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx` | Reword the empty-material hint at `:883` ("Record and stop..." -> a capture/read framing). | Narrow structural additions per section 4.4's table (`draftOne`, hook destructure, both `addSlot` call sites, `<AnnouncementDraftSlot>` props). **No line-number overlap with A18's single edit at `:883`**, but both land in the same 979-line file - A19 must rebase on A18's landed diff and re-measure (AC-13) against the POST-A18 line count, not the 979 measured by either document. |
| `src/app/actions/walkthrough-announcement.ts` | Reword the duplicated empty-input error string at `:392` and `:538`. | Export the `WalkthroughAnnouncementDraftInput` interface (M1, one keyword), add its REQUIRED `timing` field, forward `input.timing` into the composer call around `:396-412`. **A18's `:392` and A19's `:396-412` are four lines apart, inside the SAME function** (`draftWalkthroughAnnouncementAction`) - opened this round, confirmed (section 5's re-read of `walkthrough-announcement.ts:280-420`). Sequence strictly; do not run both waves against this file concurrently. |
| `src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts` | Add new source-text assertions for A18's AC-1/AC-3/AC-4 (the reworded copy, plus a guard that the protected video-script wording survives). | Add new assertions per this document's AC-3/AC-4/AC-7/AC-10a-d/AC-14/AC-15 (section 6). **A19's implementer must re-run the anchor-collision check A18's own section 5 performed, against A18's LANDED test content (post-914594d-plus-implementation), not against the 457-line pre-either-change version measured here** - a new describe block added by A18 could in principle share an anchor with one A19 adds; nothing in either document proves it does not, because neither could see the other's landed diff at authoring time. |
| `src/app/actions/walkthrough-announcement.test.ts` | Add a count assertion for the duplicated error string (A18's AC-2). | Add a forwarding assertion for `WalkthroughAnnouncementDraftInput.timing` (this document's section 5, `walkthrough-announcement.test.ts` row) - the two additions are independent AC families and do not share an anchor by inspection, but the same re-collision-check caveat applies as the row above. |

**Sequencing ruling, carried verbatim, not re-argued: A18 lands first, A19
second, A17 third.** `docs/a18-scope.md` was present in `git status --short`
as **modified** (uncommitted) at the time of this reading - a concurrent seat
may be revising it further after this document is written. The four-path
table above is accurate against the content read this round; it should be
re-confirmed against A18's own final committed version before either
implementer wave is dispatched (folded into RES-3, section 8).

**A17, consulted, not merely named.** `docs/BACKLOG.md`'s A17 row names this
exact tool's `staleChoice`/regenerate machinery, and A19 sits directly beside
it. Opened this round: `AnnouncementDraftSlot.tsx:77-78` (`staleChoice`'s own
double-guard expression, also the object of M3 below), `:147-151` (the
`staleChoice` hint paragraph - "This draft was made from a different format -
Regenerate to apply your new choice"), `:221-230` (the `ConfirmArmButtons`
regenerate control) and `:237-238` (the regenerate consequence line);
`WalkthroughAnnouncementPanel.tsx:667-672` (the hook destructure including
`regenerate`, `armRegenerate`, `cancelRegenerate`) and `:912-914`
(`onRegenerateArm`/`onRegenerateConfirm`/`onRegenerateCancel` props) - all
five citations resolve exactly as A17's own backlog row states.

**The overlap, stated plainly.** A19's `staleTiming` (section 4.1, AC-12) is
designed as a direct sibling of `staleChoice`, rendered in the **same fieldset**,
immediately adjacent to the same `:147-151` hint paragraph and the same
`:221-230`/`:237-238` regenerate control A17's own instrument names. A17 is
currently `unscoped` (a discoverability/labelling row, not yet a design
document) and per the sequencing ruling lands **after** A19. This means:
A19's implementer adds a second `TextField select` and a second stale-hint
paragraph into `AnnouncementDraftSlot.tsx` in the same region A17 will later
need to re-read; **whoever scopes A17 must re-measure `AnnouncementDraftSlot.tsx`'s
line numbers against the POST-A19 tree**, not against the round-1/round-2
262-line baseline cited here. Recorded as RES-3 (section 8), owned by the
future A17 scoping seat.

---

## 3. What A19 must NOT build (the guard, restated as a constraint on the design)

**Unchanged from round 1; still true; re-confirmed this round with the same
absence-of-gradebook-or-submission-read sweep pasted in section 2.** Any
midweek copy that reads as "knowing" who is behind is false confidence.
Section 4 designs the containment this constraint drives; section 6 (AC-10,
now four sub-clauses) is its acceptance criterion.

---

## 4. The four design calls

### 4.1 Where `timing` lives, and its name

**Unchanged decision: a new, independently-named field, `timing:
AnnouncementTiming`, NOT reusing `kind`.** The reasoning is unchanged from
round 1 (a real grep hazard in a repo that leans on source-text tests for
wiring proof) and is not disputed by any round-1 finding.

**Reciprocal name sweep, run this round (m8, disposed above) - not present in
round 1's own document:**

```
$ grep -rn "AnnouncementTiming" src --include="*.ts" --include="*.tsx" | wc -l
0
$ grep -rn "^export type.*Timing\|interface.*Timing" src --include="*.ts" --include="*.tsx"
(no output - no *Timing type exists anywhere in the tree today)
$ grep -rn "\btiming\b" src --include="*.ts" --include="*.tsx" | wc -l
90
$ grep -rln "\btiming\b" src/app/components/walkthrough-announcement/ src/app/actions/walkthrough-announcement.ts src/lib/walkthrough-announcement-prompt.ts
(no output - none of the 90 hits are in this feature's own files today)
```

`AnnouncementTiming`/`timing` are clear names to introduce: no collision, no
existing type to conflict with, and this feature's own files currently
contain zero uses of the word. **One semantic near-collision worth a
sentence, not a rename**: `grading-row-serialization.ts:74`'s comment already
uses the phrase "submission timing" ("D23c's three-valued submission
timing") - a different feature, a different file, and a different meaning
(when a submission arrived relative to a due date, not which of two
announcement tones was chosen) - but it is the same two-word phrase, in this
repo's submission-tracking vocabulary, on a feature whose entire guard
(section 3) is "never claim anything about submissions." A reader grepping
"submission timing" repo-wide would land on both features; naming the new
type `AnnouncementTiming` (not bare `Timing` or `SubmissionTiming`) keeps the
two apart by construction.

**Lives on BOTH the slot and the draft, unchanged from round 1.** The
argument is anchored to the correct comment now (m1, disposed above):
`Drafted.researchNotice`'s own doc comment at `announcement-draft-slots.ts:69-71`
states "REQUIRED, not optional - an optional field lets a caller omit it with
every gate green, which is exactly how this notice shipped dead in an earlier
round" (the comment sits immediately above `researchNotice`'s declaration at
`:72`, not above `builtFrom` at `:68` as round 1 mis-cited). The identical
argument applies to `timing`, and the two-part design (`DraftSlot.timing`
live/mutable, `Drafted.timing` frozen at draft time) is unchanged.

**Where the TYPE is defined.** Unchanged: `walkthrough-announcement-prompt.ts`,
re-exported from `announcement-draft-slots.ts`, matching the established
component -> lib import direction this file already uses for
`WALKTHROUGH_ANNOUNCEMENT_MATERIALS_CAP`.

**Not persisted - the standing rule this departs from, now named (M4, disposed
above).** This repo carries a standing rule, restated in essentially every
scope document in this directory's own family and beyond, that "every new
textbox/select/checkbox persists across reloads under a `ta-` key" -
in-feature precedent: `docs/announcement-from-walkthrough-acceptance-criteria.md:64`
("that every new textbox persists applies, under a `ta-`-prefixed key") and
`:409` ("the standing 'every new textbox persists under a...'"); the same
pattern recurs, independently, in at least ten other scope documents in this
repo (`docs/bulk-bar-reorganization-acceptance-criteria.md:249`,
`docs/current-events-assignment-from-modules-acceptance-criteria.md:132`,
`docs/discussion-reply-sort-filter-acceptance-criteria.md:260`,
`docs/modules-selection-ask-ai-acceptance-criteria.md:56`,
`docs/objectives-post-target-from-selection-acceptance-criteria.md:278`,
`docs/org-student-repo-provisioning-acceptance-criteria.md:56`,
`docs/scheduled-publishing-from-modules-acceptance-criteria.md:138`,
`docs/snapshot-grading-acceptance-criteria.md:256`, each opened this round via
grep, not quoted from memory). **This design departs from that standing rule
for the per-slot `timing` control**, on the strength of a real, in-feature
analogy: `TemplateChoice` is the SAME shape of per-slot control (a dropdown
choosing one of a small closed set, scoped to a single slot, not a panel-wide
preference) and is itself NOT persisted - `useAnnouncementDraftSlots.ts:161`'s
`useReducer(slotsReducer, FIRST_SLOT_ID, initialSlotsFromId)` re-derives every
slot's `choice` fresh on every mount via `initialSlotsFromId` ->
`makeSlot(id, { kind: "default" })`, never reading a stored value. `timing`
is proposed to follow the identical rule: no new `ta-` key, the five-key
canary (`walkthrough-announcement.structure.test.ts:106-112`, re-run this
round: `expect(distinctKeys.size).toBe(5)`, still 5) stays unbumped, new
slots default to `"beginning-of-week"` unconditionally.

**If the implementer instead adds a persisted default (an explicit, named
departure from this recommendation, not silent), two things are owed
together, not the persistence alone:** the five-key canary's expected value
becomes 6, justified in the commit message (unchanged from round 1); and,
newly required this round (M4), **a mount effect** - a `useState` initializer
seeded from `localStorage` never shows its restored value on first render
without one (this repo's own recorded hydration hazard: a localStorage-seeded
`useState` initializer renders the default on the server/first client pass
and only reflects the stored value after a `useEffect` runs, so a bare
initializer without a paired mount effect silently ships a control that
*looks* unpersisted on first paint every time). This is stated in the
"persist" branch itself, not left implicit, per M4's ruling.

### 4.2 The prompt seam: one parameter, REQUIRED, not a sibling module

**Decision unchanged: `buildWalkthroughAnnouncementPrompt` gains one REQUIRED
parameter, `timing: AnnouncementTiming`.**

**The `walkthrough-script-prompt.ts` precedent, quoted and rebutted directly
(m5, disposed above) - round 1 cited this file without quoting the one
sentence that argues against the shape chosen here.** Opened this round,
`walkthrough-script-prompt.ts:20-25`:

> "WHAT MAKES THIS A SCRIPT AND NOT AN ANNOUNCEMENT (AC5): a sibling group is
> composing the announcement from the same captured materials. **Reusing one
> composer for both, or branching one with a flag, would blur two documents
> with genuinely different constraints** - spoken vs written, second person
> vs whatever voice the announcement's exemplar dictates, walkthrough order vs
> the announcement's own structural outline. They are two leaves on purpose."

`timingClause(timing)` is, in the literal sense that sentence names, "branching
one with a flag." The rebuttal is not that the sentence is wrong in general -
it is that **the axis it is warning about does not apply between the two
timings the way it applies between a script and an announcement.** The
script/announcement split exists because the two outputs differ in **register**
(spoken vs written), **person** (second vs whichever the exemplar dictates),
**ordering guarantee** (walkthrough order vs structural outline) and **output
format** (script text vs Markdown announcement) - four independent axes, all
different, all named in that file's own header. The two *timings* differ in
**none** of those four: both are Markdown announcements, both obey the same
outline-governs-format/style-governs-voice rule
(`walkthrough-announcement-prompt.ts:282-287`), the same coverage-order and
coverage-honesty rules (`:308-317`), the same announcement floor (`:294-300`),
written in the same person, to the same audience, in the same format. Exactly
one additional instruction block differs. The precedent's own warning is about
blurring documents that are constitutionally different; these two are
constitutionally the same document with one paragraph that changes. Cited and
rebutted on its own terms, not silently worked around.

**Why REQUIRED, not defaulted - the row's actual words, not a fabricated
quote (M2, disposed above).** Round 1 attributed two quotations to
`docs/backlog.yml`'s A19 row that the row does not contain: a "defaulted
parameter whose default arm is byte-identical" quote and a "40-site cost the
row's own framing worried about" claim. **Both are deleted.** What the row
actually says (`docs/backlog.yml:394`, re-read this round): *"whether the two
kinds share `buildWalkthroughAnnouncementPrompt` with a parameter or get
their own module... the default-arm-byte-identical technique this repo has
used before is the safe way to add a parameter to a live prompt."* The row
names a **technique** (a byte-identical default arm), not a required-vs-
optional syntax choice, and mentions no site count at all. The design this
document makes - REQUIRED field, neutral default value that renders as an
empty contribution - **is** an application of that technique; it simply
resolves the required-vs-optional question the row leaves open by pointing at
`emojiPolicy`/`researchedResources` on the same interface, both REQUIRED, and
at this exact file's own recorded incident (`walkthrough-announcement.ts:328-338`'s
comment: both fields sat REQUIRED on the action's input type for a whole wave
without ever reaching the composer, because the composer itself had no
matching parameter yet). An optional composer parameter reopens exactly that
gap for `timing`.

```ts
function timingClause(timing: AnnouncementTiming): string {
  if (timing !== "midweek") return "";
  return [
    "MIDWEEK CHECK-IN",
    /* exact wording relocated to the architect/UX seat, RES-1 - the three
       FACTS below are fixed by this scope; their phrasing is not */
    "<fact 1: this is a check-in, not a status report - frame around what is coming/due>",
    "<fact 2 (AC-10a/b): no submission, completion, or gradebook data was given - do not state or imply any of it, including generic presumptive-progress framing>",
    "<fact 3 (AC-10d): this holds even if the instructor notes above name a number, a name, or a status>",
  ].join("\n");
}
```

**Placement in `blocks` - the site the precedence rule (AC-10d) depends on.**
Inserted immediately after the existing `if (notes) blocks.push(...)` line
(`:333-336`) and before `materialsSection` is computed:

```ts
const notes = args.notes.trim();
if (notes) blocks.push(["INSTRUCTOR NOTES", notes].join("\n"));

const timingBlock = timingClause(args.timing);
if (timingBlock) blocks.push(timingBlock);   // <- new, this chunk

const materialsSection = [ /* unchanged */ ].join("\n");
blocks.push(materialsSection);
```

Placing the midweek block **after** notes, not before, is what lets its own
text say "the instructor notes **above**" (AC-10d) - a forward reference would
be false. It also gives the guard textual recency over notes, immediately
ahead of the untrusted materials text, rather than burying it earlier in the
instruction stack alongside emoji policy and resource citation.

**Byte-identical default arm, unchanged mechanism.** `"beginning-of-week"`
renders `timingClause` to `""`, which is falsy, so nothing is pushed -
matching the existing `if (notes)` / `if (coverageBlock)` conditional-push
idiom already in this function. Every existing fixture's expected output is
therefore unchanged by construction. **Edit cost: three sites** (unchanged
measurement from section 2's call-site census: `baseArgs()`, the one direct
call in `p11-containment-e2e.test.ts`, the one production call in
`walkthrough-announcement.ts`).

**The wiring hop that needs its own canary - unchanged mechanism, m3's naming
hazard flagged.** `walkthrough-announcement.structure.test.ts:270-283` ("G3
Correction M5") already proves this shape of wiring gap for `emojiPolicy`/
`researchOutcome`; AC-7 requires the same shape for `timing` (section 6, with
m4's slicing correction applied).

**The `ctx` naming hazard (m3, disposed above).** AC-5 and AC-6 both use the
identifier `ctx`, but across two DIFFERENT types: AC-5's `ctx` is a
`slot`-scoped local inside `generate()`'s loop reading `AnnouncementDraftDispatchContext`
fields spread from the shared request context (`{ ...ctx, researchOutcome }`,
`useAnnouncementDraftSlots.ts:287`), while AC-6's `ctx` is
`draftOne`'s own parameter, typed `AnnouncementDraftDispatchContext` directly
(`WalkthroughAnnouncementPanel.tsx:617`). The two readings are compatible only
because `AnnouncementDraftDispatchContext extends AnnouncementDraftRequestContext`
(`useAnnouncementDraftSlots.ts:62`, opened this round) - every field on the
narrower parent type is guaranteed present on the child, so `ctx.timing`
resolves the same way in both places by inheritance, not by coincidence. This
is the same same-identifier-two-concepts hazard this document's own section
4.1 rejected `kind` for (round 1, unchanged): one name, two types, correct
only because of a structural relationship a reader has to already know about.
Named here so a future reader does not assume `ctx` means one thing across
both call sites' surrounding code.

**`SlotsAction` gains a 15th member, and the chain has two more hops than
round 1 listed (m2, disposed above).** The full chain, all four hops, opened
this round:

1. `WalkthroughAnnouncementPanel.tsx`'s two `addSlot(...)` call sites
   (`:780-786`, `:926`) must pass a `timing` argument.
2. **The hook's own `addSlot`, `useAnnouncementDraftSlots.ts:224-228`,
   currently takes ONE parameter** (`(choice: TemplateChoice) => { ...
   dispatch({ type: "add", id, choice }); }`) **and must gain a second,**
   `timing: AnnouncementTiming`, forwarded into the dispatched action. Round
   1's owns table for this file did not list this edit at all - it is added
   to section 5 below.
3. `SlotsAction["add"]` (`announcement-draft-slots.ts:340`) gains a `timing:
   AnnouncementTiming` field alongside its existing `choice`.
4. `slotsReducer`'s `"add"` case (`:374-377`) forwards `action.timing` into
   `makeSlot(action.id, action.choice, action.timing)`, and `makeSlot`
   itself (`:316-329`) gains the third parameter.

The exhaustive `Record<SlotsAction["type"], true>` canary
(`announcement-draft-slots.test.ts:668-684`) is unaffected by the new
**field** on an existing member (it keys on `type`, the discriminant, not on
a member's other fields) - it still needs no change for this specific edit,
only for a wholly new member (`"choose-timing"`, unchanged from round 1).

### 4.3 The frozen dropdown invariant - re-derived, does NOT carry over unchanged

**Unchanged from round 1; no round-1 finding challenged this section; the
round-1 check confirmed the re-derivation sound (front matter, "confirmed
sound" list).** `AnnouncementTiming` is a closed, static, two-member union
with no live source, no async fetch, no deletion-elsewhere case - the
invariant at `announcement-draft-slots.ts:216-245` does not apply to it, for
the stated, re-checkable reason given in round 1.

### 4.4 The line budget

**Unchanged from round 1; both instruments re-run this round, same result.**

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

Both mandated instruments agree at **979**; `Measure-Object -Line` disagrees
by 67, the same class of disagreement `this-repo.md` section 3 documents on a
different file (42 lines there) - never use it. **21 lines of headroom**
against the 1000-line ceiling (`src/file-size-ceiling.structure.test.ts:30`).

**The backlog row's "any new control needs the extraction in the chunk"
premise mostly does not fire, unchanged finding**: the per-slot control lands
in `AnnouncementDraftSlot.tsx` (262 lines), not the panel. The panel's own
edits, corrected (m7 - `draftOne`'s row now cites AC-6, not AC-7):

| Site | `file:line` (current) | Change | Est. lines |
|---|---|---|---|
| `buildRequest` | `:569-582` | **None.** `timing` is per-slot, never added to the shared `AnnouncementDraftRequestContext`. | 0 |
| `draftOne` | `:615-641` | Forward `timing: ctx.timing` into the `draftWalkthroughAnnouncementAction` call (**AC-6**, corrected from round 1's AC-7). | +1 |
| Hook destructure | `:658-674` | Add `chooseTiming` to the destructured return of `useAnnouncementDraftSlots(...)`. | +1 |
| `addSlot` call sites | `:780-786`, `:926` | Both calls gain a second argument, `"beginning-of-week"`. | 0 (same lines, edited) |
| `<AnnouncementDraftSlot>` props | `:894-919` | Pass `onChooseTiming={chooseTiming}` alongside `onChooseTemplate={chooseTemplate}` (`:910`). | +1 |

**Estimated net growth: roughly 3-10 lines, landing at 982-989** - explicitly
NOT asserted as measured (the code does not exist yet). AC-13 (section 6)
requires the implementer to re-measure with both instruments after the real
diff, **against the POST-A18 baseline** if A18 has landed first per the
sequencing table in 2.1, not against the 979 measured here.

`AnnouncementDraftSlot.tsx` (262 lines) gains the new `TextField select`
block (roughly 15-20 lines) plus a `staleTiming` hint (roughly 5 lines),
landing around 282-287 - far under the ceiling, and in the same region A17
will need to re-read (2.1).

---

## 5. `owns` - exact paths

### Production (7 files)

| Path | Lines now | Role |
|---|---|---|
| `src/lib/walkthrough-announcement-prompt.ts` | 350 | Add `AnnouncementTiming`, `timingClause`, `timingLabel`; add REQUIRED `timing` field to `WalkthroughAnnouncementPromptArgs`; wire into `buildWalkthroughAnnouncementPrompt`'s `blocks`, inserted per section 4.2's placement (after the `notes` push, before `materialsSection`). |
| `src/app/actions/walkthrough-announcement.ts` | 602 | **Add `export` to `interface WalkthroughAnnouncementDraftInput`** (currently unexported at `:311` - M1; legal in a `"use server"` file per `src/lib/use-server-exports.test.ts:104`'s `ALLOWED` regex, `/^export\s+interface\b/`, confirmed this round). Add REQUIRED `timing: AnnouncementTiming` to the same interface; forward `input.timing` into the composer call (`:396-412`). **Sequence after A18's edits at `:392`/`:538` in the same function (2.1).** |
| `src/app/components/walkthrough-announcement/announcement-draft-slots.ts` | 488 | Re-export `AnnouncementTiming`; add `timing` to `DraftSlot` and `Drafted`; add `"choose-timing"` to `SlotsAction` (new member, bumps the exhaustive canary to 15); add its reducer case; add `timing: AnnouncementTiming` to the EXISTING `"add"` member (m2 - no canary bump needed for this one, since it adds a field to an existing member, not a new member); add `timing` param to `makeSlot`/`initialSlots`; reducer's `"add"` case forwards it. |
| `src/app/components/walkthrough-announcement/useAnnouncementDraftSlots.ts` | 408 | Add `timing` to `AnnouncementDraftDispatchContext`; forward `slot.timing` into the per-slot dispatch context inside `generate()` (`:284-288`) and `regenerate()` (`:291-311`); forward `ctx.timing` into the `"result"` action's payload inside `runDraft`'s `onResult` (`:200-215`); **add a second parameter, `timing: AnnouncementTiming`, to `addSlot` (`:224-228`), forwarded into `dispatch({ type: "add", id, choice, timing })`** - this edit is new to the owns list this round (m2); add and return `chooseTiming`. |
| `src/app/components/walkthrough-announcement/AnnouncementDraftSlot.tsx` | 262 | New per-slot timing `TextField select` (two static options); `staleTiming` hint mirroring `staleChoice` (AC-12, comparison-flip sabotage, section 7); render `timingLabel(...)` beside `receiptLabel(...)` (`:137`), never merged into it. **Same region A17 will later re-read (2.1) - flag, do not block on it.** |
| `src/app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx` | 979 | Narrow edits only - section 4.4's table. **Sequence after A18 (2.1); re-measure against the post-A18 line count for AC-13.** |
| `src/app/actions/walkthrough-announcement.test.ts` | 528 | Extend to cover `WalkthroughAnnouncementDraftInput.timing` forwarding (AC-6 area). **May collide with A18's own AC-2 addition to this same file (2.1) - re-run the anchor check after A18 lands.** |

### Tests (5 files, at minimum)

| Path | Lines now | Change |
|---|---|---|
| `src/lib/walkthrough-announcement-prompt.test.ts` | 400 | `baseArgs()` (`:35-48`) gains `timing: "beginning-of-week"`; new `describe` blocks for AC-8/AC-9/AC-10a-d. |
| `src/lib/p11-containment-e2e.test.ts` | 99 | The one direct call (`:45-55`) gains `timing: "beginning-of-week"`. |
| `src/app/components/walkthrough-announcement/announcement-draft-slots.test.ts` | 686 | C1 canary `:668-684` updated to 15 members, `"choose-timing": true,` added; new `describe("\"choose-timing\"")` block mirroring `describe('"choose"'` (`:289-309`, round 1's citation, unaffected by this round's findings); the existing `"add"` member's tests are extended to cover the new `timing` field, not replaced. |
| `src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts` | 457 | New M5-shaped canary for `timing: ctx.timing`, built with a STRUCTURAL SLICE (m4, AC-6/AC-7/AC-11 below), not a whole-file `toMatch`; the five-key `ta-` canary (`:106-112`) asserted UNCHANGED (still 5) per section 4.1; **also add the new reader for `walkthrough-announcement.ts` this test does not have today** (AC-7). **Re-run the anchor-collision check against A18's landed additions (2.1).** |
| `src/app/components/walkthrough-announcement/useAnnouncementDraftSlots.test.ts` | 93 | No change expected - tests only the pure decision functions (`cachedResearchFor`, `shouldReuseInFlightResearch`, `resolveRegenerateResearchOutcome`), none of which touch `timing`. Implementer confirms by re-reading the file before skipping it. |

**No file is added.** Everything above is an edit to an existing path.

---

## 6. Acceptance criteria

Each names the object under comparison, the instrument, and the direction of
failure, per `traps-spec.md`'s three-part rule. **AC-1 through AC-8, AC-11
through AC-15 are unchanged from round 1 except where a specific finding
below names a correction; AC numbers are unchanged - nothing was added or
removed at the top level, only AC-10 gained a fourth sub-clause (10d).**

**AC-1** through **AC-4** - unchanged from round 1, except AC-4's instrument
(m2, disposed above):

**AC-4 - `makeSlot`/`initialSlots`/the hook's `addSlot`/both panel `addSlot`
call sites/the `"add"` action member thread `timing` end to end (all five
hops, corrected from round 1's three).** Object: `announcement-draft-slots.ts:316-333,339-360,374-377`,
`useAnnouncementDraftSlots.ts:224-228`, `WalkthroughAnnouncementPanel.tsx:780-786,926`.
Instrument: source-text grep for `timing` as an argument at both panel call
sites AND at the hook's `addSlot` definition and its `dispatch({ type: "add",
... })` call, plus `npx tsc --noEmit` (a missing argument on a function whose
parameter is required is a compile error at every hop). Direction of failure:
RED if any of the five sites omits the argument/field - the corrected chain
closes the gap m2 found (round 1's instrument checked only the two panel
call sites and would have passed a version where the hook's own `addSlot`
silently dropped `timing` on the floor).

**AC-5** - unchanged from round 1 (its non-discrimination was checked sound
by the round-1 check and is not revisited here), with the `ctx` naming
hazard now stated in section 4.2 (m3) rather than left implicit.

**AC-6 - `draftOne` forwards `ctx.timing` into `WalkthroughAnnouncementDraftInput.timing`,
sliced structurally, not whole-file (m4, disposed above).** Object:
`WalkthroughAnnouncementPanel.tsx`'s `draftOne` callback (`:615-641`).
**Instrument, corrected**: anchor on the callback's own boundaries, not the
whole file - `panelSource.indexOf("const draftOne = useCallback(")` to the
matching `.slice(...)`'s next top-level `},\n    []\n  );` (mirroring how
`draftOne`'s own closing `[]` dependency array is unique to this callback,
confirmed by reading `:615-641` this round), then assert the SLICE, not
`panelSource`, matches `/timing:\s*ctx\.timing/`. Direction of failure: RED
if the field name appears elsewhere in the file (e.g. only in a type import,
or inside a sibling callback like `handleGenerateScript`) without appearing
inside this specific slice - the exact gap a whole-file `toMatch` (the shape
`walkthrough-announcement.structure.test.ts:276-282`'s existing M5 assertions
use today, confirmed this round) cannot close, since a doc comment anywhere
in the 979-line file containing the literal text would also satisfy an
unsliced check.

**AC-7 - `draftWalkthroughAnnouncementAction` forwards `input.timing` into
the composer call, and this needs a NEW reader this test does not have today
(m4, disposed above).** Object: `walkthrough-announcement.ts:396-412`.
**Corrected finding, stated plainly**: `walkthrough-announcement.structure.test.ts`
does not read `src/app/actions/walkthrough-announcement.ts` as source text
anywhere today - confirmed this round by reading the whole 457-line file: all
of its `readFileSync` calls target `RecordingTab.tsx`, `recording-launch.ts`,
or files inside the `walkthrough-announcement/` component directory (the
`WALKTHROUGH_ANNOUNCEMENT_DIR` constant at `:22`). Adding this AC requires
the implementer to add a NEW `readFileSync` call for
`src/app/actions/walkthrough-announcement.ts` inside this test file - this is
a new reader, not an existing one being reused, and is now stated in section
5's owns table rather than left implicit. Instrument, sliced (m4): anchor on
`draftWalkthroughAnnouncementAction`'s own function boundary (`export async
function draftWalkthroughAnnouncementAction(` to its matching closing brace,
found by bracket-depth or by the next top-level `export` after it - the
implementer's/test seat's own construction choice, not prescribed here down
to the algorithm) and assert the SLICE matches
`/timing:\s*input\.timing/`. Direction of failure: RED if `input.timing`
exists on the interface (AC-2's REQUIRED field) but is never read inside that
function's own slice.

**AC-8** - unchanged from round 1.

**AC-9 - `timing: "midweek"` measurably changes the composed prompt, and the
midweek-only substring is NAMED, not "something like" (m7/X2d, disposed
above).** Object: `buildWalkthroughAnnouncementPrompt(baseArgs({ timing:
"midweek" }))` vs. the beginning-of-week call. Instrument: `expect(midweek).not.toBe(beginningOfWeek)`,
plus `expect(midweek).toContain("MIDWEEK CHECK-IN")` - the literal ALL-CAPS
heading this document's own section 4.2 names for the new instruction block
(a structural label this scope fixes, matching the file's own convention of
naming every instruction block with a fixed heading - "EMOJI POLICY",
"COVERAGE ORDER (AC4)", etc. - not delegated wording the way the block's BODY
is per RES-1). Direction of failure: RED if the two outputs are identical
(the parameter is wired but never consulted) or if `"MIDWEEK CHECK-IN"` is
absent from the midweek output, present in the beginning-of-week output, or
renamed without this assertion being updated in the same commit.

**AC-10 (FIRST-CLASS - the false-progress-claim guard). Four independent
clauses, all required.**

- **10a** - unchanged from round 1: present iff `timing === "midweek"`,
  exhaustive over the closed two-member union.
- **10b - widened from two named prohibitions to presumptive-progress
  GENERALLY, with a NAMED keyword set (X2b/c, disposed above).** Object:
  the midweek arm's own returned string. Instrument, as an independent
  keyword-check table (A18's own AC-3 style - independent facts, sentence
  left open):

  | Fact | Representative check (test seat tunes exact regex) |
  |---|---|
  | Disclaims being given tracking data | matches a phrase naming the absence of submission/completion/gradebook data, e.g. `/\bno\b.{0,20}\b(submission|completion|gradebook)\b/i` |
  | Bans naming who is behind | `/\bwho(?:'s\| is) behind\b/i` |
  | Bans a submission-count claim | `/\bhow many (?:of you\|students)\b/i` |
  | **New: bans "by now" pacing framing** | `/\bby now\b/i` |
  | **New: bans "should be/have ... partway" framing** | `/\bshould\s+(?:be\|have)\b[^.]{0,40}\bpartway\b/i` |
  | **New: bans "at this point" framing** | `/\bat this point\b/i` |
  | **New: bans a presumed-majority claim** | `/\bmost of you\b/i` |

  Direction of failure: RED if the disclaiming-presence fact is absent (the
  guard silently missing), OR if any one of the six ban facts is matched
  (the block itself contains presumptive-progress language it is supposed to
  forbid - this is the exact gap X2 found: round 1's own section 7 sabotage
  table treated a "you should be partway through Module 4 by now"-shaped
  sentence as something that must SURVIVE, which the widened table now
  forbids).
- **10c - no parameter on `WalkthroughAnnouncementPromptArgs` or
  `WalkthroughAnnouncementDraftInput` can carry a submission count or
  completion fact - TWO HONEST LIMITS STATED, not a walled set (M1, disposed
  above).** Object: the two interfaces' own field lists (requires M1's
  `export` fix to reach the second one, section 5). Instrument: an
  exhaustive-key `keyof`-driven `Record<..., true>` test (AC-3's mechanism,
  reused) whose enumeration tsc refuses to compile if a field is added
  without updating it, checked against a denylist pattern
  (`/submi(t|ssion)|complet|progress|behind/i`). **Honest limit 1 (the
  ENUMERATION is sound, the VERDICT is not):** the `keyof`-driven enumeration
  cannot silently miss a field - construction, not a hand-list, per
  `traps-tests.md`'s coverage rule - but the denylist REGEX is a name-pattern
  match, and a field named `attendanceSummary`, `caughtUp`, `turnedIn`, or
  `classPace` (checked this round: none of the four contains "submit",
  "submission", "complet", "progress", or "behind") would defeat it while
  meaning exactly what the guard exists to ban. **Honest limit 2:** the
  enumeration is ONE LEVEL DEEP - a field added to the nested
  `AnnouncementOutline` type is invisible to it. This is stated here as a
  defense-in-depth check against an obviously-named field, not a walled set
  that closes the class the way the `SlotsAction` canary closes its own.
  Direction of failure: RED (compile error) if a field is added without
  updating the enumeration; RED (test failure) if an enumerated field's name
  matches the denylist. **Not claimed**: RED on a field whose name evades the
  pattern while carrying the banned meaning - recorded as a residual (RES-7,
  section 8), not silently passed over.
- **10d - NEW (X1b, disposed above) - the midweek clause states explicit
  precedence over the instructor's notes.** Object: the midweek arm's own
  returned string, placed (section 4.2) after the `INSTRUCTOR NOTES` block in
  `blocks`. Instrument: a frozen-substring assertion pinning the FACT (a
  clause that names "notes" and asserts precedence regardless of their
  content), e.g. `expect(midweek).toMatch(/\bnotes\b.{0,60}\b(even if|regardless)\b/i)`
  - fact and rough ordering pinned, exact wording left open (RES-1).
  Direction of failure: RED if the precedence clause is removed, or if it
  stops referencing the notes block at all (a generic "do not assume
  progress" sentence with no stated winner against notes specifically would
  satisfy 10b but not 10d - the two are independent).

**AC-11 - the per-slot timing control is reachable from the rendered row,
sliced structurally (m4, disposed above; unchanged reading-claim status).**
Object: `AnnouncementDraftSlot.tsx`'s JSX. Instrument: reading the diff
directly PLUS a source-text assertion anchored the way the file's own
`staleChoice` region is anchored - locate the new `<TextField select ...
onChange={...}>` block by its own unique `label="..."` text (the same anchor
technique `AnnouncementDraftSlot.tsx:84-100`'s existing "Format to match"
`TextField` would use for a parallel check) and assert the SLICE (not the
whole file) contains `onChooseTiming`. Direction of failure: verify FAILS if
the prop is destructured but never wired to an `onChange` inside that slice -
stated as a reading-claim limit (no component is rendered by any test here),
not asserted as machine-proven.

**AC-12 - `staleTiming` mirrors `staleChoice`, sabotaged with an operator
flip, not a non-discriminating guard deletion (M3, disposed above).** Object:
`AnnouncementDraftSlot.tsx`'s new `staleTiming` computation, alongside
`staleChoice` (`:77-78`). Instrument: source-text comparison of the two
expressions' shape. Direction of failure: RED if `staleTiming` omits the
`phase === "drafted" && slot.draft.phase === "drafted"` guard pair entirely
(a type error, since `.draft.draft` would be accessed outside any narrowed
branch) or omits the comparison. **The sabotage itself is corrected in
section 7** - round 1's proposed mutation (delete the FIRST conjunct only)
does not discriminate, because `phase` is a plain local `const` copied from
`slot.draft.phase` with no narrowing effect on `slot.draft` itself; the
SECOND conjunct (`slot.draft.phase === "drafted"`) does all the real
narrowing work on its own, so deleting only the first leaves tsc green with
identical runtime behaviour.

**AC-13**, **AC-14**, **AC-15** - unchanged from round 1; AC-13's re-measurement
step now explicitly targets the post-A18 baseline (section 2.1, section 4.4).

---

## 7. Sabotage per criterion

**All prescribed, not executed - unchanged front-matter caveat.** Only the
row the round-1 check found broken is reproduced in full below; every other
row is unchanged from round 1 (not re-pasted here to keep this section from
duplicating section 6's own restatement of each AC - the full table is
reconstructable by combining round 1's rows with the AC corrections in
section 6 above, and the implementer/test seat must build the ACTUAL table
from the FINAL AC text in section 6, not from round 1's superseded wording).

| AC | Mutation (expected RED) | Restore (expected GREEN) | Discriminates? |
|---|---|---|---|
| AC-12 (corrected, M3) | **Flip the comparison operator**: change `choiceId(slot.choice) !== builtFromId(slot.draft.draft.builtFrom)` to `===`. | Restore `!==`. | Yes - this flips `staleTiming`'s/`staleChoice`'s truth value on every case where the two ids differ, which is exactly the case the hint exists to surface; a suite that never constructs a slot with a mismatched choice/builtFrom pair would still miss this (a coverage gap for the test seat to close, not a sabotage-construction defect), but the mutation itself is behavior-changing, unlike round 1's proposed "delete the first `phase === "drafted"` conjunct," which tsc and runtime both accept unchanged because `phase` (a plain local copied at `:70`) narrows nothing and the second conjunct (`slot.draft.phase === "drafted"`, evaluated directly against `slot.draft`) does 100% of the real narrowing on its own. |
| AC-6, AC-7, AC-11 (instrument corrected, m4) | Delete the forwarding line inside the now-SLICED region (`timing: ctx.timing` / `timing: input.timing` / the `onChange` handler). | Restore it. | Yes, and more precisely than round 1's whole-file version: a doc comment elsewhere in the same file containing the literal matched text would falsely pass the OLD (unsliced) instrument; the corrected, sliced instrument does not have that failure mode, because the comment would sit outside the anchored region. |
| AC-9 (substring named, m7) | Rename or delete the `"MIDWEEK CHECK-IN"` heading while leaving the rest of the block's logic intact. | Restore the exact heading string. | Yes - a literal-string check on our OWN fixed heading (not the model-facing prose RES-1 owns) is mechanically certain. |
| AC-10b (widened, X2) | Insert a sentence matching one of the four NEW ban patterns (e.g. "you should be partway through Module 4 by now") into the midweek block, leaving the disclaiming sentence intact. | Remove the inserted sentence. | Yes for the four new patterns specifically; the test seat must verify all four independently, not assume one proves the others (traps-tests.md's construction-over-enumeration rule applies to the KEYWORD SET itself, not only to the interfaces in AC-10c). |
| AC-10d (new) | Delete the notes-precedence sentence from the midweek block, leaving the disclaiming and ban clauses intact. | Restore it. | Yes - a frozen-substring assertion on a fact-and-rough-ordering pin (traps-tests.md's rule), not the exact sentence. |

---

## 8. Residual register

Every entry names an owner, an instrument, and the step that measures it.

- **RES-1 (widened, X2a/B2 disposed above): exact copy AND the exact
  instructional prose of the midweek clause itself** - not only the UI labels
  round 1 scoped this to, but the actual prompt text inside `timingClause`
  (the three bracketed placeholders in section 4.2's pseudocode). This is now
  explicitly a named obligation on the **architect/UX seat**, not left to
  "whoever implements it": the FACTS are fixed by this scope (AC-9's heading,
  AC-10a/b/d's required facts), the WORDING is not. Owner: the Wave-3
  User-experience seat (jointly with the architect for anything touching
  prompt mechanics, e.g. exact placement wording), on the as-built diff.
  Instrument: the frozen-substring/keyword tests in AC-9/AC-10 pin only facts,
  per `traps-tests.md`. Step: the follow-up UX pass, before final review.
- **RES-2: the panel's post-diff line count.** Unchanged from round 1, with
  the target baseline corrected: measure against the POST-A18 line count if
  A18 has landed (section 2.1), not the 979 measured by either document
  independently. Owner: the implementer wave's own gate. Instrument:
  `wc -l` and `@(Get-Content ...).Count`, both, matching AC-13. Step: the
  wave gate.
- **RES-3 (rewritten, X3/B3 disposed above): sequencing and re-confirmation
  against A18's FINAL committed state.** `docs/a18-scope.md` exists
  (`914594d`) but was seen as `modified` (uncommitted) in `git status
  --short` at the time this document was written - a concurrent seat may
  still be revising it. Owner: whichever orchestrator turn dispatches the two
  implementer waves. Instrument: re-read `docs/a18-scope.md` and re-run the
  anchor-collision check (2.1) against its FINAL content immediately before
  dispatch; `git status --short` compared against each row's own `owns` list.
  Step: immediately before dispatch, per the sequencing table in 2.1 (A18,
  then A19, then A17).
- **RES-4: accessibility of the new per-slot control.** Unchanged from round
  1 - no component is rendered by any test here, so this is unverifiable by
  any instrument in this repo. Owner: the Wave-3 Accessibility seat.
  Instrument: reading the diff (a reading claim). Step: the follow-up
  accessibility pass.
- **RES-5 (rewritten, M4 disposed above): whether the owner wants a STICKY
  panel-wide default timing for new slots**, which would be a **named
  departure from this repo's standing "every new control persists under a
  `ta-` key" rule** (section 4.1 cites the in-feature and cross-doc
  precedent for that rule and the real analogy - `TemplateChoice`'s own
  non-persistence - for departing from it here). A real product preference
  either way is the owner's call. Owner: the repo owner. Instrument: a direct
  question, batched, not gating. Step: before or during the implementer wave
  - the default-to-`"beginning-of-week"`-per-new-slot behaviour ships either
  way in the meantime; **if the owner instead wants persistence, the
  mount-effect requirement (section 4.1) ships in the SAME commit that adds
  the `ta-` key**, not as a follow-up.
- **RES-6 (new, X1 disposed above): the output-side receipt upgrade path.**
  Whether to add a post-hoc check on the model's RETURNED announcement text
  for presumptive-progress language (which would earn GUARANTEED, unlike the
  prompt-level guard this chunk ships). Owner: repo owner (non-gating scope
  question, batched with RES-5's). Instrument, if approved: a receipt
  function mirroring `course-intel/ask/route.ts:864-871`'s
  `unexplainedStudentIndices` shape, or the permitted-URL enforcer already
  running on this feature's own model output inside
  `walkthrough-announcement.ts`. Step: a future chunk, not this one.
- **RES-7 (new, M1/10c disposed above): 10c's two honest limits are not
  closed by construction.** A field named to evade the denylist regex (e.g.
  `attendanceSummary`, `caughtUp`) or added inside the nested
  `AnnouncementOutline` type rather than at the top level would carry the
  banned meaning invisibly to this test. Owner: whoever next adds a field to
  `WalkthroughAnnouncementPromptArgs`, `WalkthroughAnnouncementDraftInput`, or
  `AnnouncementOutline` - a code-review convention, not a mechanized gate,
  since natural-language semantic detection of "does this field represent
  progress" is not buildable in this environment. Instrument: none automated;
  this residual IS the instrument (a reviewer checklist item). Step: every
  future PR touching those three types, indefinitely - recorded here rather
  than silently assumed closed by AC-10c.

---

## 9. What I could not determine

- **Whether the model, given the widened midweek instruction block, will
  actually comply with the no-progress-claim and no-presumptive-progress
  guards.** Unchanged limit: no API keys, every LLM path exercised only
  through mocks (`this-repo.md` section 6). AC-10's instruments all test the
  PROMPT TEXT, never a live completion. RES-6's output-side receipt (if
  approved) is the only mechanism that could ever check the model's actual
  behaviour, and even that only after the fact, on one run at a time.
- **Whether `docs/a18-scope.md`'s content, as read this round, is its FINAL
  form.** It appeared as `modified` (uncommitted) in `git status --short` at
  read time - RES-3 owns re-confirming this before dispatch.
- **The real post-diff line count of every touched file** (section 4.4,
  RES-2) - by construction, since none of this code has been written, and
  now additionally dependent on whether A18 has landed first.
- **Exact UI copy and the exact midweek instructional prose** (RES-1,
  widened this round) - deliberately left to the architect/UX seat, past the
  fact-level pins in AC-9/AC-10.
- **Whether A17's eventual scope will find a code-level conflict with the
  `staleTiming` addition**, beyond the line-number churn already flagged
  (section 2.1, RES-3) - A17 is unscoped as of this writing, so nothing
  beyond "re-measure before scoping" can be said now.
