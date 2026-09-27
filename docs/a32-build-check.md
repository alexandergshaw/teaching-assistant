# A32 wave 1 as built: adversarial build check of commit 1878a48

Fresh checker. I did not build this. Default is defective. Every quantity below
names the command that produced it. Read against `docs/a24-a32-waves.md`
section 6, `docs/a32-scope.md` revision 2, `docs/owner-decisions-2026-09-23.md`
DECISION 5, and `docs/a24-a39-sequencing.md` RULING 35.

**Verdict: DEFECTIVE. 3 blockers, 8 majors, 7 minors.** The correctness core is
half-built and wholly unguarded on the half that matters, and the wave shipped a
success line that states the opposite of what happened on the path it was built
to add.

---

## 0. Method, and the one thing I deliberately did not do

The brief asked for sabotage with `cp` restore. I did **not** mutate anything
under `src/`. Two reasons, both binding: my write set is exactly this file, and
`docs/loop/this-repo.md` section 2 rules that **no two agents may
sabotage-verify on the tree at once** - several waves are live in this checkout
right now, and a red structure test on a file they do not own is a false RCA I
would be handing them.

What I did instead is equivalent for this class of instrument and is stated so
the next reader can audit it:

1. **Proof the instruments execute and pass on the real tree.** Command:

   ```
   npm run test:paths -- src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts src/app/components/walkthrough-announcement/scheduled-visibility.test.ts src/app/components/walkthrough-announcement/announcement-draft-slots.test.ts src/app/components/walkthrough-announcement/useAnnouncementDraftSlots.test.ts src/app/actions/walkthrough-announcement.test.ts
   ```

   Result: `Test Files 5 passed (5)`, `Tests 221 passed (221)`, `COVERED` on all
   five arguments (85 / 9 / 87 / 12 / 28), `EXITCODE=0` read from
   `$LASTEXITCODE`, not from a pipe.

2. **Proof the instruments can FAIL, by replica.** The two new describe blocks
   are pure functions of the source TEXT (`fs.readFileSync` plus
   `String.indexOf` plus `toMatch`). I transcribed them assertion-for-assertion
   into a scratchpad script and evaluated them over mutated copies of the real
   file, with JS `String.prototype.slice` negative-start semantics reproduced
   exactly. The unmutated baseline evaluates GREEN, which agrees with the real
   vitest run above. Eight mutations follow; their results are in section 3.

   **Residual, owner or next-wave:** re-run those eight against the real file
   with a `cp` backup when the tree is quiet. The replica cannot be wrong about
   the predicate, but only a real run proves the vitest wiring too.

3. **Nothing renders under vitest and the network is blocked** (`this-repo.md`
   sections 2 and 6). Every claim below about what an instructor or a screen
   reader would experience is a READING claim from source. The three that need a
   browser are labelled and named as owner checks in section 8.

---

## 1. BLOCKERS

### BLOCKER 1 - the success copy states the opposite of what happened on the scheduled path

`src/app/components/walkthrough-announcement/AnnouncementDraftSlot.tsx:342-346`:

    {slot.postedTo && (
      <p role="status" aria-live="polite" className={styles.fieldHint}>
        Posted to {slot.postedTo}. Students can see it now.
      </p>
    )}

**Unconditional.** There is no scheduled variant. The scheduled path reaches it:
`commitPost` forwards the ISO string, the action returns `{id}`, `postDraft`
maps it to `{course}` (`WalkthroughAnnouncementPanel.tsx:655`), and the reducer
sets `postedTo` at `announcement-draft-slots.ts:517`. So after a successful
SCHEDULED post the instructor is told, in a live region a screen reader
announces, that **students can see it now** - when the whole point of the pick
is that they cannot.

This is not an oversight the wave could not have known about. `docs/a32-scope.md`
lines 270-273 name this exact sentence family as the thing that **partly
redeems** the sibling's split predicate:

> On the sibling this is cosmetic and is partly redeemed afterwards by the
> success copy at `:280-282`, which branches on `scheduledLabel` and is
> therefore honest.

