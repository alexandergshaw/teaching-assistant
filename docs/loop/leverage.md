# Leverage: why this app over a chat window

Owner, 2026-09-15: "one major consideration i need when designing implementing
and testing new features is why should i use this app over just a chat with an
llm. what advantages can we build in?" This card holds the taxonomy the
Criteria step's LEVERAGE CLAIM (`DEV_LOOP.md`, "The loop / Criteria") draws
from. It is not a seat and runs no checks of its own - the Acceptance criteria
checker in `seats.md` asks the questions; this card only supplies the
categories, the evidence, and the procedure for re-deriving them.

## The one rule

**A leverage claim names a mechanism, not a benefit**, and says what the user
does instead today and what that costs them. "It saves time" and "it is
integrated" are benefits - true of nearly everything and falsifiable by
nothing. A mechanism is checkable against the as-built diff: either the code
holds a typed record a chat cannot, or it does not; either a webhook fires
unattended, or it does not.

**Earned versus inherited.** A class is EARNED by a feature only if the
feature had to build something to get it. If every comparable module in the
tree already has the class for free - because it imports one shared client, or
sits on one shared route wrapper - the class describes the platform, not the
feature, and citing it proves nothing. Test this before crediting any claim:
count how many comparable modules already carry the mechanism unearned. If the
count is close to all of them, the class is free here and worthless as a
discriminator (failure mode B, below).

## The taxonomy, six classes derived from this tree

Each row was derived by finding what this repo actually ships, not written
top-down and then hunted for an example - see "Re-deriving this list" below
for the procedure. Every citation was opened directly.

| Class | What it means | In-repo instance | Why a chat cannot do this |
|---|---|---|---|
| CORPUS | A record persisted so a LATER act - a different session, a different feature - reads it back | `src/lib/course-intel/history.ts` (`appendCourseIntelAnswer` / `listAllCourseIntelAnswers`) stores every Ask-AI question and answer per course, read back on a later visit, scoped by `.eq("user_id", userId)` at `:265,271,359,371` | A chat transcript is not a queryable, per-course record anything else in the app - or a later session - can read back |
| CAPTURE | Device input a chat window cannot receive at all | `src/app/components/recording/useRecorder.ts:295,356` (`navigator.mediaDevices.getUserMedia`) and `:682` (`new MediaRecorder`) - real audio/video capture from the user's own hardware | A chat has no microphone or camera; pasting text is the only channel it has |
| LIVE-LOOP | Usable at a glance, hands and attention elsewhere, while an activity is in progress | `src/app/components/snapshot-grading/SnapshotGradingPanel.tsx:516-558` - a `window`-level keydown layer that snaps a shot, arms the next student, or arms a rubric role without moving focus off the work | A chat needs the user's hands on the keyboard typing a message; it has no notion of an ambient control layer running underneath an activity |
| INTEGRATION | An external system triggers or receives app behaviour with no human relaying it | `src/app/api/github/webhook/route.ts:1-30` fires enabled workflow triggers the instant GitHub pushes, unattended, via `runAsOwner` | A chat cannot receive a webhook or act while no one is watching |
| SCALE | The same rigorous act, terms held constant, run N times | `src/lib/grade/engine.ts:113-134` (`gradeStudentEntries`) pins one `rubric`/`criteria` pair (`:130-131`) and loops it over every student in the batch (`:134`), capped by `getGeminiMaxSubmissions()` / `DEFAULT_MAX_SUBMISSIONS = 5` (`src/lib/gemini.ts:25`) applied via `.slice(0, maxSubmissions)` (`:126`) | A chat re-grades each paste independently; nothing stops criteria drifting between students, and nothing holds a batch together as one unit at all |
| GUARANTEED | An output property the code holds regardless of what the model returns - including holding it by making no model call at all | Three instances: (1) `docs/REGRESSION.md` entry 423 - layer C (`src/lib/grade/class-trends-draft.ts`) makes **no model call**, because every claim it needed was already typed by layers A and B; (2) `src/lib/grade/class-trends-insight.ts:171-185` - `ClassTrendsInsightObservation.kind: "inferred"` is a discriminated tag with no second variant, so a model's reading can never be rendered as if it were a counted `AreaTrend`; (3) `src/app/api/course-intel/ask/route.ts:773-781` computes `concernSet` in TypeScript **before** the model is called, then `:864-871` (THE RECEIPT) checks the model's answer addressed every row it was given | A chat's output is prose all the way down; nothing downstream of it can tell a counted fact from a plausible-sounding one, and nothing stops a re-ask from silently answering a different question |

