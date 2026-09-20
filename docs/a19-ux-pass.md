# A19 UX pass: the as-built diff at `3d2f07f`

Follow-up UX pass over the shipped diff, per `docs/a19-scope.md`'s RES-1 (a
named obligation on the "Wave-3 User-experience seat... on the as-built
diff"). No prior version of this document exists
(`git log --oneline -- docs/a19-ux-pass.md`, 2026-09-20, empty output; the
working tree was clean before this pass, `git status --short`), so there is
no disposition table to carry forward - everything below is a first pass.

**Scope of this document.** The six questions the orchestrating turn posed,
each answered against the real diff, opened directly. I did not run
`npx tsc --noEmit` (this repo's rule: exactly one caller, the wave gate -
`docs/loop/this-repo.md` section 2). I wrote no code and no test file. I
touched no source file - `git status --short` before this pass showed
nothing; after writing this file it shows only `docs/a19-ux-pass.md`
(confirmed below, "Concurrency" section).

---

## What I opened, and how I confirmed it against the tree, not the scope doc

- `git show 3d2f07f --stat` - the eleven changed files, confirmed against
  `docs/a19-scope.md` section 5's `owns` table (same eleven paths).
- `git show 3d2f07f -- src/lib/walkthrough-announcement-prompt.ts` - full diff,
  read in full.
- `git show 3d2f07f -- src/app/components/walkthrough-announcement/AnnouncementDraftSlot.tsx` -
  full diff, read in full.
- `git show 3d2f07f -- src/app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx src/app/components/walkthrough-announcement/useAnnouncementDraftSlots.ts` -
  full diff, read in full.
- `git show 3d2f07f -- src/app/components/walkthrough-announcement/announcement-draft-slots.ts` -
  full diff, read in full.
- `Read src/app/components/walkthrough-announcement/AnnouncementDraftSlot.tsx`
  (post-diff, lines 1-200) - the real rendered JSX order, not the diff hunks
  in isolation.
- `Read src/lib/walkthrough-announcement-prompt.ts` lines 182-217 - the final
  `timingClause`/`timingLabel` text, quoted verbatim below.
- `grep -n "\.section\b\|\.fieldMd\b\|\.sectionLegend\b" src/app/components/recording/RecordingControls.module.css`,
  then `sed -n '1,100p'` on that file - the CSS actually governing the
  fieldset's layout direction.
- `grep -n "@media" src/app/components/recording/RecordingControls.module.css` -
  confirmed no responsive override of `.section`'s flex direction (one match,
  `prefers-reduced-motion`, unrelated).
- `grep -rn 'label="Timing"\|label="Schedule' src/app --include="*.tsx"` and
  `grep -rn 'label=.*[Tt]iming' src/app --include="*.tsx"` - label-collision
  sweep across the whole app, not just this feature's own files.
- `grep -rn "formality\|Formality" src/app/components/recording/*.tsx` and
  `grep -rln "AnnouncementCompositionControls" src/app --include="*.tsx"` -
  checked the sibling "Formality" slider's own reach.
- `grep -n "receiptLabel\|defaultOptionLabel" .../announcement-draft-slots.ts`
  then read `receiptLabel`'s body (`:229-233`) - the exact strings
  `timingLabel`'s output sits beside.
- `grep -n "MIDWEEK CHECK-IN\|BEGINNING-OF-WEEK\|toMatch\|toContain\|timingClause\|partway\|even if\|regardless" src/lib/walkthrough-announcement-prompt.test.ts`,
  then read lines 1-60 and 405-495 of that file in full - what the existing
  suite actually pins, to check whether any wording change I propose would
  break a real assertion.
- `grep -n "timingLabel\|check-in tone\|Beginning-of-week tone\|Midweek check-in tone" src --include="*.ts" --include="*.tsx"` -
  confirmed no test pins `timingLabel`'s literal return strings.