Measured, the sibling does branch - `announcements-panel.tsx:280-283`:

    text: scheduledLabel
      ? `Announcement scheduled. Students will see it ${scheduledLabel}.`
      : "Announcement posted to Canvas.",

The wave copied the sibling's LABEL and HINT strings verbatim (RULING 35, and
that half is correct) and did not copy the one piece of the sibling's copy its
own scope singled out as honest. RULING 35 enumerated five label strings plus
the consequence paragraph; this sixth string is in neither enumeration, and it
falls outside both new anchored slices, so no instrument sees it.

Against the copy rule the brief states - a sentence may assert only what holds
on every caller and every reachable state - this is a direct violation on a
reachable state that the wave itself created.

**Defect class: copy asserts what does not hold on a reachable state the wave
added. NEW.**

### BLOCKER 2 - "one predicate" is one FUNCTION evaluated TWICE, from two clocks, so the copy and the decision can still disagree

Two production call sites, each sourcing `now` independently
(`grep -rn "resolveScheduledVisibility" src | grep -v scheduled-visibility`,
canary `resolveScheduledVisibilityXYZNOPE` exits 1):

- `AnnouncementDraftSlot.tsx:114` - `resolveScheduledVisibility(slot.scheduledAt, currentTimeMs())`, at RENDER. Drives the consequence paragraph, all five labels and the `disabled` guard.
- `useAnnouncementDraftSlots.ts:349` - `resolveScheduledVisibility(slot.scheduledAt, Date.now())`, at CONFIRM. Drives the post.

REQ-A32-1 as written in the scope (line 297) is: "The resolution happens once,
in a pure exported function." It happens twice. The hook's own comment at
`:341-348` asserts "the SAME resolution AnnouncementDraftSlot.tsx reads for its
consequence copy and all five ConfirmArmButtons labels". That is false: same
function, different resolution, different `now`.

**Re-created the disagreement the deleted scratch table showed, and then showed
the shipped wiring still exhibits it.** I copied the shipped
`scheduled-visibility.ts` byte-for-byte into the scratchpad and drove it with
`node --experimental-strip-types`:

    === TABLE 1: the OLD split shape, one clock ===
    raw="not-a-date"         copy=true  decision=false DISAGREE
    raw="2020-01-01T09:00"   copy=true  decision=false DISAGREE

    === TABLE 2: the SHIPPED predicate, ONE injected now ===
    raw="2020-01-01T09:00"   kind=immediate  copy=false decision=false agree
    (all six rows agree)

    === TABLE 3: the SHIPPED WIRING - the same function, TWO clocks ===
    gap(render->confirm)=    0s  copy=scheduled  decision=scheduled  agree
    gap(render->confirm)=   10s  copy=scheduled  decision=scheduled  agree
    gap(render->confirm)=   31s  copy=scheduled  decision=immediate  DISAGREE
    gap(render->confirm)=  120s  copy=scheduled  decision=immediate  DISAGREE

Table 2 is the assertion the wave rests on and it HOLDS: the leaf does not
exhibit the old split-shape disagreement at a fixed `now`. Table 3 is the
finding. The dangerous sequence is fully reachable and needs no mistyped date:

1. The `min` attribute is `toDatetimeLocalValue(new Date())`
   (`AnnouncementDraftSlot.tsx:163`), so the earliest value the native widget
   offers is the current minute. An instructor picking "as soon as possible"
   lands inside the window by construction.
2. Arming re-renders, so the consequence paragraph the instructor READS is
   resolved at arm time and says "Confirming schedules this announcement to
   become visible ... at <label>".
3. Arm-then-confirm exists precisely so the instructor stops and reads that
   paragraph. Nothing re-renders on a clock tick - there is no interval, no
   effect, no subscription - so the paragraph and all five labels keep saying
   "scheduled" however long they sit there.
4. The confirm click resolves again against a later clock. Past now, so
   `immediate`: published to every student at once, irrevocably, under a
   sentence that promised a schedule.

