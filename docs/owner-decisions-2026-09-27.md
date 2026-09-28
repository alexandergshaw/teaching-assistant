# Owner decisions, 2026-09-27

## DECISION 15 - A43 KEEPS the conversational ask. The scope's recommendation is overridden.

The A43 scope recommended routing A43-C - "smoothly upload and ask for things" -
OUT of the row, on the measured ground that no function or tool calling exists
anywhere in this app. **The owner answered: keep it.**

So A43 is the whole request, not the template half. Recorded here with what that
costs, because the cost is real and the scope was right about the measurement
even though it was overruled on the disposition.

**What the measurement actually says.** Re-verified this pass:
`grep -rniE "functionDeclaration|functionCall|toolConfig" src/lib/llm.ts
src/app/api/ai-chat/route.ts` returns NOTHING, against a canary of 22 exports in
`llm.ts` proving the file was read. `llm.ts:519` is Google search grounding, not
app tool calling. So there is no mechanism today by which a model request can
invoke an app capability.

**Therefore A43 now includes building that mechanism, and that is the largest
single thing in the row.** It is not a UI affordance and it must not be scoped as
one. "Ask for things" against a deck means at minimum: a declared set of
operations the model may request, a schema for each, a dispatcher that validates
a requested operation before running it, and a refusal path for anything outside
the set. That is a capability surface, and every one of those parts is a place a
model can ask for something the app must decline.

**The consequence for the row's shape, which the owner should know:** A43 cannot
close until the conversational layer ships. The template guarantee - the half
nothing else can give the owner - is therefore no longer independently closable
as this row. That is the trade the owner accepted. The mitigation is sequencing,
not scope: the template half ships FIRST and completely, because it is the half
with a structural guarantee, and the conversational layer is built against
something that already conforms. Building them in the other order means a
conversational editor with nothing trustworthy to edit.

**What does NOT change, and must not be relaxed to fit the conversational half:**

- **The guarantee stays structural.** Q2's ruling was shape (a) - the model emits
  content as structured data and a deterministic writer places it into the
  uploaded template, so the template is never in the model's hands. A
  conversational request may change CONTENT. It may NOT be allowed to reach the
  writer, the template, or the layout. The moment a model request can alter
  placement, the guarantee stops being structural and becomes checked, and the
  owner's own requirement - output guaranteed to use their template - is gone.
  So the operation set is the enforcement point: if an operation cannot be
  expressed as content, it is not an operation.
- **The interaction budget stays.** `docs/a39-census.md` measured that this app's
  problem is interaction cost and a chat's advantage is asking for nothing else.
  The existing deck surface is 3 warm interactions with NO course prerequisite,
  which is unusually good. A conversational layer must not add a required step,
  a mode switch, or a prerequisite.
- **The hard constraint stays.** The shipped machinery can rewrite, clone or
  delete a paragraph and CANNOT add a slide, so a deck from an uploaded template
  has exactly the template's slide count while this app's own decks reach the
  high seventies. A conversational "add a slide about X" is therefore blocked on
  the slide-cloning wave, and must refuse in a way that says so rather than
  silently producing nothing.

**What I am NOT deciding here**, because it is the scope's to settle now that the
disposition has changed: whether the conversational layer is a general tool-calling
mechanism or a deck-specific operation set. The general one is reusable and much
larger; the deck-specific one is smaller and will be re-implemented the next time
this need appears. That is a real fork and the revised scope must argue it, with a
recommendation, rather than defaulting to whichever is easier to write.

## DECISION 16 - A40's disclosure ships PRESENCE PLUS ORIGIN, with the new column.

Asked 2026-09-27 as A40's one terminating question. The owner answered **(b)**.

So the drop row names WHICH course and assignment the rubric came from, not
merely that one was present. Per the question as put, (b) carries the
implementation with it: **a new column on `cartridge_drops` plus a migration**,
not the render-time comparison against rubric-memory. The render-time variant was
offered and is refused here for the reason stated when the question was asked -
it is a disclosure that silently stops being true on reload, which is the same
class of defect A40 exists to fix.

Three things this decision settles, and the activity ends with them:

- **The DECISION 3 conflict closes inside A40.** DECISION 3's own text calls
  applying one assignment's rubric to another "a correctness defect wearing a
  convenience feature's clothes". Presence-only would have left that defect
  invisible on the row and deferred it to an owner-owned follow-up; origin makes
  a fallback-sourced rubric permanently visible where the grade is.
- **RULING 105 still holds and is not reopened.** The disclosure lives on the
  DROP ROW, not inside the panel, because the panel is unmounted in the same
  handler chain that fires the auto-grade - so built inside the panel it would
  pass every gate in this repo and never be seen. The column makes that placement
  the natural one rather than a workaround.
- **Zero added interactions, as RULING 100 requires.** Neither content costs a
  click. What (b) buys is a sentence that is true in every reachable state, which
  A31 Ruling 1 already requires of confirm copy.

**What it costs if the owner is wrong:** one migration and one column for a
caption most instructors will never read. Migrations auto-apply on push to main
here, so the migration is checked before push, additive only, and idempotent on
re-apply.

**A40-R6 is NOT filed.** Presence-only would have deferred the cross-assignment
fallback to an owner-owned residual with the caption as its instrument. Under (b)
the origin field IS that instrument, and it is in the product rather than in a
row. The separate B4 question - whether the fallback should exist at all - is
unchanged by this decision and stays open.

## DECISION 17 - the incremental grading run is a FILL of the existing surface.

Asked repeatedly from 2026-09-27; answered 2026-09-28 with one word, "fill".

