# A39 - orchestrator rulings, round 1, 2026-09-23

The check of `docs/a39-architecture.md` returned NOT BUILDABLE AS WRITTEN:
7 blockers, 7 majors, 15 minors, all blockers NEW classes. **This is round 1 of
two.** Revision 2 proceeds; four items go to the owner instead and are listed at
the end.

What held, and is not reopened: the load-bearing census correction (the fast
paths are NOT gated on an owner-only credential - `canvas-credentials.ts:130` is
inside `resolveOwnerEnvCredential`, while `resolveCanvasCredential:189-227` reads
the caller's stored credential first at `:193-196`, behind `requireUser()` not
owner, so census verdict bullet 3 at `a39-census.md:569-572` FALLS); all three
section 0.1 corrections; the mutation at `:371`/`:373` and the divergence
argument, which the checker traced by hand; `1.2 * 39 = 46.8` from
`gemini.ts:67`; all 21 line counts, with both mandated counters agreeing at
990 and 970; both canary claims including the per-surface-key reasoning; every
A17 citation; and the `.docx`-as-zip finding end to end.

## RULING 25 - THE REFRAME COMES FIRST, and it may shrink the whole item

The check's last point is the most important thing in it: **path E already ships
the pool, the pinned rubric and the "Rubric used" receipt.** If that is right,
wave 4 is a PORT rather than a build, and A39's real problem is reachability -
the same disease `docs/a17-discovery.md` measured today, where a shipped, wired
feature read as absent because its affordance moved.

**Ruled: revision 2 opens by testing that claim, before revising anything else.**
Trace path E end to end and state plainly which of the three the app already
has. If the answer is that the machinery exists and only one surface has it,
then the architecture is mostly a port plus a reachability problem, and it must
say so and re-plan on that basis - a smaller, better answer than the one it
currently gives.

This ruling outranks the others because every wave's cost depends on it. Do not
apply Rulings 26-31 to a wave plan that the reframe may delete.

## RULING 26 - the leverage claim's own evidence is a false absence

Section 3 says `grep -rn "rubricUsed\|rubricFingerprint" src` returns nothing.
It returns **30 lines**, including two files THIS DOCUMENT CITES elsewhere
(`useRepoGradesBulkGrade.ts:118` in 2.2 and `rubric-bank.ts:28` in 5.2), and the
paired canary is wrong too (47 claimed against 140 actual).

This is the worst-placed defect in the document, because it sits under the
leverage claim - the argument for building any of this. A false absence there
means the design may be proposing something that partly exists, which is exactly
what Ruling 25 asks. Re-run it unfiltered, never through `head`, and rebuild
section 3 on what is actually there.

## RULING 27 - provenance is dropped by a parser in no wave's write set

`grading-drafts.ts:161-177` `coerceGradingRun` rebuilds the run field by field
and will silently drop both new fields. Only `github-grading-run-store.ts` is
enumerated in the write sets.

The claim is about a DURABLE record - which rubric version produced a given
grade - and the design as written produces an in-memory one that survives until
it is persisted and then quietly does not. Every parser and serializer on the
path is in the write set, or the leverage claim is false. This is the repo's own
rule about a wave's file list needing the file that CALLS the capability,
applied to a field rather than a function.

## RULING 28 - two instruments that cannot fail, and one that cannot be satisfied

- **W2-7 passes by construction**: it looks for the "Rubric used" literal in
  `GradingTab.tsx` while 6.4 mounts `RubricProvenance.tsx` inside
  `GradingResults.tsx`, so `indexOf` is -1 and -1 is less than any index. It
  also contradicts 2.2's own bolded placement contract. Fix both, and state the
  contract once.
- **W4-1's instrument is far narrower than its stated direction of failure**:
  `grep -c "rubricAreas\|canonical\|rubricAreaNames" engine.test.ts` is 0
  against a canary of 16.