That is the identical harm REQ-A32-1 exists to prevent, moved from the value
dimension into the time dimension. `iteration-caps.md`'s standard - what ends a
defect chain is a construction that makes the bad state unrepresentable - is not
met: the bad state is still representable, and the commit message, the code
comments at `useAnnouncementDraftSlots.ts:341-348` and
`scheduled-visibility.ts:5-9`, and the `docs/BACKLOG.md` A32 row all state a
guarantee the code does not have.

The shape of a fix is a design decision, not a transcription (resolve once at
arm and carry the result into `commitPost`, or re-resolve on a tick, or refuse
to post immediately when the armed value has gone stale and say so), which is
why this goes to the owner in section 9.

**Defect class: a construction claim asserted but not implemented - the
requirement's own failure mode survives in a second dimension. NEW.**

### BLOCKER 3 - the DECISION half of REQ-A32-1 has no instrument of any kind

Measured, with a working positive canary rather than a bare absence:

    grep -rn 'useAnnouncementDraftSlots.ts"' src --include=*.test.ts   -> exit 1 (nothing)
    grep -rn 'AnnouncementDraftSlot.tsx"'    src --include=*.test.ts   -> exit 0, 7 hits

Same command form, same file glob; the second proves the command fires and the
pattern shape is valid. So **no test in this repo reads
`useAnnouncementDraftSlots.ts` as source text**, and the two new anchored-slice
describes both read only `AnnouncementDraftSlot.tsx`
(`walkthrough-announcement.structure.test.ts:785`, `:773`).

Nor is `commitPost` exercised behaviourally.
`useAnnouncementDraftSlots.test.ts` is 93 lines (`wc -l`) and its 12 tests cover
three pure helpers only - `cachedResearchFor`, `shouldReuseInFlightResearch`,
`resolveRegenerateResearchOutcome`. `grep -n "postDraft\|scheduledAt\|commitPost\|resolveScheduled"` on it returns **nothing**.

And `useAnnouncementDraftSlots.test.ts` **is in A32-3's declared write set**
(`docs/a24-a32-waves.md` section 6.4, "the reducer and hook cases"). The commit
does not touch it (`git show --stat 1878a48` lists 10 files; that is not one of
them). A write-set item was dropped silently.

Consequence, stated as the silent-green failure the brief asks for: change
`useAnnouncementDraftSlots.ts:349-356` to

    const promise = argsRef.current.postDraft(title, message, slot.scheduledAt || undefined);

and lint, tsc, `next build`, the whole vitest suite and every structure test stay
green. That is the sibling's split shape reintroduced on the decision side, with
the copy still reading the resolved value - the original blocker, verbatim. The
`docs/BACKLOG.md` A32 row warns "Anyone re-splitting that predicate is
reintroducing it", and nothing enforces it.

**Defect class: silent-green - the half of a two-sided contract that has no
instrument. NEW.**

---

## 2. The past-date behaviour end to end (brief item 5)

At a fixed `now` the shipped predicate is correct and the surface is consistent:
a past-dated value resolves `immediate`, so the paragraph says "Posting
publishes this announcement to every student in <course> immediately", the
visible labels read "Post to Canvas" / "Confirm post" / "Posting...", both
accessible names read the post wording, and the post is immediate. Nothing lies.
Table 2 above is the proof for the predicate and
`scheduled-visibility.test.ts:34-38` is the permanent regression test for the row
("a past time resolves to immediate, not invalid and not scheduled").

What the interface does NOT do is say that the date was disregarded. The field
keeps displaying the past value, the hint keeps saying "Pick a future date and
time to schedule when students can see it", and no sentence connects the two.
The scope's own reason for Branch A (section 6, reason 1) is that a restored
stale timestamp means "the control still silently discards what the instructor
thought they had set" - and that silent discard exists in the shipped build
without persistence, for any past value typed or pasted or gone stale in an open
tab. **The reason for not persisting therefore still holds, and holds more
strongly than the scope realised.** Graded MINOR 2 rather than a blocker only
because no sentence asserts something false here; the omission is an
explanation, not a lie.

