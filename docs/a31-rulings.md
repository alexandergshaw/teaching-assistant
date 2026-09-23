# A31 - orchestrator rulings, 2026-09-23

The check of `docs/a31-scope.md` returned NOT CLEAN: 4 blockers, 6 majors, 7
minors, and the verdict that built as written this chunk ships **a new false
sentence** to instructors and to a model, behind two gates that cannot measure
what they claim, with two of its own headline findings dropped. Two blockers
are REPEAT classes and go to disposal now.

Not reopened - the check verified all of it by opening the code: the five-entry
caller census is COMPLETE and a re-run grades the rest on none of them; the
deadline message is unreachable on the attended path, canary-confirmed; the row
was stale about the strengths box, which `b7e62fe` already corrects; both
missed surfaces are real at the exact lines; posting to a student is closed by
construction (`readonly userId?: never`); the guard test really is a spelling
pin; `types.ts` is the right author, for a better reason than the scope gave;
and the localStorage hazard is real.

## RULING 1 - the replacement sentence asserts only what holds EVERYWHERE (B1)

A row that exists because a sentence is false must not ship another one. The
proposed text ends "this row is only reached if what is submitted for grading
changes", and the scope's own section 5 measures the falsifier: the bound is
read from the environment per run, so raising it reaches the row with nothing
submitted changed. On the deadline member it is worse - the stop index is
wall-clock, so a faster run reaches the row with byte-identical input - and the
same sentence hedges "in about the same place" while asserting "only ... if".
It also depends on entry ORDER being stable across runs, which nothing measures.

**THE RULE: a sentence may assert only what holds on every caller and every
reachable state.** Say what is true - this submission was not graded because
the run stopped at its limit - and say what the instructor can do only where it
is true. If nothing is reliably actionable, say nothing rather than something
false. Do NOT freeze a sentence as a literal before it is true; the scope's own
A31-R6 would make the wrong wording expensive to correct.

## RULING 2 - the model prompt IS in remit, and it is the most serious finding (B3)

The scope raised it and disposed of it with neither requirement nor residual,
recording only that the consequence is unobservable here. That is not a
disposal, and unobservable is not harmless: the false sentence is handed to a
model as a student's overall comment.

**A31 FIXES IT.** The structural half survives any wording change - the route
passes every row, and the "has anything to analyse" predicate counts rows
rather than graded rows, so a run where EVERY row is not-attempted still calls
the model with N copies of a not-graded notice and spends the budget doing it.
The remedy is the helper the scope already names as another residual's
instrument. Use it here too.

## RULING 3 - the second editable surface is in remit; already-persisted drafts are not (B3)

`DraftedGradesTab` renders the stored comment straight, with no correction
path, so the retired sentence stays live there. The scope spends a whole
requirement closing the strictly smaller localStorage version of that same
hazard and leaves this one untouched, without stating the asymmetry.

**IN REMIT: the render path**, corrected the same way the other surface is.
**NOT IN REMIT: migrating drafts already stored.** Correct at render, never by
rewriting stored rows - a migration that rewrites an instructor's saved text is
a bigger and more dangerous change than this row is chartered for. Say so where
a reader will hit it.

## RULING 4 - an instrument must be able to produce the quantity it fails on (B2, B4)

Two gates do not bind their object, and both are the same corrective rule.

- P2's object is the exported record's values; its instrument greps a FILE that
  after this chunk only re-exports them. It can never see them - and the same
  chunk mandates the retired strings in that file, so the named grep prints
  lines on correct code forever. Assert over the exported values.
- P3 claims an EXTRA sentence is caught "by construction". A runtime assertion
  over rows a fixture produced sees only the sentences that fixture drives; a
  new sentence on an undriven path is invisible. The only structural guard is
  the leaf's exhaustive switch, and that fires when the UNION grows, not when a
  member gains a new message. Do not record it as strengthened.

## RULING 5 - majors carried

- "Four surfaces that mount `GradingResults`" is THREE, measured.
- The zip path's empty Canvas URL is two reads, not an open question, and it
  shares a storage key with another surface - which bears directly on the
  localStorage requirement, not only on a residual.
- The frozen-literal test transcribes both sentences verbatim, so this chunk
  turns it red and the scope never says so. The cheap repair is the tautology
  that test's own comment records as a sabotage target. Name the real repair.
- RES-A31-1 and RES-A31-2 are owned by a design pass A12's note records as
  promised and never run. **A31 exists because a residual routed that way was
  lost.** Give them an owner that exists.
- The sibling sweep missed the nearest sibling: the same constant and the same
  slice shape in the submission-grade action, telling the instructor to "retry
  this row on its own". Nobody has established whether that is true.

## RULING 6 - minors

Five citations are off by one to four lines; the client-bundle argument
describes a guard A23 replaced, and the real constraint is that `types.ts`
gains no import - a walk-root property, stronger than the exemption claimed;
one comment quoting the old sentence goes stale at this diff in a file the
scope marks do-not-edit; and P3's named door cannot be driven as written. The
do-not-touch note about another agent's files is stale now that L15 landed.