So the incremental route produces the SAME `GradingRun` the whole-run path does -
same rubric provenance, same rubric auto-generation, same blank-instructions
refusal, same checklist and sample answer - arriving progressively. One table, one
state machine. Not a second, narrower live view that hands off at the end.

**What this settles, and it is four of the five blockers in the wave-4 build
check.** Two of them exist only because two state machines share one surface today:
both tables can render stacked, each claiming to be the editable one. A second
surface would have made that duality permanent. The fill also structurally prevents
the worst defect the check found - that on the incremental route a blank rubric
graded against NO rubric, because rubric auto-generation lives in the whole-run
action the incremental path bypasses.

**What it costs, stated because the owner should not have to discover it:** the
fill is the bigger build, and the per-item path needs the cross-item column merge
it currently skips - today the incremental table's rubric columns come from
whichever row arrived first rather than a union. Rubric generation also happens
once per RUN, so it must complete before the first item dispatches, which adds
latency before the first result appears. That tradeoff is inherent to the fill and
is not a defect in it.

**The flag stays off until the fill lands.** `INCREMENTAL_ROUTE_ENABLED = false`
gates the route (RULING 116); it flips when the fill's stated conditions are met,
not on a schedule.

**A process note that belongs with this decision.** Twenty-five commits passed
between this fork appearing and the owner answering it, while I restated the
question every turn instead of starting my own recommended reading. The owner
identified the cause: AGENTS.md's fork clause forbids GATING but not DEFERRING, and
"while other work continues" was satisfied every turn by an unrelated queue. That
is recorded as SHAPE 5 in AGENTS.md with a control that reuses the existing backlog
machinery, and the design pass was started before the answer arrived rather than
after.

## DECISION 18 - the Tools > Grading sub-tab is a container with INNER NAVIGATION.

Asked 2026-09-28 as the moved-versus-linked fork on the consolidation request;
answered the same day with "sub-tab with inner navigation".

The owner's request, verbatim, because the scope survey turns on its wording:
"the new concurrent tool should live under the Tools tab, under a new sub tab
called 'Grading'. All other grading related tools should also be pulled into this
new subtab".

So Grading is a sub-tab that owns a second level of navigation across the grading
surfaces, rather than one long scrolling screen with sections, and rather than a
landing page of links out to where those tools live today. The surfaces MOVE into
it; they are not mirrored from it.

**What the decision makes harder rather than easier, and it is the reason the
scope pass is not a formality.** Inner navigation turns the survey's boundary into
a product surface: every tool judged grading-related becomes an item in that nav,
so an over-inclusive reading produces a cluttered second-level nav instead of
merely a long page. The scope owes an explicit LINE between a grading tool and a
surface that merely mentions grades, and if the honest reading of "all other
grading related tools" is wider than one nav should hold, it owes a first landing
set rather than everything in one commit.

It also owes an inner-selection persistence story. This repo persists UI control
state under `ta-` keys, and a nav that forgets where the user was on every visit
is worse than today's arrangement. The first-load-with-nothing-stored case has to
be named, and so does the fate of the old location's persisted view id - a stored
pointer at a view that no longer exists is the failure mode that ships silently.

**Sequencing is unchanged by this decision and still binds** - but the mechanism
I recorded here was WRONG, and the correction is kept in place rather than
rewritten away, because a decision ledger that silently improves its own reasoning
cannot be audited.

What I wrote: fill waves 6 and 7 touch `GradingTab.tsx`, so the navigation work
must wait or be cut. MEASURED AFTERWARDS: neither wave touches that file. W6's
write set is `docs/a39-fill-waves.md:1253-1256` and W7's is `:1305-1310`; W5 was
the wave that wrote `GradingTab.tsx` and it landed at `32af6aa`, with W6 landing
at `de1e84e`. There is no write-set collision.

The CONSTRAINT survives for a different and sharper reason. `GradingTab.tsx` is
pinned BY PATH by existing tests - `autoGradeTransition.wiring.test.ts:16`, and a
frozen exact two-path set at `:412-417` naming the only `.tsx` files carrying
`editsSurface="canvas"` - so extracting any part of it that carries that attribute
goes red. And the 620 bound I cited is enforced by NO TEST at all: the only
mechanical ceiling in the tree is `LIMIT = 1000` in
`src/file-size-ceiling.structure.test.ts:41`, against which the file that is
actually near the edge is `GradingRecordingPanel.tsx` at 977 lines. So the
conclusion stands - prefer a cut that does not write `GradingTab.tsx` - while the
reason I gave for it did not.

## DECISION 19 - take the recommended path on every open grading/RLS fork.

Owner, 2026-09-28: "ignore qa - continue on all else", then "recommended paths".
QA seats are dropped (the plan and its review stay recorded at
docs/loop/qa-roles-plan.md but nothing proceeds). On everything else, act on the
stated recommendation rather than asking again. Concretely:

- **A11Y-RLS = A1 (deny-all).** Enable RLS on accessibility_scans with ZERO
  policies, one migration, no foreign key, DDL deleted, citation repointed, three
  instruments. The only accessor is the service-role client, which bypasses RLS,
  so deny-all closes the exposure while the feature keeps working. This is a
  PRODUCTION migration (auto-applies on push); the push is flagged before it
  lands, and the post-apply confirmation that RLS is on is an owner-only step.
- **GRAD-SUBTAB = all five surfaces.** The scope call (close on two shipped waves
  vs derive all five) is answered: all five. Wave 3 (Drafted Grades) proceeds.
- **Standing for this run:** any fork inside the in-flight work takes its
  recommended option without a new question (e.g. wave 2's ta-rec-view migration
  = SKIP per its derivation; wave 3's forks = the derivation's recommendations).
  A fork rides alongside as a recorded recommendation acted on, never as a gate.