---

## 3. The instruments: what can fail, and what cannot

Eight mutations, evaluated against the transcribed replica of the two new
describe blocks plus the re-pointed A19 AC-11 block. "Wanted" is the direction
`docs/a24-a32-waves.md` section 6.4.4 mandates.

| # | Mutation | Verdict | Wanted | |
|---|---|---|---|---|
| baseline | unmutated real source | GREEN | GREEN | ok |
| M1 | consequence paragraph driven by `slot.scheduledAt.trim()` truthiness, inner `visibility.kind` narrowing left in place | **GREEN** | RED | HOLE |
| M1b | M1 plus the inner narrowing removed | RED | RED | ok |
| M2 | `idleAriaLabel` hard-coded to the post wording | RED | RED | ok |
| M3 | `idleAriaLabel` reads `isScheduled` but BOTH branches say "Post draft N to Canvas" | **GREEN** | RED | HOLE |
| M4 | `resolveScheduledVisibility(...)` replaced by a hand-rolled truthiness object, identifier names kept | **GREEN** | RED | HOLE |
| M5 | the new datetime-local control deleted entirely | RED | RED | ok |
| M6 | control kept, `onChange` forwards a constant `""` so the field can never be set | **GREEN** | RED | HOLE |
| M7 | "Written for" renamed to "Timing window" | RED | RED | ok (incidentally) |
| M8 | a THIRD control labelled "Timing preset" added earlier, "Written for" intact | **GREEN** | RED | HOLE |

Each HOLE is a MAJOR below. Credit where it is due: M2 and M5 are real. An
accessible name replaced by a fixed string DOES fail, so the brief's question
"is anything guarding the accessible names" answers yes - the plumbing is
guarded. And deleting the control outright fails on
`toContain('label="Visible to students (optional)"')`.

### MAJOR 1 - the Half-B mandated failure direction does not hold (M1)

`walkthrough-announcement.structure.test.ts:803-811`:

    expect(slice).toMatch(/isScheduled|visibility\.kind/);
    expect(slice).not.toMatch(/scheduledAt\.(trim\(\)\.)?length/);

The shipped slice contains `visibility.kind === "scheduled" ? visibility.label : ""`
as an inner TypeScript re-narrowing. So the alternation is satisfied by that
inner expression no matter what drives the branch. Replace the condition
`{isScheduled ? (` with `{slot.scheduledAt.trim() ? (` - a separate,
length-derived boolean, the sibling's own shape - and the assertion passes,
because a truthiness check is not `.length`. Section 6.4.4 mandates "RED when it
references a separate length-derived boolean". It is GREEN.