A real feature usually compounds more than one class (the course-intel/ask
route above touches CORPUS, GUARANTEED and, via `.eq("user_id", ...)`,
tenancy - naming which class a *specific* claim rests on is the point, not
forcing a feature into exactly one row). **Not exhaustive**: the first time a
future feature's checked, non-marketing claim does not fit any row, add a row
with its own `file:line` once the feature is built, rather than stretching an
existing category.

## The struck classes - inherited, not earned, and why

These were in an earlier draft of this taxonomy and were removed after
counting how many comparable modules already carry them for free. Do not
re-add them without a fresh count showing the mechanism is no longer free.

| Struck class | Measured denominator | Verdict |
|---|---|---|
| State the app holds | 42 of 352 `.tsx` components under `src/app/components` take a `course: Course` / `courseId: string` prop (`grep -rl "course: Course\|courseId: string" src/app/components --include=*.tsx \| wc -l`; denominator `find src/app/components -name "*.tsx" \| wc -l`) | Any feature placed inside a course view gets this for free. Survives only as the narrower CORPUS above, which requires the record to be READ BACK by a later act, not merely available. |
| Persistence (generic) | 262 files import a Supabase client (`grep -rl 'from "@/lib/supabase' src/lib src/app/actions src/app/api \| wc -l`); 72 lib modules take `SupabaseClient<Database>` | Nearly every server-side module already has a database handle. Folded into CORPUS only when the record is genuinely read back later, not for merely writing a row. |
| Permissions / multi-user | 47 files carry `.eq("user_id"` (`grep -rl '\.eq("user_id"' src/ \| wc -l`); RLS and `requireUser()` are platform-wide | The hardest case, and it still fails: if row-level scoping vanished from the platform tomorrow, no feature here would still be worth building on that ground alone - it is infrastructure, not something this feature earned. |
| Cost control | 74 of 135 LLM-calling files set `maxOutputTokens`; the rest inherit `DEFAULT_MAX_OUTPUT_TOKENS = 700`; `src/lib/llm.ts:503` normalises the cap centrally rather than at each of roughly 78 call sites | A shared default, not a feature-specific guarantee. Also a bad exemplar historically: `DEFAULT_MAX_SUBMISSIONS = 5` is recorded elsewhere in this repo's own notes as a silent-truncation collision, not an advantage to claim. |
| Click cost | Free to any feature with a UI at all | Real and worth counting (see `seats.md`'s User experience seat, which already counts repeat clicks), but it is not a categorical advantage over a chat - it is a claim about steady-state assembly cost, and it is real leverage only when named explicitly as click-cost, never dressed up as integration or persistence it does not have. See the negative example below. |

## Re-deriving this list (failure modes A and B)

Use these two checks whenever this taxonomy is revisited, rather than
inheriting it unexamined:

- **Failure mode A - run against the live queue.** Read `docs/BACKLOG.md` and
  classify every open item: feature-shaped with content, versus a bug, a doc
  correction, an owner verification, a refactor, or a product decision where a
  leverage claim is meaningless. Measured 2026-09-15: 1 of 15 open items was
  feature-shaped (N14). A taxonomy - or a gate - calibrated as if every item
  needed a claim is calibrated against the wrong population.
- **Failure mode B - grep each candidate class's mechanism against every
  comparable module**, not just the feature being justified. If the count
  clusters near "all of them" (20 of 20, 74 of 135 is not that, 262 of a few
  hundred is), the class is inherited from shared infrastructure. This
  taxonomy's own struck rows above are the worked example of applying it.

## What a failing answer looks like

"This feature uses AI to help instructors" - not a claim, names no mechanism,
true of the whole app.

"This feature is integrated with the rest of the course data" - closer, still
fails: which state, read from where, and what happens to the answer if that
state were absent? A checker cannot point at a line.

"This feature reads the course's stored roster and prior grades so the
instructor never re-enters them, persists the Q&A per course so it survives
the session, and every claim is scoped to the account that owns the course" -
passes: named mechanisms, each pointing at code that would have to be deleted
for the claim to become false.

## The negative example, named rather than invented

`src/app/components/courses/AskAiModal.tsx` and its action,
`askAboutCourseAction` (`src/app/actions/llm-content.ts:775-800`), is one
prompt built from `renderCourseFacts(course)` plus a typed question, answered
with one model call. No persistence (the answer lives only in component
state, `AskAiModal.tsx:37`), no receipt check, no scale (one course, not N
students), no live integration (the facts come from the stored `Course` row,
not a live read the way `course-intel/ask` does). The honest leverage claim
here is real but thin: `renderCourseFacts` auto-assembles the context blob so
the instructor does not retype it - a click-cost saving, not a categorical
advantage. **This is not automatically a rejection.** The acceptance criteria
for a feature this shape owes one of three explicit calls, decided by the
human who scoped it, never defaulted by the agent writing the criteria:

- **Redesign** - add a real mechanism (persist the Q&A the way `course-intel`
  does; scope it to the roster instead of a facts string) if the feature is
  worth the added surface.
- **Accept the cost explicitly** - state in the criteria that the advantage is
  click-cost only, so a later reader does not credit it with integration or
  persistence it does not have.
- **Reject** - if a static context blob is genuinely all a chat window would
  also need, and pasting it once costs the instructor nothing they were not
  already going to spend.

Silence is the one illegal answer: shipping this shape while the criteria
narrate it as "integrated" is the failure mode this whole card exists to
catch. This is a named, real instance in the current tree, not a hypothetical.
The owner has decided the disposal: keep the feature and find it a real
mechanism, the "Redesign" option above - see `docs/BACKLOG.md` entry L7, which
holds the candidate advantage until one is designed, checked and scoped.

## The removal test

The claim is not proven by the taxonomy card - it is proven by ONE acceptance
criterion (the test seat's oracle, `seats.md` "Test seat") that goes RED when
the claimed advantage is REMOVED from the feature. Not one a chat merely could
not satisfy - that is unfalsifiable, since almost any criterion about a
database row passes it trivially.

**Checking your own draft.** An author cannot eyeball whether their own test is
a removal test - three of four candidates from the ideation pass that first
used this taxonomy (2026-09-15, `AskAiModal.tsx`) looked like removal tests
and were not: one asserted a row was written while leaving the read-back that
makes it CORPUS unguarded, another asserted a pure function's return value
while leaving the routing that reaches it unguarded. Run this before calling a
removal test done:

State the deletion, then trace the assertion. Name the exact line or call you
would delete to remove the advantage, then say which assertion's observed
value changes as a result. If the assertion's value is unchanged by that
deletion, the test is not a removal test.

**Worked instance, found already shipped with no removal test.** REGRESSION
423 / commit c988963's whole advantage is GUARANTEED: layer C
(`src/lib/grade/class-trends-draft.ts`) makes no model call. Its guard,
`src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts:50`,
originally listed `FORBIDDEN_PATH_PREFIXES = ["app/actions", "lib/canvas",
"lib/lms-generation"]` - omitting `lib/llm` and `lib/gemini`. Re-introducing a
model call into `class-trends-draft.ts` left every gate green, including this
one. Fixed in the same chunk that added this card: the prefix list now also
bans `lib/llm` and `lib/gemini`, and the fix was sabotage-checked by adding a
real `import { X } from "../llm"` to `class-trends-draft.ts` (5 tests passing
before, 4 passed / 1 failed with the import present, 5 passing again after
removing it) - proof the guard now actually depends on the prefixes it lists.

**Second instance, to show the shape generalises without re-proving it here.**
The receipt at `src/app/api/course-intel/ask/route.ts:864-871`
(`unexplainedStudentIndices`) already has this shape of test:
`src/lib/course-intel/offline-answer.test.ts` and
`src/lib/course-intel/cross-course-answer.test.ts` both exercise it by handing
the filter an answer missing an `S<n>` marker and asserting the count comes
back non-empty.

**Honest limit.** Most removal tests here are transitive-import bans or
pure-function assertions on typed data, because no component is rendered by
any test in this repo (`docs/loop/this-repo.md`). LIVE-LOOP is the one
surviving class with no buildable removal test here for that reason - its
advantage is clicks, latency and attention, which nothing in this suite can
observe. Where no removal test is buildable, say so and record a residual with
an owner and a step (`seats.md`, Test seat).

## Disposal, not a fourth revision round

A leverage claim that Verify finds the built diff no longer supports is a
finding like any other and takes one of `iteration-caps.md`'s four legal
disposals - most often **(b) Reduce** (the human decides whether the thin
version still ships) or **(d) Delete** (the claim was never real; strike it
and say so) - never a third round of restating the same benefit more
emphatically. The rejection lands on the CLAIM, never on the feature: the
feature proceeds either way, rewritten or with the claim withdrawn.