- **Wave 3 cannot satisfy W3-3**: 6.3 puts load/save in
  `src/lib/grade/rubric-memory.ts`, but both canaries require the getItem/setItem
  calls inside the surface's own directory (`grading-rows.test.ts:697-732`,
  `snapshot-grading.structure.test.ts:209-224`). Either the leaf moves or the
  canaries change - pick one and say which, rather than shipping a wave whose
  gate cannot go green.

## RULING 29 - the dispatch seam double-spends, and that is a money defect

4.4 keeps `action={formAction}` live while saying the run is intercepted in the
hook. Nothing suppresses the whole-run action, and `pending` from `page.tsx:63`
stays false, so Start Review is never disabled. **Two presses, two runs, twice
the spend.** A26 already shipped a lock in this codebase because two clicks
during a rubric fetch double-graded every repo; this design reintroduces the
same class at the seam it is adding.

Specify the seam exactly: what suppresses the whole-run submit, what disables
the control while a pool is live, and what the instrument is. Per Ruling 8 on
A38, the instrument presses TWICE and expects the second press to do nothing -
not an assertion that a flag is set.

## RULING 30 - the pending sentence is A31 reproduced inside its own fix

`types.ts:195` is "this run's time budget ran out"; `engine.ts:153` puts it into
`strengths`, which renders in an EDITABLE box and can be stranded in
`ta-grading-results-edits`. So a row that is merely not-yet-reached would show an
instructor a sentence asserting a timeout, in a field they can edit, that can
outlive the run.

The document calls this "the largest reuse". It is the largest LIABILITY: A31
Ruling 1 binds - a sentence may assert only what holds on every caller and every
reachable state - and this family has now shipped false copy three times. A
pending row needs a pending sentence, or no sentence.

## RULING 31 - W2-1 is the weakest requirement and must be rewritten

As written, a last-used rubric from ANOTHER ASSIGNMENT auto-fills the field and N
submissions are graded against it, guarded only by a label that no pass condition
requires to render. That is the exact trap `docs/owner-decisions-2026-09-23.md`
DECISION 3 named - the existing global-rubric precedent is a warning, not a
template.

Key the memory to something the app actually knows, and make the label's presence
a pass condition rather than a hope. Also carried: the `1.2s` spacer is deleted
silently while concurrency goes 1 to 3 - say what replaces the rate protection,
because deleting a spacer and tripling parallelism in the same wave is two
changes wearing one name. And the census/architecture reuse RES-A39-4/5/6/7 for
DIFFERENT residuals; renumber so a reader can cite either document unambiguously.

Also: `minRows={10}` means the GradingTab fields are ALREADY ten rows tall, so
2.1's mechanism is misstated - persisting the rubric does not make them tall, it
makes them non-empty. The real instance of the fold defect is
`CartridgeDropPanel.tsx` (`minRows={4}`, no `maxRows`, with "Turn on
auto-grading" at `:451-458` below it), a file wave 2 already writes and does not
cap.

## TO THE OWNER, not to round 2

Four items the loop cannot settle, carried as questions alongside the work:

1. **The platform ceiling on the per-item call.** The per-item Server Action has
   no declarable duration ceiling, and `course-intel/ask/route.ts:47-50` - which
   the architecture itself cites - says exactly that and records three routes
   that moved OFF Server Actions for it. 4.1's table treats "Route Handler with
   maxDuration" and "client pool" as exclusive; they are not, and the
   combination is the only candidate with BOTH a reset clock and a confirmed
   ceiling. **Recommendation: switch the per-item call to a Route Handler at
   `maxDuration = 60`**, keeping the client pool. Ask only whether the Server
   Action form must be preserved for another reason.
2. **Whether two of five new `ta-` keys may land with no canary.** This is
   DECISION 3's own consequence, and it is a disposal decision, not a residual.
3. **RES-A39-15's on-device lingering.**
4. **The reframe in Ruling 25**, if revision 2 confirms it: if wave 4 is a port
   and the real problem is reachability, the item the owner asked for is smaller
   and different from the one scoped.