- `grep -n "toBe(\`\|toEqual(\`\|expect(prompt).toBe\|expect(midweek).toBe\|expect(beginningOfWeek).toBe" src/lib/walkthrough-announcement-prompt.test.ts src/lib/p11-containment-e2e.test.ts` -
  confirmed neither file has a full-prompt byte-equality fixture (AC-8's
  "every fixture... in the same commit" clause is a live requirement in
  principle but has no fixture to trip today).
- `git show 3d2f07f -- src/app/components/walkthrough-announcement/announcement-draft-slots.ts` -
  the `DraftSlot.timing`/`Drafted.timing` fields, the `"choose-timing"`
  reducer case, and the `DEFAULT_TIMING` constant.

Every quotation below is copied from one of these reads, not recalled.

---

## Q1 - Do the two blocks actually produce two tones?

**Quoted in full**, `src/lib/walkthrough-announcement-prompt.ts:193-206`:

```
export function timingClause(timing: AnnouncementTiming): string {
  if (timing === "midweek") {
    return [
      "MIDWEEK CHECK-IN",
      "- This is a midweek check-in, not a status report - frame it around what is coming up and what is still due this week, not a recap of what has already happened.",
      "- No submission, completion, or gradebook data was given to you for this announcement. Do not claim to know which students have or have not turned something in, name anyone as behind or caught up, or state a count or fraction of the class - even a rough one. A general, forward-looking expectation for the class as a whole (for example, that students should be partway through the week's work by now) is fine; a claim about what any individual or group has actually done is not.",
      "- This holds even if the instructor notes above mention a number, a name, or a completion status: that information is for your own planning context, not verified tracking data you are allowed to cite or confirm in this announcement.",
    ].join("\n");
  }
  return [
    "BEGINNING-OF-WEEK FRAMING",
    "- Frame this announcement around what is ahead this week - a forward-looking cadence, not a status check or a progress claim in either direction.",
  ].join("\n");
}
```

**Verdict: SOUND AS BUILT - the asymmetry is real, but it is not neglect.**
This is a reading claim (no API key, no rendered model output - see
`docs/a19-scope.md` RES-6/section 9, restated in the residual register
below).

