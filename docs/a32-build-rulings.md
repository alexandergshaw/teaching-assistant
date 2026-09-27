# A32 wave 1 build check - orchestrator rulings, 2026-09-27

The check returned DEFECTIVE: 3 blockers, 8 majors, 7 minors. Everything except
B2 and M7 is remediation with no fork. **M6 is MY error and I correct it below.**

I verified the three blockers myself before ruling: the success paragraph renders
unconditionally on `slot.postedTo` and reads "Students can see it now."; the
predicate is evaluated from `currentTimeMs()` at `AnnouncementDraftSlot.tsx:114`
and again from `Date.now()` at `useAnnouncementDraftSlots.ts:349`; and no test
reads the hook as source at all, against a canary showing the slot component IS
read. All three hold.

**A method note that raises my confidence rather than lowering it.** The checker
did NOT mutate the tree, because several waves were live and this repo bans
concurrent sabotage-verify. It transcribed the assertions into a replica and
evaluated them over mutated copies, then filed the real re-run as a residual. That
is the right call under concurrency and it said so rather than skipping the proof.

## RULING 64 - B1: a FIFTH false sentence, and it is in an aria-live region

`Posted to {slot.postedTo}. Students can see it now.` renders on every successful
post, including the scheduled one. So after scheduling, the instructor and a
screen reader are both told students can see it now, in a `role="status"` live
region.

**This is the fifth false user-facing sentence this codebase has shipped**, and
the most avoidable: A32's own scope named the sibling's BRANCHING success copy as
the thing that "partly redeems" the sibling, and the wave copied the sibling's
LABELS verbatim while not copying the one string its own scope had called honest.
My RULING 35 enumerated five labels plus the consequence paragraph; this sixth
string was in neither enumeration and falls outside both new anchored slices. **An
enumeration of strings to change is a FLOOR, not the set** - the trap card already
says that about lists handed to implementers, and I handed one.

Ruled: branch it, and the instrument asserts BOTH branches - not just that the
scheduled wording exists.

## RULING 65 - B3: the decision half has no instrument, and its test file was in the write set

`grep -rn 'useAnnouncementDraftSlots.ts"' src --include=*.test.ts` exits 1. No
test reads the hook as source. Its test file covers three pure research helpers
and never mentions the post path - **and that file is in A32-3's declared write
set, and the commit does not touch it.**

So replacing the confirm-side resolution with raw truthiness keeps lint, tsc,
build and every test green: the original blocker reintroduced, with the backlog row
warning against exactly that and nothing enforcing it. Ruled: the decision half
gets an executing assertion, and the wave's own write set is the evidence it was
owed - a file named in a write set and left untouched is a gap, not a saving.

## RULING 66 - M1 through M5: five demonstrated instrument holes, one rule

Each was shown green under a mutation it was written to catch:

- the consequence paragraph driven by truthiness stays green, because an
  alternation is satisfied by an inner narrowing the mutation leaves in place;
- an accessible name hard-coded to the SAME string on both branches stays green -
  the exact outcome RULING 35 forbids;
- the predicate replaced by a hand-rolled object stays green, because nothing
  asserts the import or the call;
- the control wired to write an empty string stays green, so the capability can
  ship 100% dead - while the precedent's equivalent IS asserted;
- a third control labelled with "Timing" as a PREFIX stays green, which is the
  substring trap RULING 35 named and the test's own title claims to cover.

**One rule: an assertion must be written against the MUTATION it is for, and
proven red by it.** Alternations, narrowings and identifier-name checks all admit
the defect while reading as coverage. This is the same class as A39's three blind
instruments closed at `b7baff9`, so it is a REPEAT at the class level and the
remediation changes kind: assert the emitted VALUE or the observed CALL, not the
presence of a name.

## RULING 67 - M6 IS MINE, and I recorded a reversal as a fact

Section 6.1 of the plan ruled the extraction REQUIRED with an exit at 940 or below,
explicitly rejecting the arithmetic case. The extraction never ran, and **I then
wrote in the row: "No extraction was needed - the panel had headroom at 991 of
1000."** That is wrong twice over: 991 is the POST-change count, so it is quoted as
if it were pre-change headroom, and the real pre-change figure was 985 - fifteen
lines, against a plan policy of 44. The panel now has nine.

Worse, three places in the backlog disagree about one file, and one of them
instructs that any further control in that panel needs the extraction in the same
chunk.

**The reversal may well be right - nine lines still passes the hard ceiling. But I
recorded it as a measurement instead of as a decision, using the wrong number.**
Corrected in the row in this same commit: the pre-change figure, the post-change
figure, the plan's rejected argument, and the fact that I accepted it after the
fact. The two stale sibling figures are marked as superseded rather than left to
contradict.

## RULING 68 - M7 and M8, carried

**M7 is a real design gap neither scope nor plan considered:** the confirm
signature hashes tag, id, title and message - **not** the scheduled time - and the
set-scheduled-at action deliberately does not disarm, while title and message
edits do. So the one field deciding when an irrevocable act takes effect is the
only one that does not re-require confirmation. Ruled into the remediation.

**M8:** 66 lines moved and nothing was re-pinned. All five of RULING 35's
citations have shifted, as have the two block ranges, and a backlog line-shift
record still cites the old numbers. Re-pin them, and note the plan made re-pinning
this wave's own obligation.

## TO THE OWNER - one question, and it is about an irrevocable act

**B2 is the one I cannot settle.** "One predicate" turns out to be one FUNCTION
evaluated TWICE, from TWO CLOCKS: at render with one call, at confirm with
another. The checker reproduced all three tables by driving the shipped code -
the old split shape disagrees (as the wave proved), the shipped predicate agrees
at a FIXED clock (so the wave's central claim holds as stated), and the shipped
WIRING disagrees across a render-to-confirm gap.

It needs no mistyped date. The field's earliest offerable value is the current
minute, and arm-then-confirm exists precisely so the instructor stops and reads
the paragraph. So a pick that is in the future when they arm can be in the past
when they confirm - and the paragraph they read promises a schedule while the
confirm publishes immediately and irrevocably to every student.

> **Which do you want: (a) honour what the instructor was SHOWN and schedule using
> the value resolved at arm time; (b) REFUSE the confirm when the armed value has
> gone stale, and say so; or (c) re-resolve on a tick so the copy and labels change
> under them before they click?**

**Recommendation: (b).** It is the only one that cannot publish something the
instructor was not shown, and this app already uses arm-then-confirm precisely to
make the consequence readable before the irrevocable step. (a) silently posts at a
time the current clock disagrees with; (c) changes wording under a reader mid-decision,
which is worse for a screen-reader user than for a sighted one.

Either of the three ends the activity. Everything else above is remediation.