### MAJOR 2 - the accessible names are guarded as plumbing, not as names (M3)

    expect(slice).toMatch(/idleAriaLabel=\{isScheduled/);
    expect(slice).toMatch(/confirmAriaLabel=\{[\s\S]*isScheduled/);

These check that the prop READS the resolved value. They do not check that the
scheduled branch differs from the immediate branch, or says anything about
scheduling. `idleAriaLabel={isScheduled ? \`Post draft ${ordinal} to Canvas\` : \`Post draft ${ordinal} to Canvas\`}`
passes - which is precisely the outcome RULING 35 forbids, a screen-reader user
hearing "post" on a control that schedules, with the plumbing intact. This is
the half the brief predicted is most likely to rot, and the guard does not cover
it.

### MAJOR 3 - the predicate itself is unpinned; only its identifier spelling is (M4)

Replacing `const visibility = resolveScheduledVisibility(slot.scheduledAt, currentTimeMs());`
with a hand-rolled `slot.scheduledAt ? { kind: "scheduled", label: slot.scheduledAt } : { kind: "immediate" }`
keeps every assertion green, because all of them grep for the tokens
`isScheduled` and `visibility.kind`, never for the import or the call. Nothing
in the suite asserts that `AnnouncementDraftSlot.tsx` imports or calls
`resolveScheduledVisibility` at all
(`grep -rn "resolveScheduledVisibility" src --include=*.test.ts` returns only
`scheduled-visibility.test.ts`). So the one exported predicate can be routed
around on BOTH sides - the decision side has no instrument (BLOCKER 3) and the
copy side checks a variable name.

### MAJOR 4 - the control can ship dead with the gate green (M6)

`onChange={() => onSetScheduledAt(slot.id, "")}` leaves the control rendered,
the label present, the prop used (so no unused-binding lint), and the field
permanently `""` - the capability is 100 percent dead and the gate is 100
percent green. Measured absence, with a working canary:

    grep -rn "onSetScheduledAt\|setScheduledAt" src --include=*.test.ts   -> exit 1 (nothing)
    grep -rn "onChooseTiming"                   src --include=*.test.ts   -> exit 0, 2 hits

The precedent this wave copied - `onChooseTiming` - IS asserted inside the A19
bounded slice at `:766-768`. Its A32 counterpart is not asserted anywhere. This
is the repo's own recurring reachability defect, and the wave plan's claim that
A32-3's gate "is A32-1's and A32-2's reachability proof" is not supported: the
copy and label assertions pass with `slot.scheduledAt` permanently empty.

### MAJOR 5 - RULING 35's substring constraint is not enforced by the test that claims to enforce it (M8)

The new describe is titled:

> A32/RULING 35: neither per-slot control may be named "Timing" or contain it as a substring

Its assertion is `expect(source).not.toMatch(/label="Timing"/)` - the exact
label, closing quote included. Add a third control labelled `label="Timing preset"`
EARLIER in the file and leave "Written for" alone: green. The only thing that
caught M7 was the A19 anchor breaking, which is incidental protection of a
different assertion. A test whose name asserts more than its assertion checks is
the instrument family this repo already tracks; here it is guarding the specific
hazard a ruling was written to close.

### MAJOR 6 - a ruling was reversed after the fact, justified by the argument the ruling explicitly rejected

`docs/a24-a32-waves.md` section 6.1 rules:

> **Ruling: the extraction is REQUIRED, and the reason is not the one line.**

with an exit criterion of `@(Get-Content ...WalkthroughAnnouncementPanel.tsx).Count`
returning **940 or lower**, and it explicitly rejects the plain-arithmetic
argument ("By plain arithmetic, NO") in favour of remediation cost on a file
carrying 23 pinned source-text assertions.

A32-0 never ran. Measured:

    git log --oneline -6 -- src/app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx
      -> 1878a48 directly follows 3d2f07f; no extraction commit between them
    @((git show "3d2f07f:<panel>")).Count   -> 985
    @((git show "1878a48:<panel>")).Count   -> 991
    @(Get-Content <panel>).Count            -> 991

The panel is not in `src/file-size-ceiling.structure.test.ts`'s ratchet
(`grep -n "WalkthroughAnnouncementPanel\|AnnouncementDraftSlot"` exits 1,
positive canary `grep -c "maxLines"` returns 8), so 991 passes the ceiling and
no gate went red. The plan's arithmetic was in fact right - Branch C cost +6
panel lines against its 5-10 estimate, and the calibrated 1.57x overrun did not
materialise.

The defect is in the record, and it is the kind the brief says nothing else
checks. `docs/BACKLOG.md` line 103 now reads:

> No extraction was needed - the panel had headroom at 991 of 1000.

Three problems in one sentence. It adopts the exact argument the accepted ruling
rejected; it uses the POST-change count as if it were the pre-change headroom
(pre-change was 985, i.e. 15 lines, which is the number the ruling reasoned
from); and it leaves the ruling's actual concern - a heavily pinned file at the
ceiling, and the plan's stated policy of leaving 44 lines for the next feature -
unaddressed with no row owing it. Meanwhile the two rows that DO cite this panel
still carry 979/21 and 985/15 as their headroom figures, so three places in
`docs/BACKLOG.md` now disagree about one file, and one of them instructs that
"Any further control in that panel needs the extraction IN the chunk."

Reversing the ruling may well have been right. Recording the reversal in the
past tense, in a note, with the rejected argument and the wrong number, is not a
ruling.

### MAJOR 7 - the publication time is outside the confirm signature

`useAnnouncementDraftSlots.ts:332-335`:

    const postSignatureFor = useCallback((slot: DraftSlot): string | null => {
      if (slot.draft.phase !== "drafted") return null;
      return JSON.stringify(["walkthrough-announcement", slot.id, slot.draft.draft.title, slot.draft.draft.message]);
    }, []);

`scheduledAt` is not in it, and the new reducer case deliberately does not clear
`postArmedFor` - `announcement-draft-slots.test.ts` pins that as a guard ("does
NOT clear regenerateArmed or touch draft"). Editing the title or the message
DOES disarm (`announcement-draft-slots.ts:435`, `:488`). So every field that
changes what gets published re-requires a confirmation except the one that
decides WHEN an irrevocable act takes effect: change the date on an armed slot
and a single further click publishes under the new value.

The copy and labels do re-render correctly, which is why this is MAJOR and not a
blocker. But the arm signature is this repo's mechanism for "the thing you
confirm is the thing you armed", and the new field was added outside it. Neither
scope nor wave plan considered it, so this is a design gap, not only an
implementation slip.

### MAJOR 8 - the wave moved 66 lines inside a heavily cited file and re-pinned nothing

`AnnouncementDraftSlot.tsx` went 295 to 361
(`@((git show "3d2f07f:...")).Count` -> 295; `@(Get-Content ...).Count` -> 361).
Measured new positions (`grep -n` on the label props):

| Cited as | Now |
|---|---|
| `:239` idleLabel | `:298` |
| `:240` confirmLabel | `:299` |
| `:244` loadingLabel | `:303` |
| `:250` idleAriaLabel | `:314` |
| `:251` confirmAriaLabel | `:315-318` |
| `:255-264` the Regenerate ConfirmArmButtons | `:319-331` |
| `:221-229` the consequence paragraph | `:269-282` |

`docs/a24-a32-waves.md` section 7 makes re-pinning the wave's own obligation
("the wave-0 implementer's own report states the new line numbers for every
anchor its wave moved"), and the same obligation plainly applies to a wave that
moves 66 lines in the file every later brief will cite. `docs/BACKLOG.md`'s A19
line-shift record still cites `AnnouncementDraftSlot.tsx:254-263` for the
Regenerate control and `:270-271` for its consequence line; both are now wrong.
RULING 35's five citations are all wrong. Nothing in the suite reads `docs/`, so
nothing catches it.

---

## 4. What is sound, in one line each

- **The naming contract, both halves.** `label="Written for"` at
  `AnnouncementDraftSlot.tsx:142`; `label="Visible to students (optional)"` at
  `:157`, verbatim against `announcements-panel.tsx:463`, with the hint at
  `:165-166` verbatim against `:478-479`. `grep -n 'label=' ` on the slot returns
  five labels, none containing "Timing"; `grep -n 'Timing'` returns only
  identifiers and the `TIMING_OPTIONS` constant. The A19 `indexOf` anchor was
  re-pointed in the same commit, so the rename could not ship silently - the good
  half of RULING 35 worked exactly as predicted.
- **The U+2026 trap.** Byte inspection in Python: 3 real U+2026 characters, zero
  occurrences of ASCII `...`, and U+2026 is the ONLY non-ASCII codepoint in the
  file. `loadingLabel` at `:303` uses the real character in BOTH branches - the
  new "Scheduling" string and the pre-existing "Posting" string (this document is
  ASCII-only, so the character is described rather than quoted).
- **Non-persistence (DECISION 5 Branch A).** No `ta-` key added: `grep -n "ta-"`
  on `scheduled-visibility.ts` exits 1, and the only new `ta-` text anywhere is
  the phrase "under a ta- key" in a comment, which the canary's regex
  `/(?<![a-zA-Z])ta-[a-z-]*[a-z]/g` cannot match. `distinctKeys.size === 5`
  (`walkthrough-announcement.structure.test.ts:123`) is unchanged and green.
  `scheduledAt` appears at 7 non-test sites, none a storage call. The exact
  `ta-rec-*` SET canary in `recording-split.structure.test.ts` is untouched by
  the commit and scans a sibling directory that this change does not reach. One
  correction to the brief's wording: the canary in THIS directory is a COUNT,
  not an exact set - the scope already corrected round 1 on that - so a renamed
  key would pass it; the direct grep above is what actually establishes
  non-persistence.
- **The pure leaf and its table.** 9 tests over empty, whitespace, two malformed
  forms, past, exactly-now, +1ms, and future; `now` injected throughout; the
  boundary proven strict in both directions. This is the best-built artefact in
  the commit, and its final describe is a genuine permanent regression test for
  the past-date row.
- **The action layer.** `createAnnouncementFromMarkdown`'s 5th parameter is
  `delayedPostAt` (`src/lib/canvas/announcements.ts:420-426`), which is the
  position the action forwards. The `toHaveBeenCalledWith` at
  `walkthrough-announcement.test.ts:567-572` was updated with the explicit
  `undefined` 5th argument rather than loosened, and two real cases were added,
  including the library's NaN message passing through the catch unreworded.
- **The reducer.** The C1 exhaustive `Record` and its count went 15 to 16 in the
  same commit; six new cases including an unknown-id no-op and an
  orthogonality case against `timing`.
- **The lint gate on A32's own files.** `npx eslint` over the six A32 production
  files returns no output, exit 0. Positive canary: the same invocation on
  `src/app/components/RecordingTab.tsx` reports its known baseline warning at
  `347:6`, so the command does report findings.

---

## 5. MINORS

1. **The scheduled consequence sentence is confused about Canvas.** `:271-275`
   says "Canvas has no unpublished state before then". A `delayed_post_at`
   announcement is precisely a not-yet-visible state, so the clause either
   asserts something false or is incoherent. The original sentence's version
   ("no unpublished state for an announcement") was true and load-bearing; the
   scheduled rewrite kept the shape and lost the meaning.
2. **The scheduled variant omits the one consequence unique to scheduling.** It
   says the app "cannot recall or delete it afterward", with "afterward"
   ambiguous between "after confirming" and "after it becomes visible". The fact
   an instructor most needs - that there is no way to cancel a scheduled post
   between now and the chosen time - is not stated. See section 2 for the
   past-date counterpart.
3. **The `invalid` kind may be unreachable from this control.** A
   `datetime-local` input yields `""` for an unparseable entry, so
   `resolveScheduledVisibility`'s `invalid` branch, the
   `visibility.kind === "invalid"` term in `disabled` at `:304-309`, and
   `commitPost`'s `invalid` dispatch may all be defending a state the widget
   cannot produce. Not verifiable here (nothing renders, no browser) - owner
   check in section 8.
4. **The two invalid guards are redundant, and the inner one is unreachable via
   the button.** `disabled` already blocks the click, so `commitPost`'s
   `invalid` dispatch cannot be reached by clicking, which means its error copy
   will never be seen and no one would notice if it were wrong.
5. **That error copy arrives bare.** When the client-side `invalid` path does
   fire it dispatches "Could not read the scheduled visibility time." with no
   "Nothing was posted.", unlike the server path's wrapper at
   `WalkthroughAnnouncementPanel.tsx:653`.
6. **The purity fix hides the read rather than removing it - and a second read is
   not even hidden.** `currentTimeMs()` at `:48-50` returns a different value on
   every call; it is not pure by the rule's standard, it is invisible to the
   rule. The idiom is genuinely established (`grep -rn "function currentTimeMs" src`
   returns four files, and the cited `urgencyOf` in `LiveFeedPanel.tsx:38-46` is
   real), so the fix follows precedent honestly. Two caveats. First,
   `toDatetimeLocalValue(new Date())` at `:163` is a direct clock read in the
   component body that was NOT routed through the helper, and the file lints
   clean, which proves empirically that the rule does not flag `new Date()` - so
   the render is impure twice over and lint sees neither. Second, in the
   siblings a render-time clock read decides a badge; here it decides the wording
   of an irrevocable-action consequence, which is BLOCKER 2. The idiom was copied
   without the reason it was safe where it came from.
7. **Repo-wide lint has drifted.** `npm run lint` reports
   `7 problems (0 errors, 7 warnings)`, exit 0, against `this-repo.md`'s baseline
   of 4. None of the three extra warnings is in A32's write set (the targeted
   eslint run above is clean), so this is concurrent work and/or a stale card,
   not an A32 defect - but the card says a fifth warning should be called out
   rather than left to drift, so it is called out.

Non-finding, recorded so a later reader does not re-derive it: the local-to-UTC
conversion happens twice, once in the leaf (`when.toISOString()`) and again in
the library (`announcements.ts:441`). It is idempotent for a Z-suffixed ISO
string, so REQ-A32-2 holds and there is no bug.

---

## 6. The feature-already-exists case, argued at its strongest

It fails, and cleanly. The LIBRARY capability existed - `createAnnouncementFromMarkdown`
has accepted `delayedPostAt` all along and `prompt-announcement-post.ts:27`
already passed it - but the walkthrough SURFACE had no date control of any kind,
and `postWalkthroughAnnouncementAction` dropped the parameter. That is the
backlog row's own measured finding and it is correct. The strongest version of
the reframe is therefore "this is a reachability fix, not a feature", and the
wave already treats it that way: the action change is three tokens and the real
work is the surface plus the predicate. No reframing is owed.

## 7. The weakest requirement

REQ-A32-1's own sentence: "The resolution happens once, in a pure exported
function in a plain `.ts` leaf." It is the clause most likely to be implemented
exactly as written and still produce a bad result, and that is exactly what
happened - both call sites implement it faithfully, each resolving once, in the
pure exported leaf, and the outcome is BLOCKER 2. The clause constrains WHERE the
resolution lives and says nothing about there being ONE resolution shared between
the copy and the decision, which is the property the requirement was actually
for.

## 8. Not verifiable in this environment - owner checks

1. Whether a `datetime-local` input in the owner's browser can ever hand
   `onChange` a string that `new Date()` cannot parse (MINOR 3/4). Nothing
   renders under vitest.
2. What an instructor actually sees after a scheduled post succeeds
   (BLOCKER 1) - the reading claim is unambiguous from source, but confirming it
   on the real surface is a browser check.
3. What a screen reader announces for the arm and confirm states, and whether
   the hint paragraph is reachable from the datetime input at all (it is not
   wired by `aria-describedby`, the same as the sibling, so not a regression).
4. Re-running the eight mutations in section 3 against the real file with a `cp`
   backup, once the tree is quiet enough that a transient red does not reach
   another wave.

## 9. What must go to the owner

Only one thing, and it is BLOCKER 2, because every reading of it changes what
gets built rather than how:

> A pick that is in the future when the instructor arms the post can be in the
> past when they confirm it. Today the paragraph they read promises a schedule
> and the confirm publishes immediately and irrevocably. Which behaviour do you
> want: (a) honour what the instructor was shown, and schedule using the value
> resolved at arm time; (b) refuse the confirm when the armed value has gone
> stale, and say so; or (c) re-resolve on a clock tick so the copy and the labels
> change under the instructor before they click?

BLOCKER 1, BLOCKER 3 and MAJOR 1 through 5 and 7 and 8 are all remediation with
no fork in them. MAJOR 6 is a ruling the orchestrator owns and can correct in the
backlog without the owner.

## 10. Stopping point

What remains is **design** (BLOCKER 2's fork, and MAJOR 7's confirm-signature
question, both of which the scope and the wave plan never considered) and
**measurement** (five demonstrated instrument holes, plus the re-pin debt in
MAJOR 8 and the three disagreeing headroom figures in MAJOR 6). Nothing here
turns on a further round of argument over the artefact: the blockers are
demonstrated rather than argued, and the one genuinely open question is the
owner's.