The beginning-of-week arm is one bullet, but that bullet carries two
independent instructions joined by a dash: a positive steer ("frame this
announcement around what is ahead this week") and a negative one ("not a
status check or a progress claim in either direction"). I checked whether
the DEFAULT composer already supplies this steer without `timingClause`
(i.e., whether the one bullet is vestigial): the surrounding blocks
(`FORMAT VERSUS VOICE` at `:none named here directly, opened via context around
walkthrough-announcement-prompt.ts:326-340`, and the outline/coverage/floor
rules `docs/a19-scope.md` cites at `:282-287`, `:294-300`, `:308-317`)
govern structure, voice, and coverage honesty - none of them mention
temporal framing (what part of the week to write toward) at all. So the
one-bullet arm is doing real, non-redundant work, not restating something
the model would produce anyway. The three-bullet/one-bullet split is
justified by an asymmetry in REQUIREMENTS, not by one arm being rushed: the
midweek arm needs a guard (nothing prevented a false progress claim before
this chunk) and a precedence rule against the `notes` channel
(`docs/a19-scope.md` section 1); the beginning-of-week arm needs neither,
because at the start of a week there is no completed work to falsely claim
knowledge of in either direction.

**Closing this - do not re-litigate**: the asymmetry is intentional and
defensible on the facts above, not a cosmetic difference that would let the
beginning-of-week arm "read like the default with a label."

---

## Q2 - Is the midweek block mostly prohibition?

**Clause count, by hand, against the quoted text above** (a reading count,
not a mechanized one - there is no instrument in this repo that parses
English clauses):

| Bullet | Positive (tone-shaping) content | Negative (prohibition/disclaimer) content |
|---|---|---|
| 1 | "frame it around what is coming up and what is still due this week" | "not a status report" / "not a recap of what has already happened" |
| 2 | "A general, forward-looking expectation for the class as a whole... is fine" (with the owner's own example embedded) | "No submission, completion, or gradebook data was given..." / "Do not claim to know..., name anyone..., or state a count..." (three explicit bans) / "...is not" (closing the permission sentence with its own negative mirror) |
| 3 | none | the entire bullet - a precedence override extending the ban to cover the `notes` channel |

**Verdict: yes, the block is mostly prohibition by clause count** - roughly
2 positive fragments against 6-7 negative/restrictive ones across the three
bullets. This matches the premise in the brief.

**What to add, not only what to cut**, per the brief's own instruction:

1. **The owner's example is only half-instructed.** The owner's own words
   (as given in this pass's brief) name a two-part checking-in tone: *"you
   should be partway through, here is the common sticking point."* The
   shipped block instructs the first half verbatim-close (bullet 2's
   parenthetical: "that students should be partway through the week's work
   by now") but contains **no instruction anywhere** about the second half.
   Confirmed by
   `grep -n -i "sticking\|difficult\|struggle\|common area\|tricky\|confus" src/lib/walkthrough-announcement-prompt.ts`
   - zero matches in the whole file. This is not a hedging problem (Q3's
   concern); it is a coverage gap - nothing in the prompt invites the model
   to surface a likely point of difficulty at all, so a compliant model has
   no reason to write that half of the owner's own example.

   **This is flagged as a finding for the owner/architect, not folded into
   a wording edit under my own authority.** `docs/a19-scope.md` section 4.2's
   pseudocode fixes exactly three fought-for facts for the midweek arm
   (`<fact 1>`, `<fact 2>` = AC-10a/b, `<fact 3>` = AC-10d) and RES-1 states
   plainly: "the FACTS are fixed by this scope; their phrasing is not." A
   fourth fact (surfacing a likely sticking point) is outside what this
   scope authorized me to word - adding it would be a scope amendment, not
   a UX wording pass, and per this brief's own constraint it would need
   reconciliation with the concurrently-running `loop-test-author` seat
   before any instrument for it exists. I record this as a new residual
   below (RES-UX-1) rather than editing the block.

   A candidate instruction, offered for that future scope decision, not
   shipped here: *"If one part of the walkthrough is more involved or easier
   to miss than the rest - a step with several sub-parts, a setting people
   commonly get wrong - you may point it out as a heads-up, grounded only in
   what the walkthrough itself showed, never in a claim about what any
   student has actually done."* This is deliberately worded to stay
   evidentiary-safe (grounded in the captured content, not student behavior)
   so it would not reopen AC-10's guard - but it is a proposal for the next
   scope round to accept or reject, not a change I am making.

2. **A safe, in-scope addition: reinforce bullet 2's existing permission
   with a second example phrase**, using wording the guard's own control
   test already treats as safe. `walkthrough-announcement-prompt.test.ts:464`
   builds its AC-10b control input as *"You should be partway through this
   week's work by now, and the class overall is around the midpoint."* - both
   halves of that sentence are already proven not to trip the two ban
   regexes (`:465-466`). The shipped bullet only gives the model ONE example
   ("partway through... by now"); adding the second, already-tested phrase
   widens the model's positive latitude without touching a single ban
   clause or requiring a new fact.

   **CHANGE - concrete edit.**
   File: `src/lib/walkthrough-announcement-prompt.ts`, line 198.
   Current:
   ```
   "- No submission, completion, or gradebook data was given to you for this announcement. Do not claim to know which students have or have not turned something in, name anyone as behind or caught up, or state a count or fraction of the class - even a rough one. A general, forward-looking expectation for the class as a whole (for example, that students should be partway through the week's work by now) is fine; a claim about what any individual or group has actually done is not.",
   ```
   Replacement:
   ```
   "- No submission, completion, or gradebook data was given to you for this announcement. Do not claim to know which students have or have not turned something in, name anyone as behind or caught up, or state a count or fraction of the class - even a rough one. A general, forward-looking expectation for the class as a whole is fine - for example, that students should be partway through the week's work by now, or that the class overall is around the midpoint - but a claim about what any individual or group has actually done is not.",
   ```
   This only extends the existing permitted-example clause (still inside
   the scope's own `<fact 2>` boundary); it does not touch the disclaiming
   sentence or the three ban clauses. I re-checked
   `walkthrough-announcement-prompt.test.ts:451-467` against this wording:
   the disclaiming regex (`:452`), the two ban regexes (`:456`, `:460`), and
   the AC-10b control assertion (`:463-467`) all key off substrings this
   edit does not remove or alter, so none of the three existing `it()`
   blocks in that `describe` changes behavior. **No reconciliation needed
   with the concurrent test-author seat for this specific edit** - it adds
   no new fact and changes no fact's truth value, only widens an existing
   permitted example.

---

## Q3 - Does the permitted tone survive?

**Verdict: yes, on a plain reading, and it is verified by an existing test,
not only my own reading.** `walkthrough-announcement-prompt.test.ts:463-467`
already runs the AC-10b control: it appends *"You should be partway through
this week's work by now, and the class overall is around the midpoint."* to
the midweek output and asserts neither ban regex fires
(`.not.toMatch(/\bwho(?:'s| is) behind\b/i)`,
`.not.toMatch(/\bhow many (?:of you|students)\b/i)`). That is the mechanized
half of this question, and it passes today by construction (it is a static
string check on our own literal, not a live model call - stated plainly,
this is not evidence about what a model would actually write, only that the
guard TEXT does not itself contain a self-contradiction that would confuse a
compliant reader).

The reading half: bullet 2 states the permission in the same breath as the
bans, embedding the owner's own phrase ("students should be partway through
the week's work by now") inside a sentence that opens with "A general,
forward-looking expectation for the class as a whole... is fine." That is
an explicit, close-to-verbatim invitation, not a buried footnote - a model
instruction-following on this text has a clear, affirmatively-stated example
to write toward. The permission is structurally the SECOND half of a
semicolon-joined sentence (bans land first, then the permission, then a
one-clause restatement of the ban) - a plausible model could still weight
the sentence's net valence toward caution given the raw count of "do not" /
"not" tokens surrounding it (three ban clauses versus one permission
clause, per the Q2 table). I do not have a way to test this claim - no API
key, no rendered output (`this-repo.md` section 6) - so I record it as a
residual rather than a finding: it folds into `docs/a19-scope.md`'s existing
**RES-6**, since it is exactly the "what does the model actually do with
this text" question RES-6 already owns, restated for the whole guard rather
than only the output-side receipt.

**Closing this - do not re-litigate the TEXT-level question**: the
permission is present, is explicit, and is proven (by
`walkthrough-announcement-prompt.test.ts:463-467`) not to be defeated by the
ban regexes when the permitted phrasing is used. What is open is only
whether a live model, given both the permission and the surrounding bans,
actually reaches for it - and that is RES-6's question, not a new one.

---

## Q4 - The control itself

**Premise correction, from the tree, not the brief.** The brief frames the
two controls as sitting "side by side." That does not match the code. The
fieldset both controls live in uses `fieldset.section`
(`AnnouncementDraftSlot.tsx:96`, `className={controls.section}`), and
`RecordingControls.module.css:24-32` defines it:

```
.section {
  border: 0;
  margin: 0;
  padding: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
```

`flex-direction: column`, no wrapping row `<div>` around the two
`TextField`s (`AnnouncementDraftSlot.tsx:99-123`, confirmed by reading the
file directly - both are direct children of the fieldset), and no `@media`
rule anywhere in that stylesheet overrides `.section`'s direction
(`grep -n "@media" .../RecordingControls.module.css` returns one match, an
unrelated `prefers-reduced-motion` block at `:264`). So **the two controls
stack vertically, "Format to match" directly above "Timing," not beside each
other** - this is a reading claim (no component is rendered by any test
here), but it is a reading of an explicit, unconditional CSS declaration and
the DOM order in the JSX, not a guess about rendering. This correction
matters because it changes the answer to the brief's own question: a
vertical stack with two full-width, independently labeled fields is, if
anything, LESS likely to read as one setting than a side-by-side layout
would have been - there is no shared visual row to imply a joint control.

**Label wording - "Timing."** I checked this against two collision risks
before accepting it:

1. **Against the app's own scheduling vocabulary.** `grep -rn 'label="Timing"\|label="Schedule' src/app --include="*.tsx"`
   turns up `SchedulerModal.tsx:127` (`label="Schedule due dates"`) and two
   `WeeklyChecklistCell.tsx` "Schedule" labels - both in the Content/Modules
   surface, not this panel, and both about WHEN something is released, not
   what it says. `grep -rn 'label=.*[Tt]iming' src/app --include="*.tsx"`
   returns exactly one hit, this control itself - no other "Timing" label
   exists anywhere in `src/app`. Low real collision risk: different tab,
   different mental model, and no repeated label text.
2. **Against the sibling "Formality" concept**, which is the more dangerous
   collision. `AnnouncementCompositionControls.tsx:118` renders a slider
   literally labeled `Formality`, and `grep -rln "AnnouncementCompositionControls" src/app --include="*.tsx"`
   shows it is used only by `TakeAnnouncementPanel.tsx` - a **sibling**
   announcement-drafting flow in this same app family. Had the implementer
   named this control "Tone" (the owner's own word, "two tones over the
   same captured pages"), an instructor who has used both announcement
   flows would have two different controls named "Tone" governing two
   unrelated things (voice/register in one flow, week-framing in this one).
   "Timing" avoids that collision.

**Verdict: SOUND AS BUILT, close this.** "Timing" is not the owner's own
word for the concept, but the obvious alternative ("Tone") collides with an
existing sibling control in a way "Timing" does not, and the checked
in-app-scheduling collision is weak (different surface, no repeated string).
I am not recommending a rename.

**Option wording.** "Beginning of week" / "Midweek check-in"
(`AnnouncementDraftSlot.tsx:32-33`) match the prompt's own structural
headings ("BEGINNING-OF-WEEK FRAMING", "MIDWEEK CHECK-IN") in substance,
title-cased for UI display versus all-caps for the internal instruction
block - consistent with this file's own established convention of
all-caps-for-structural-headings for the model, sentence/title-case for the
instructor. **Confirmed sound, close this.**

**Placement relative to "Format to match."** Second field in the fieldset,
immediately after the format select (`AnnouncementDraftSlot.tsx:99-123`
then `:114-127`), same `className={controls.fieldMd}` sizing. Logical
adjacency (both are "how should this draft be built" decisions, made before
generating), consistent sizing. **Confirmed sound, close this.**

**The `staleTiming` hint.** `AnnouncementDraftSlot.tsx:89-90`:
```
const staleTiming =
  phase === "drafted" && slot.draft.phase === "drafted" ? slot.timing !== slot.draft.draft.timing : false;
```
mirrors `staleChoice` at `:86-87` exactly in shape (same double-phase guard,
same equality-of-a-frozen-value-vs-live-value comparison). Its hint text,
`:178-181`: *"This draft was made with a different timing - Regenerate to
apply your new choice."* against `staleChoice`'s own hint at `:175-177`:
*"This draft was made from a different format - Regenerate to apply your
new choice."* Different preposition ("with" vs "from") because the two
nouns are different kinds of thing (format is a source to draft FROM;
timing is a property the draft was made WITH) - not an inconsistency, a
correct one. **Confirmed sound, close this.**

**Verdict on Q4 overall: the control is legible.** Two independently
labeled, vertically stacked, distinctly worded fields, with a stale-state
hint that mirrors the existing one exactly. The one thing worth restating
plainly is the premise correction above - this is a stack, not a row.

---

## Q5 - The receipt

`AnnouncementDraftSlot.tsx:136-137`, rendered in order:
```
<p className={styles.fieldHint}>{receiptLabel(slot.draft.draft.builtFrom)}</p>
<p className={styles.fieldHint}>{timingLabel(slot.draft.draft.timing)}</p>
```

`receiptLabel` (`announcement-draft-slots.ts:229-233`) returns one of:
`Drafted from "X"` / `Drafted from the pasted announcement` / `Drafted
without a format to match` - all full clauses, verb-led.

`timingLabel` (`walkthrough-announcement-prompt.ts:214-216`) returns one of:
`Midweek check-in tone` / `Beginning-of-week tone` - noun phrases, not
clauses.

**Do these two lines read coherently?** Individually each is clear; paired,
the register shifts mid-stack from a sentence ("Drafted from the pasted
announcement") to a label fragment ("Beginning-of-week tone"). The code
comment at `walkthrough-announcement-prompt.ts:209-212` explicitly documents
that the two are deliberately never merged into one sentence ("these are two
independent facts about a draft") - that architectural decision is sound
and I am not proposing to merge them (merging would also risk colliding
with whatever instrument the test seat builds around either string, which
is exactly the kind of change this brief asks me to flag rather than make
silently). Within that constraint, a small copy change closes the register
mismatch without merging the two `<p>` elements.

**CHANGE - concrete edit.**
File: `src/lib/walkthrough-announcement-prompt.ts`, line 214-216.
Current:
```
export function timingLabel(timing: AnnouncementTiming): string {
  return timing === "midweek" ? "Midweek check-in tone" : "Beginning-of-week tone";
}
```
Replacement:
```
export function timingLabel(timing: AnnouncementTiming): string {
  return timing === "midweek" ? "Written in midweek check-in tone" : "Written in beginning-of-week tone";
}
```
This keeps both branches as fragments continuing naturally from the
sentence above them ("Drafted from the pasted announcement" / "Written in
midweek check-in tone" read as two related facts in the same voice), without
merging the two `<p>` elements and without touching `receiptLabel`.
Confirmed safe: `grep -n "timingLabel\|check-in tone\|Beginning-of-week tone\|Midweek check-in tone" src --include="*.ts" --include="*.tsx"`
shows the only two call sites are the re-export at
`announcement-draft-slots.ts:13-14` and the render call itself
(`AnnouncementDraftSlot.tsx:137`) - no test asserts either literal string,
so this is a pure copy change with no reconciliation needed.

**Verdict: does the pair tell the instructor what they need after the
fact?** Yes - format and tone are exactly the two facts an instructor would
want to recheck before deciding whether to Regenerate, and both are now
covered (previously only format was). The register mismatch above is minor
and optional to fix; nothing about it makes the pair unclear.

---

## Q6 - Copy quality against the UI standard

**No emojis anywhere in either the DOM-rendered strings or the model-facing
prompt text** - checked by reading every new string quoted in this document
directly; none contains one.

**DOM-rendered strings (the ones the UI standard - professional, modern,
minimal, reuse the app's visual language - applies to most directly):**

| String | Where | Earns its place? |
|---|---|---|
| `"Timing"` | `AnnouncementDraftSlot.tsx:117`, select label | Yes - see Q4. |
| `"Beginning of week"` | `AnnouncementDraftSlot.tsx:32`, option label | Yes - matches the prompt's own heading in substance, correctly cased for UI. |
| `"Midweek check-in"` | `AnnouncementDraftSlot.tsx:33`, option label | Yes - same. |
| `"This draft was made with a different timing - Regenerate to apply your new choice."` | `AnnouncementDraftSlot.tsx:178-180` | Yes - mirrors the existing `staleChoice` hint's voice exactly (see Q4); no developer voice, reads as an instruction to the instructor, not a system message. |
| `"Beginning-of-week tone"` / `"Midweek check-in tone"` | `timingLabel`, rendered `AnnouncementDraftSlot.tsx:137` | Mostly - see Q5's minor register-mismatch note and the proposed `"Written in..."` edit. Not a defect that blocks close. |

None of the five reads as developer voice (no internal field names, no
"kind", no code-shaped tokens leaking into the UI - `slot.timing`,
`AnnouncementTiming`, `DEFAULT_TIMING` all stay in source, never rendered).

**Model-facing strings (the `timingClause` bullets and headings) are a
different category** - they are never rendered to any user, they are
composed into a hidden prompt sent to the model. The "no emojis" rule is
satisfied trivially (none present) and the file's own internal convention
(all-caps structural headings, dash-led instruction bullets, matching
`FORMAT VERSUS VOICE`, `THE ANNOUNCEMENT FLOOR`, etc. elsewhere in the same
file) is followed consistently by both new headings and bullets. I am not
holding this category to the "professional, modern, minimal" UI standard
since no instructor ever sees it - flagging the distinction so a future
reader does not conflate "no emojis in the codebase" (AGENTS.md, satisfied)
with "polished for an end user" (not the right bar for internal prompt
engineering text).

**Verdict: sound as built, with one optional polish (Q5's `timingLabel`
edit) and one content gap flagged as a residual, not a copy defect (Q2's
"sticking point" finding).**

---

## Disposition table

Not applicable - this is the first version of this document (confirmed
above). No prior findings to carry forward.

---

## Residual register

Every entry names an owner, an instrument, and the step that measures it.
RES-UX-2 folds into `docs/a19-scope.md`'s existing **RES-6** rather than
duplicating a new entry for the same open question, per this brief's own
instruction.

- **RES-UX-1 (new): the owner's "here is the common sticking point" half of
  the requested midweek tone is uninstructed.** `docs/a19-scope.md` section
  4.2 fixes exactly three fought-for facts for the midweek arm; a fourth
  fact (surfacing a likely point of difficulty, drawn only from the
  captured walkthrough content, never from student behavior) was never in
  scope and is absent from the shipped block, confirmed by
  `grep -n -i "sticking\|difficult\|struggle\|common area\|tricky\|confus" src/lib/walkthrough-announcement-prompt.ts`
  (zero matches). Owner: the repo owner / whoever next revises
  `docs/a19-scope.md` or opens a follow-up backlog item for this feature -
  this is a scope decision (does the owner want this covered at all, and if
  so is it always safe to infer from the walkthrough content alone), not
  mine to fold into a wording edit. Instrument: none exists yet - if
  accepted, a new AC and a new keyword/fact-check table, built by the test
  seat, reconciled against AC-10b's existing evidentiary/normative split so
  the new instruction does not reopen the guard's ban clauses. Step: the
  next scope revision that touches `timingClause`'s midweek arm.
- **RES-UX-2 (folds into `docs/a19-scope.md`'s RES-6): whether a live model,
  given the shipped midweek block, actually writes the owner's permitted
  tone rather than reading the volume of prohibition language as a signal
  to hedge.** Unverifiable here - no API key, no rendered output, every LLM
  path exercised only through mocks (`docs/loop/this-repo.md` section 6).
  The static-text half of this question is already proven
  (`walkthrough-announcement-prompt.test.ts:463-467`, Q3 above); the live
  half is exactly what RES-6's output-side receipt (`docs/a19-scope.md`
  section 8) would check, if the owner approves building it. Owner: repo
  owner (same non-gating scope question RES-6 already records). Instrument:
  RES-6's own, if approved. Step: RES-6's own step - a future chunk, not
  this one.

## What I could not determine

- Whether a live model actually complies with either arm's instructions -
  no API key in this checkout, every LLM path here is exercised only
  through mocks. Recorded as RES-UX-2 above, folded into `docs/a19-scope.md`
  RES-6 rather than duplicated.
- Actual rendered appearance, focus order, or keyboard behavior of the new
  `TextField`. Vitest here is `environment: "node"` and collects only
  `src/**/*.test.ts` (`docs/loop/this-repo.md` section 2) - no component is
  rendered by any test in this repo. Every layout and legibility claim in
  Q4 is a reading claim over the CSS declaration and the JSX source, stated
  as such, not a verified rendering.
- Whether the two `CHANGE` edits above (Q2's second example phrase, Q5's
  `timingLabel` wording) are the wording the owner would actually choose -
  I checked both against the existing test suite for safety (neither breaks
  an existing assertion), not against the owner's own voice preference.

---

## Concurrency

`git status --short` before this pass: clean (matches the conversation's
starting snapshot). This document touches only `docs/a19-ux-pass.md`; no
source file under `src/` was opened for writing, only for reading via `Read`
and `git show`. Verified again immediately before commit.
