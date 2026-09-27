# G4 scope check, round 1 of at most two

Subject: `docs/g4-scope.md` as committed at `6e326dc`, **416 lines**
(`wc -l docs/g4-scope.md` -> 416; the same file read by `python` reports
`d.count("\n")` = 416, no BOM, zero CRLF). Prior version read from
`git show a229bf7:docs/g4-scope.md`, **583 lines** (`wc -l` on the extracted
scratchpad copy). Checker did not author either version. No prior check
document for G4 exists (`ls docs/ | grep -i "^g4"` -> `g4-scope.md` only;
`git log --oneline --all -- docs/g4-check.md docs/g4-scope.md` -> two commits,
both scope), so every finding below is NEW against the prior scope's own round
except where two of my own findings share one corrective rule, and except B2,
which repeats a class **this document itself names and corrects one paragraph
earlier**.

Everything below was evaluated read-only against the committed tree. No
production or test file was mutated; the only files this pass wrote are this
document and one scratchpad `.py` helper under the session scratchpad.

---

## VERDICT: BUILDABLE IN PART

| Severity | Count |
|---|---|
| Blockers | 6 |
| Majors | 6 |
| Minors | 4 |

Wave B is dispatchable as it stands. Wave A's hand-over is a legal relocation
and is honestly reported as unshipped, but it carries the wrong constant and
credits an instrument that does not encode the requirement. **Wave C must not
be dispatched**: its deadline arithmetic is absent, and its single instrument
clause is the weakest requirement in the document.

---

## BLOCKERS

### B1 - The bound is per-call while the ceiling is per-invocation, and the scope never states the arithmetic. NEW.

**Class: the remedy is sized against the wrong denominator.**

This is the whole point of the row and the document does not close it.

The scope's recommended Wave C shape is per-caller `raceWithTimeout` wrapping
(§5(X), `docs/g4-scope.md:296-303`), sized against "budget precedent ...
`course-intel/ask/route.ts:145`, `TOTAL_BUDGET_MS = 54_000`" (§7 R4,
`:349`; the prior version stated the same at its `:348-353`). A fixed constant
per call site is arithmetically incoherent wherever one invocation contains
more than one bounded call, and this tree is mostly that case:

```
grep -rn "callLlm(" src --include=*.ts --include=*.tsx | grep -v "\.test\." \
  | cut -d: -f1 | sort | uniq -c | awk '$1>=2' | wc -l
```
-> **31** caller files hold two or more `callLlm(` sites. The same pipeline
summed over those files (`awk '$1>=2{s+=$1} END{print s}'`) -> **94** of the
127 raw sites. `sort -rn | head -5` -> `src/app/actions/llm-content.ts` **8**,
`research.ts` **6**, `media.ts` **6**, `llm-tools.ts` **6**,
`current-events.ts` **5**.

So implemented exactly as §5(X) is written, `llm-content.ts` gets eight
independent 50-54s budgets inside one invocation whose ceiling the document
itself says is UNCONFIRMED and at most 60s. **Every wrapper fires after the
platform kill.** That is precisely the "buys nothing" failure the row exists to
prevent, reintroduced by the recommended remedy.

**The repo already solved this and the scope did not survey the solution.**
`course-intel/ask/route.ts` - the file the scope names as its budget precedent -
does **not** hand `TOTAL_BUDGET_MS` to the wrapper. It has **six**
`withDeadline(` call sites (`grep -n "withDeadline(" src/app/api/course-intel/ask/route.ts`
-> `:426, :491, :565, :621, :828, :882`) and at each model call it computes an
elapsed-aware remainder minus a reserve:

- `:297` `const startedAtMs = Date.now();`
- `:421` / `:820` `const remainingMs = startedAtMs + TOTAL_BUDGET_MS - Date.now();`
- `:424` / `:823` `Math.max(MODEL_WAIT_MIN_MS, remainingMs - MODEL_WAIT_RESERVE_MS)`
- `:172` `const MODEL_WAIT_RESERVE_MS = PERSIST_WAIT_MS + 2_000;`

`class-trends-insight/route.ts` is the same shape: `TOTAL_BUDGET_MS = 50_000`
at `:47`, `MODEL_WAIT_RESERVE_MS = 2_000` at `:51`, and the remainder computed
at `:143-144`. The scope cites `ask/route.ts:145` and never `:297`, `:172`,
`:421` or `:820`, and never records that `class-trends-insight` has a budget
constant at all (§2's table row, `docs/g4-scope.md:151`, says only "Yes,
`withDeadline`"; the prior version at least recorded that the constant "was not
re-opened this pass").

**Retries compound it and the scope dropped those facts too.** `llm.ts:396`
`MAX_ATTEMPTS = 5`, `:398` `MAX_DELAY_MS = 10000`, and the comment at `:393`
says the no-`Retry-After` worst case backs off "~0.6 + 1.2 + 2.4 + 4.8 = 9s ...
still far under the 60s Vercel function cap" - which is the *no*-`Retry-After`
case only; the loop honours `Retry-After` and `MAX_DELAY_MS` permits up to
4 x 10s. One `await callLlm` can therefore consume ~40s of backoff plus five
request durations inside whatever bound wraps it. The prior scope carried
`MAX_ATTEMPTS`, `MAX_DELAY_MS` and the ~9s figure (`a229bf7` §1, its
`:115-117`). This version's disposition row for that paragraph says
**"KEPT, re-cited with today's line numbers"** (`:33`) and the new text carries
the citations without any of the arithmetic. Nothing anywhere in the document
states the relationship between a chosen deadline and the retry budget it must
contain. The backlog row's own evidence - `learning-resource-links.ts:55-66`'s
documented 90-100s case and `RETRY_BUDGET_MS = 32_000` at `:121`
(`docs/BACKLOG.md:95`) - appears nowhere in either version
(`grep -n "RETRY_BUDGET\|MAX_ATTEMPTS\|MAX_DELAY\|90-100" docs/g4-scope.md` ->
no hit on any of those four terms).

**The unattended path makes it worse and the scope reduces it to a clause.**
`src/app/api/cron/run-schedules/route.ts:56` is `export const maxDuration = 60;`
and `steps.grading-run.ts:473-479` states the tick may attempt "up to 40
students in one invocation", already relying on a shared-deadline helper
(`repoGradingStopAt`, defined at
`src/lib/workflows/registry/steps.grading-repos.grade-repo.ts:77`, passed as
`runDeadlineMs` at `steps.grading-run.ts:479`). A per-caller 50s constant at
that call site starts its clock after the tick is nearly dead. §2 disposes of
this in eleven words - "shared across the whole tick, not a per-call budget -
unchanged defect" (`docs/g4-scope.md:180`) - and no wave carries a sizing rule
for a shared ceiling. `repoGradingStopAt` is not mentioned in the document at
all.

**Second instance of the same corrective rule, folded here rather than counted
separately (anti-gaming: one mechanism, one blocker).** §3.3
(`docs/g4-scope.md:206-214`) credits A39's Check 3 as "precisely this
document's own §4b requirement ... turned into an executable, static
assertion". It is not. The assertion, verbatim at
`docs/a39-waves.md:1798-1801`, is that `TOTAL_BUDGET_MS` parsed from source is
"**strictly less** than the first times 1000". It passes at
`TOTAL_BUDGET_MS = 59_999`; it tests no reserve, and it cannot see the
invocation time spent before the race starts (`requireUser()`'s Supabase round
trip and `req.json()` of a body the receiving plan budgets at ~4.5MB,
`docs/a39-waves.md:3014`). The prior requirement was a deadline that "fires
comfortably under `maxDuration = 60`" with a "6-second reserve" precedent
(`a229bf7` §4b, its `:348-353`). The hand-over reports that as strengthened
while the executable form is strictly weaker on the one dimension the row is
about.

**Disposition: fixable in the one revision.** State the budget as
elapsed-aware with a named reserve, cite `ask/route.ts:297/:421/:172` and
`class-trends-insight/route.ts:47/:51/:143-144` as the shape, restore the
retry-budget arithmetic, give the shared-ceiling (cron tick) path its own
sizing rule naming `repoGradingStopAt`, and say explicitly that Check 3 does
not cover the reserve or the pre-race elapsed time.

---

### B2 - The `"use server"` split is measured with an instrument that matches comments; the stated set is wrong three ways and is reported as verified unchanged. REPEAT-OF the class this document corrects in §0/§4a-r (a search instrument that selects the wrong set, reported as a fact).

`docs/g4-scope.md:127-132`:

> `"use server"` split: `grep -rln "callLlm(" ... | grep "src/app/actions/" | wc -l` = 52; of those, `grep -l '"use server"' <files> | wc -l` = 48 (same **5** leaf helpers as before, confirmed still present: `current-events-assignment-generator.ts`, `intro-discussion-generator.ts`, `learning-resources-generator.ts`, `module-objectives-generator.ts`, `shared.ts`).

Three defects, all measured:

1. **Internal arithmetic.** 52 - 48 = **4**, not 5. The document's own two
   numbers contradict its own stated set size.
2. **The instrument matches a doc comment.**
   `grep -n '"use server"' src/app/actions/current-events-assignment-generator.ts src/app/actions/intro-discussion-generator.ts`
   ->
   `current-events-assignment-generator.ts:14: * "use server" directive (this file is a leaf the caller invokes directly,`
   and `intro-discussion-generator.ts:14: * "use server" directive (this file is a leaf the runner calls directly, not`.
   Both files are counted as *carrying* the directive by the very sentence in
   which they explain that they do not. The correct first-line instrument -
   `for f in <the 52>; do head -1 "$f" | grep -q '^"use server";' ... done` -
   returns **46**, not 48.
3. **The set has a sixth member the document does not name.** The same loop,
   inverted, returns six files with no first-line directive:
   `current-events-assignment-generator.ts`, `intro-discussion-generator.ts`,
   `learning-resources-generator.ts`, `module-objectives-generator.ts`,
   `shared.ts`, **`slide-graphics-repair.ts`**. The last was added by
   `d7877db` (`git log --oneline -1 -- src/app/actions/slide-graphics-repair.ts`)
   and appears in neither version of the scope. The document asserts "same 5
   leaf helpers as before, **confirmed still present**" - a verification claim
   about a set that changed.

**This is the document's own named class.** §0/§4a-r correctly diagnoses that
`--include=*.ts` selected the wrong file set and correctly pairs the
correction with a canary, and §2's comment-prefix proxy
(`grep -E "^[^:]+:[0-9]+:\s*(//|\*)"`, `docs/g4-scope.md:118`) exists precisely
because a line-text grep cannot tell code from a comment - and returns the
right answer, 2 lines. The identical hazard was then not applied to the
neighbouring measurement five lines later. The corrective rule that fixes
§4a-r fixes this, so it is a REPEAT, not a new class.

**Why it matters beyond the numbers:** the leaf/action split is how Wave C
decides which callers can declare a ceiling and which cannot. A sixth leaf
helper that no pass has ever seen is a Wave C caller nobody has classified.

**Disposition: fixable in the one revision.** Replace the instrument with a
first-line check, state 52 / 46 / 6, and name `slide-graphics-repair.ts`.

---

### B3 - The disposition table maps its own rows forward but not the prior document's requirements backward. One prior section has no row at all; one row asserts KEPT for content the new text does not carry. NEW.

**Class: a restructuring's disposition table is audited in the wrong direction.**

All 19 rows (`docs/g4-scope.md:30-48`) do trace to a real prior requirement -
I checked each against the extracted `a229bf7` copy, and no row is fabricated.
The failure is the other direction, and §0's closing sentence -
**"Nothing was dropped. Every row above traces to a citation opened this
pass."** (`:50`) - is a claim about rows, presented as a claim about
requirements.

**(a) The prior document's entire §3 has no disposition row.** `a229bf7` §3,
"What the platform actually does today, per call site" (its `:254-276`), is a
six-row *Declared ceiling / Effective bound* table plus a closing paragraph.
Nothing in the new table covers it. §2's Route Handler table
(`docs/g4-scope.md:148-152`) is a different object - `maxDuration` and
"Wrapped?", not effective bound - and carries three rows where §3 had six. What
went with it:

- the row for "the other ~58 caller files ... UNCONFIRMED", i.e. the effective
  bound on the bulk of Wave C's population;
- the `ai-chat` row's explicit handling of the 10s figure ("Vercel's public
  docs state 10s as the Hobby default ... so it is UNVERIFIED here, not 10s as
  a fact of this repo");
- **the prior document's own standing rule: "Do not treat 'platform default'
  as a known number anywhere in this document; it is not measured in this
  repo."** That rule was what kept every later section honest, and it is gone.

**(b) The row for prior §5 says KEPT and the new text carries none of it.**
Row at `docs/g4-scope.md:43` - "§5 user-facing failure descriptions for
wrapped vs. unwrapped Route Handlers, and for `ai-chat`" - **KEPT**, with a
Detail cell about `ai-chat/route.ts:647` and nothing else. The new §5 is "The
fork, restated"; there is no section anywhere carrying prior §5's substance.
Specifically absent from the new document:

- that on a platform kill **the handler's own `try`/`catch` never runs**, so
  the caller gets a raw transport failure rather than a worded body. This is
  the row's defining sentence (`docs/BACKLOG.md:95`: "NOTE the defect itself is
  NOT the slow call; it is that when the platform kills the invocation the
  action's catch never runs"). `grep -n "catch never runs" docs/g4-scope.md`
  -> no hit.
- that Gemini's `:generateContent` is non-streaming, so there is no partial
  model output to salvage;
- the distinction between "no partial work preserved for this student" and
  "for the run";
- `GradedResult | UngradedResult` as the union that carries the per-item
  failure;
- DECISION 2's binding rule ("a sentence may assert only what holds on every
  caller and every reachable state"), which is what made prior §5 checkable.

**(c) The prior document's load-bearing argument has no row.** `a229bf7`'s
"The one sentence that matters" (its `:9-40`) - prerequisite BY INCLUSION, not
by sequencing, resting on `docs/owner-decisions-2026-09-23.md` DECISION 6
bullet 2 - gets no disposition row. Its conclusion survives as one clause in
§8 ("This row (G4) does not need its own chunk for Wave A"); its evidence does
not. See M4.

**Disposition: fixable in the one revision.** Add rows for prior §3, prior §5
and the opening argument, and either carry the content or mark it WITHDRAWN
with the enforcer named, per `iteration-caps.md`'s disposal (d).

---

### B4 - R4 hands over the wrong constant: the receiving document ruled 50_000 and explicitly rejected 54_000. NEW.

**Class: a quantity carried from the receiving document's precedent paragraph
after that document's own ruling overrode it.**

`docs/g4-scope.md:349` (R4): "Whether A39's chosen deadline constant (once
Commit 4c ships, **precedent: 54s under 60, per `course-intel/ask/route.ts:145`**)
is generous enough".

`docs/a39-waves.md:1899-1903`, verbatim:

> **Two precedents exist and they disagree by 4 seconds.** `ask/route.ts:145` is `TOTAL_BUDGET_MS = 54_000`. **RULED: follow `class-trends-insight/route.ts`, the file the architecture named as the line-for-line model - `TOTAL_BUDGET_MS = 50_000` with a 2-second reserve.** Both numbers are named here so an implementer does not invent a third.

And the receiving document's own residual says it inherits G4's:
`docs/a39-waves.md:3025` (RES-W-12) - "Whether `TOTAL_BUDGET_MS = 50_000` is
generous enough for a real Gemini grading call ... **Carries g4 R4**".

So the two documents' shared residual disagrees about its own object by 4
seconds, and G4 - the document that OWNS R4 - holds the number the receiver
rejected. This is not cosmetic: 50_000 is the *tighter* budget, so the
direction of failure differs. A39 states it as "an item timing out under the
soft budget that would have completed under the 60s hard cap"; G4's R4 states
the opposite direction ("Fails if real submissions time out at a rate the owner
considers unacceptable") against a looser number. An owner running the one
timed grading run both documents ask for would verify the wrong constant.

Note that this document read `docs/a39-waves.md` §8.4.3 and §8.4.4 carefully and
accurately (see the clean list below) - it verified the receiver's *instrument*
and not the receiver's *constants*.

**Disposition: fixable in the one revision.** R4's object is
`TOTAL_BUDGET_MS = 50_000` per `docs/a39-waves.md:1900-1902`, with
`class-trends-insight/route.ts:47` as the precedent and `ask/route.ts:145` named
as the rejected alternative.

---

### B5 - Wave C's instrument is one clause with no object, no direction of failure, and no statement of whether its file set is derived or frozen. This is the weakest requirement in the document. NEW.

**Class: a pass condition that names one of the three required things.**

`docs/g4-scope.md:386-388`: "Instrument: the stronger
ordering-plus-negative-fixture template from §4/§8.4.3, generalized across the
caller census." That is the whole pass condition for the wave that covers ~60
caller files and 94 of the 127 call sites. `iteration-caps.md` entry gate 2 and
`traps-spec.md` both require object, instrument and direction of failure; Wave
B's entry (`:376-381`) supplies all three, so the omission is not a house style.

Implemented exactly as written it produces a green, useless gate, two ways:

1. **The census is a floor, not the set.** `traps-spec.md` already rules that
   "the orchestrator's enumeration is a FLOOR, never the set. ... Any brief that
   hands over such a list must require the receiver to derive the set with its
   own instrument". "Generalized across the caller census" does not say whether
   the test walks `src` at run time or reads a frozen 62-entry list. A frozen
   list passes forever over a 63rd caller file. §5(X) names this exact mutation
   as (X)'s cost - "a future new caller can still ship unwrapped with every
   existing gate green (nothing greps for 'every `callLlm(` site' as a
   repo-wide rule today)", `:300-302`, which I confirmed: the only such test,
   `fetch.test.ts:627-637`, is scoped to one file
   (`const ASK_ROUTE_PATH = path.join(process.cwd(), "src", "app", "api", "course-intel", "ask", "route.ts")`,
   `fetch.test.ts:602`) - and then never requires the instrument that would
   catch it.
2. **The 200-character proximity idiom the template inherits is satisfiable by
   a comment.** The document diagnoses this correctly for the weaker template
   ("a comment mentioning the wrapper name would satisfy it", `:277`) and then
   points Wave C at a template built on the same proximity slice. A39's own
   fix was to anchor on a call expression rather than a bare string
   (`docs/a39-waves.md:1787-1789`); Wave C inherits the diagnosis and not the
   fix.

**Disposition: a named part that must not be dispatched.** Wave C is not
scopable from this clause. The fix is one revision's work - state the object
(the set of `callLlm(` call sites derived at run time by the test itself), the
instrument (a walker over `src/**/*.{ts,tsx}` excluding `*.test.*`, with the
`callSites.length > 0` presence assertion `fetch.test.ts:634` already carries
so the loop cannot pass vacuously, and an allowlist that may only shrink - the
ratchet shape `docs/a39-waves.md:3028` (RES-W-13) already describes), and the
direction of failure (RED when a call site appears that is not inside a
wrapper argument, including a site in a file no census listed).

---

### B6 - What a platform kill leaves persisted is never traced, and "the promise rejects and we catch it" is never distinguished from "the function is killed and no code runs". NEW.

**Class: the remedy is specified without tracing the state the failure leaves
behind.**

The two failure modes need different remedies:

- `raceWithTimeout` resolves `{kind:"timedout"}`. The handler's own code still
  runs: it can mark the row, return a worded body, release a lock.
- The platform kills the invocation. No code runs at all. Anything written
  before the model call stays exactly as written, with no completion marker and
  no failure marker.

The new document never states the second case in those terms
(`grep -n "catch never runs" docs/g4-scope.md` -> no hit) and never traces a
single write. `grep -n "partial\|persist\|insert\|upsert\|deliverable\|draft" docs/g4-scope.md`
returns three hits, all incidental (`:38`, `:90`, `:176`), none about a write
that precedes a model return.

This app persists on exactly these paths. The precedent the scope itself cites
proves it: three of `ask/route.ts`'s six `withDeadline(` sites wrap a **persist**
(`:491`, `:565`, `:882`, each around `appendCourseIntelAnswer(createServiceClient(), ...)`),
and `MODEL_WAIT_RESERVE_MS = PERSIST_WAIT_MS + 2_000` (`:172`) exists so the
write still has room after the model wait. That is this repo's worked answer to
"what does a kill leave half-written", and the scope reads the file for one
constant and not for that.

The receiving document is also silent here: `docs/a39-waves.md`'s S2b
(`:1940-1985`) specifies the deadline's two watched halves and the JSON error
body, and nothing about a run row written before the item's model call.

**Disposition: fixable in the one revision**, and it is the piece with the most
leverage per line. Name the writes on each in-scope path (the grading run row,
the draft, the workflow deliverable), state for each whether it precedes the
model return, and give a separate remedy per failure mode - a worded outcome
for the wrapper case, and for the kill case the only thing that survives no
code running, which is a write ordering that never leaves a row looking
complete before the model has returned.

---

## MAJORS

### M1 - R1's instrument is the presence-only check §3.3 says proves nothing. Internal contradiction.

R1 (`docs/g4-scope.md:346`): instrument `grep -n maxDuration src/app/api/ai-chat/route.ts`,
direction "RED (still absent) until a fix lands and the grep flips to present".
§3.3 (`:213-214`), quoting the receiving plan: "A presence check on
`maxDuration` proves nothing about whether the handler stops itself first."
R1's stated done-condition is satisfied by adding one `export const
maxDuration = 60;` line to an otherwise unbounded handler - which turns
`ai-chat` into a declared-but-unenforced ceiling, the exact shape §2's table
already flags. `traps-spec.md` names this class: a design that states a
constraint and then violates it in a later section, both halves reading as
correct.

Fix: R1's direction of failure is RED until the route has both a declared
`maxDuration` and an elapsed-aware wrapped call, with the wiring assertion, not
the grep, as the instrument.

### M2 - Two of six residuals have no instrument, and R6 is a deletion for the second consecutive scope.

`iteration-caps.md`: "A residual without an owner, an instrument and a step is
a deletion. Call it that."

- **R3** (`:348`): instrument "Cost comparison in §5, already laid out; needs a
  decision, not a measurement", direction "N/A". A remedy is not an
  instrument. Partly discharged because §5 does put the fork to the owner in
  terminating form - but then R3 is not a residual, it is that question, and
  listing it twice hides that one of the two is empty.
- **R6** (`:351`): instrument `grep -n "signal" src/lib/llm.ts`, direction
  "N/A - this residual IS the filing gap". The instrument measures the
  `AbortSignal` gap; the residual's stated object is the *filing* gap. Those
  are different objects. The filing claim's own evidence is
  `grep -a -rn "generateGeminiImage" docs/backlog.yml docs/BACKLOG.md` - a
  single function name, so a row filed under any other wording reads as absent
  (I confirmed `grep -a -in "generateGeminiImage|image path|gemini image" docs/BACKLOG.md`
  returns nothing, so the conclusion holds today, but the instrument is not what
  establishes it).

R6 is now carried unfiled across two scopes. This document's write set cannot
file it, which is correct - so it is an **orchestrator action**, not a revision
fix: the row goes into `docs/BACKLOG.md` when a writer holds that file, or R6
is withdrawn with a reason.

### M3 - "Three shipped precedents" conflates call sites with instrumented precedents; one of the three has no assertion behind it.

§5(X) (`:302-303`): "it reuses a three-times-proven template"; §4 (`:271-272`):
"proving the pattern generalizes across at least three independent authors
now"; §0 (`:40`): "three real call sites in two `.tsx` files".

The call sites are real - `grep -rn "raceWithTimeout" src --include=*.tsx | grep -v "\.test\."`
-> `announcements-panel.tsx:31,:128` and
`WalkthroughAnnouncementPanel.tsx:36,:303,:358`. The *instrument* covers only
one of the two files: `walkthrough-announcement.structure.test.ts:322-349`
reads `WalkthroughAnnouncementPanel.tsx` and nothing else, and
`grep -n "raceWithTimeout\|EXEMPLAR_FETCH" src/app/components/canvas-tab/announcements-panel.wiring.test.ts`
**exits 1** - `announcements-panel.tsx:128` has no assertion holding its bound
in place. So the third "precedent" is itself an instance of the mutation family
§5(X) admits it cannot catch, and the document counts it as evidence that the
family is covered.

Fix: say two instrumented call sites in one file, and one uninstrumented one -
and note that this is the first observed instance of the unwrapped-caller
mutation, which strengthens B5 rather than weakening (X).

### M4 - No owner decision is cited anywhere, while DECISION 6's purpose is quoted.

`grep -c "owner-decisions" docs/g4-scope.md` -> **0** (exit 1). The document
names "DECISION 6" twice (`:154`, `:334`) and quotes its purpose at `:334`
("the pool can report a per-item failure instead of a whole run dying ...
DECISION 6's own stated purpose") with no citation. The prior version cited
`docs/owner-decisions-2026-09-23.md` DECISION 6 bullet 2 as the load-bearing
premise of its whole argument, and DECISION 2 as the rule binding its §5.

`traps-spec.md`'s 2026-09-27 entry: "check the decisions record FIRST. If a
decision bears on the question, the ORCHESTRATOR rules on the decision". Two
decisions bear directly on this row and neither is cited. `DEV_LOOP.md` is
independently explicit that "every quantity and quoted rule in it names the
command or `file:line` that produced it".

Fix: cite `docs/owner-decisions-2026-09-23.md` DECISION 6 for the purpose
quoted at `:334`, and restore DECISION 2 as the rule binding any user-facing
sentence (which B3(b) reinstates anyway).

### M5 - `docs/loop/leverage.md` is credited with a requirement it does not contain.

`docs/g4-scope.md:328-330`: "stated explicitly per `docs/loop/leverage.md`'s
requirement that a reliability bug name its class honestly".

Read in full, `leverage.md` contains no such requirement. Its one rule is that
"a leverage claim names a mechanism, not a benefit" (`:13`); its failure mode A
(`:71-76`) classifies a bug as one of the shapes "where a leverage claim is
**meaningless**". `DEV_LOOP.md:101-108` scopes the claim to a chunk that
"builds or changes a capability a user reaches - **not a bug fix**". So the
correct disposition is that no leverage claim is owed here - which is what §6
concludes. The conclusion is right; the authority invented for it is not.
`iteration-caps.md` names this class: "an obligation discharged by citing a
document without opening it".

Fix: cite `DEV_LOOP.md:101-108`'s exemption instead of inventing an obligation.

### M6 - Absence claims carry no canary, and one canary the prior version had was dropped.

`traps-spec.md` and `parallel-disjointness.md` both require an absence claim to
be paired with a canary. In this document:

- `grep -n maxDuration src/app/api/ai-chat/route.ts` exits 1 (`:35`, `:150`,
  `:346`). I confirmed the absence. But the prior version explicitly ran the
  canary - "the same grep against `src/app/api/automations/run-now/route.ts`
  returns `:43: export const maxDuration = 60;` - confirmed hit" - and this
  version dropped it while keeping the claim it supported.
- `grep -n gradeAction src/app/components/GradingTab.tsx` returns nothing
  (`:170-171`), used to conclude "it receives the action as a prop". No canary.
  The conclusion is correct - `GradingTab.tsx:57` declares
  `formAction: (payload: FormData) => void;`, `:80-81` destructures
  `formAction, pending`, `:298` is `action={formAction}`, and `page.tsx:63` is
  `const [state, formAction, pending] = useActionState(gradeAction, initialState);`
  - but it is correct by luck of pattern choice, not by a control.
- §0's `raceWithTimeoutZZZ` canary (`:40`) is a *negative* canary showing the
  pattern does not over-match. For the presence claim it supports, the hits are
  their own proof, so this one is adequate - but note it is the wrong shape for
  the absence claims above, which need a positive control under the *same
  filter*.

Fix: restore the positive canary on the `maxDuration` grep and add one for the
`gradeAction` grep.

---

## MINORS

- **m1.** §3 calls A39's pending owner question "unrelated to Commit 4c"
  (`:240-242`) and §8 repeats "(unrelated to Commit 4c)" (`:368-369`). On write
  set that is right and I confirmed it - `docs/a39-waves.md:568` gives 3a-i
  `SnapshotGradingPanel.tsx` plus new leaves under `snapshot-grading/`, `:575`
  gives 4c the route handler, `incrementalRunPlan`, `useIncrementalGradingRun`
  and `GradingTab.tsx`; §4.2's ordering edges put 3a-i before A24, before
  3a-ii (a write collision) and before 3b, never before 4c. But one of the
  three answers, (b) (`docs/a39-waves-rulings.md`, "`.ts` leaves with
  oracles"), says in terms that "the feature waits on a larger restructuring of
  a 989-line panel" - which delays 4c and therefore G4's Wave A. "Unrelated" is
  too strong; "does not intersect 4c's write set, but answer (b) delays it" is
  the accurate form.
- **m2.** §4 (`:268-270`) describes
  `walkthrough-announcement.structure.test.ts`'s G1 block as three assertions
  ("import presence, `Promise.all(` nesting, and a shared-constant count
  assertion"). It has **four**: `:329` import, `:337` `Promise.all` nesting,
  `:341` the `loadSavedExemplars`-body-scoped site, `:349` the shared-constant
  occurrence count. `docs/a39-waves.md:1957-1961` states four. Understates the
  precedent it is arguing for.
- **m3.** Two evidentiary claims rest on `docs/backlog.yml` (`:32` for R6's
  filing gap, `:93-95` for `id: 'G1'`). `DEV_LOOP.md:18` names
  `docs/BACKLOG.md` as the durable record; and `docs/BACKLOG.md` currently has a
  live sibling writer (` M docs/BACKLOG.md`, see the tree state below), so a
  measurement over it is unstable without saying at which commit it was taken.
  The G1 half is independently corroborated by
  `docs/REGRESSION.md:41879` ("## 415. G1: the exemplar fetch gets a bound, and
  four facts stop being two booleans", confirmed with `grep -a -n`) and by the
  `// Bounded per G1` comment the document cites, so the conclusion stands.
- **m4.** §1's "new finding" that `withDeadline` has a third caller
  (`:62-77`) is correct - `grep -rln "withDeadline(" src --include=*.ts --include=*.tsx | grep -v "\.test\."`
  returns `class-trends-insight/route.ts`, `course-intel/ask/route.ts`,
  `src/lib/course-intel/cross-course.ts`, and dropping the include flags
  entirely returns the same three. But the document reports it as a *file*
  count finding and misses the more consequential per-file count: `ask/route.ts`
  alone holds six `withDeadline(` sites, which is the evidence for B1.

---

## Disposition-table audit

Audited before reading the new round on its own terms, per
`iteration-caps.md` entry gate 3.

**Rows: 19** (`docs/g4-scope.md:30-48`). Tally by disposition: KEPT 16
(including the three Wave/Residual rows at `:46-48`), HANDED OVER 2 (`:41`,
`:45`), WITHDRAWN 1 (`:40`). The document states no counts of its own, so
there is no count error of the kind a sibling table shipped today.

**Forward direction: clean.** All 19 rows trace to a real requirement in
`git show a229bf7:docs/g4-scope.md`. No fabricated row, no row attributing to
the prior document something it did not say. I re-verified every citation in
the Detail cells that names a `file:line`; all of the following are exact:
`llm.ts:16, :22, :375-378, :401, :452, :457-462, :482, :608, :617-622, :718, :757`;
`engine.ts:38, :82, :186, :416, :471, :487`; `page.tsx:1, :6, :63, :543`;
`ai-chat/route.ts:647`; `bounded-race.ts:20-24, :26-29, :31-`;
`fetch.ts:316-325`; `fetch.test.ts:627-637`; `class-trends-insight/route.ts:33`;
`course-intel/ask/route.ts:134, :145`;
`steps.grading-run.ts:474` / `-draft-flow.ts:261` / `-cartridge.ts:100`;
`cron/run-schedules/route.ts:56`; `a29-architecture.md:285` (OC5, "Repo owner",
"The design does not depend on the answer");
`a39-waves.md:2416` (`-le 260`), `:3015` (RES-W-2), `:3016` (RES-W-3);
`REGRESSION.md:41879`. The census figures reproduce exactly: **127** raw sites,
**64** files, **2** comment-prefix matches, floor **125 / 62**, all by the
commands the document prints. `class-trends-insight/route.ts` is **187** lines
by both counters (`wc -l` -> 187; `@(Get-Content ...).Count` -> 187), matching
the ceiling derivation it quotes. The §2 citation-drift finding about
`learning-resources-generator.ts:229` is correct: that file's `callLlm(`
occurrences are `:187` and `:498`, and both files the backlog row named are
still callers (`learning-resource-links.ts:269, :338`).

**Backward direction: three defects, all in B3.** One prior section (§3, six
rows plus a standing rule) has no row at all; one row (`:43`) asserts KEPT for
prior §5 while the new text carries none of it; one row (`:33`) asserts
"KEPT, re-cited" while dropping the retry-budget arithmetic that was the
paragraph's substance. The prior document's opening argument also has no row.
§0's "Nothing was dropped" is therefore false as a claim about requirements,
though true as a claim about rows.

**The WITHDRAWN row is sound.** `iteration-caps.md` disposal (d) requires
naming any enforcer the withdrawn requirement protected; there was none, and
§4a-r supplies the replacement fact. I reproduced the whole discrepancy:
`--include=*.ts` alone returns `bounded-race.ts` only; adding
`--include=*.tsx`, or dropping the include flags entirely, returns the two
`.tsx` files as well. This correction is the document's best work.

**The HANDED-OVER rows are legal relocations, with one caveat and one
correction.** `iteration-caps.md`'s corollary - a requirement cannot be
relocated to an artifact that does not exist yet - is satisfied: the receiver
`docs/a39-waves.md` exists (3083 lines, `wc -l`), commit `9050475` with exactly
the message the scope quotes. The *enforcer* does not exist
(`ls src/app/api/grade-run-item/route.ts` -> exit 2;
`find src -iname "*grade-run-item*"` -> no output), and the document says so
plainly and twice ("**still unshipped**", "**It has not shipped.**"). §3's
description of the receiving instrument is accurate: three
presence-then-comparison checks at `docs/a39-waves.md:1783-1810`, four negative
fixtures F1/F1b/F2/F3 at `:1820-1832`, the `raceWithTimeout` ruling at
`:1911`-ff. The caveats are B4 (the constant) and B1's second instance (Check 3
does not encode the requirement it is credited with).

---

## Closing the stall the scope left open

The scope declined to audit the receiving document's dependency chain and said
so; that boundary is defensible, and here is the answer.

**A39's pending owner question does not block Commit 4c by write set or by
ordering.** The question (`docs/a39-waves-rulings.md`, "TO THE OWNER - one
terminating question") is about wave **3a-i**'s extraction shape:
(a) `.tsx` components with no oracle, (b) `.ts` leaves with oracles, (c) ship
without the extraction. 3a-i's write set is `SnapshotGradingPanel.tsx` plus new
leaves under `src/app/components/snapshot-grading/`
(`docs/a39-waves.md:568`); 4c's is the new route handler, `incrementalRunPlan`,
`useIncrementalGradingRun` and `GradingTab.tsx` (`:575`). Disjoint. §4.2's
ordering edges are 3a-i before A24, 3a-i and 3a-ii (a write collision on
`snapshot-autofire.structure.test.ts`), 3a-i before 3b (a ceiling gate at 989 /
990), and 3a-i concurrent with wave 1. **No edge puts 3a-i before 4c.**

**But the question does block the dispatch, and G4's Wave A with it** - which
G4 states correctly. Per `AGENTS.md`, the plan ships as it stands once the
answer arrives, so the gate is the answer, not the extraction. The one
overstatement is calling the question "unrelated to Commit 4c": answer (b)
explicitly makes the feature wait on a larger restructuring (m1).

So Wave A is blocked on an answer that is already correctly escalated in
another document, and G4 does not hide that.

---

## What is dispatchable as it stands

- **Wave B** (`src/lib/llm.ts`, the two `catch` blocks at `:457-462` and
  `:617-622`). Pass condition carries all three required parts. The only thing
  to fix is its sequencing clause, which says "sequenced before Wave C **only
  if** Wave C's fork resolves to (Y)" (`:381-382`) while the prior version and
  `docs/a39-waves.md:3017` (RES-W-3) both read "before any signal threading" -
  same thing, and the scope's own §5 already states the consequence. Small
  enough to land with the revision.
- **Wave A's hand-over**, once R4's constant is corrected (B4). Nothing else in
  the hand-over needs G4 to move.
- **The §5 fork**, which is well formed: two named options, a recommendation,
  and a stated consequence of picking (Y). It is consistent with RULING 75 - §5
  recommends (X), per-caller wrapping, and every wave in §8 is written in that
  shape. **Not reopened here.**

**Not dispatchable: Wave C**, on B1 and B5.

---

## What remains, and the one question for the owner

**Stopping point: design.** All six blockers are design or measurement defects
inside this document's own write set and are fixable in the one revision - none
of them lands on an orchestrator ruling, and RULING 75 is untouched and
uncontradicted by the waves. The one thing a revision cannot settle is the
residual that has now crossed two scopes without a row, because this
document's write set cannot reach `docs/BACKLOG.md`:

> **R6 - the `generateGeminiImage` gap (`src/lib/llm.ts:757`), a second
> unbounded transport that shares the retry loop and reaches no `callLlm`
> census. It has been recorded as a residual in two consecutive G4 scopes and
> filed as a row in neither, and `docs/DEV_LOOP.md` step 0 rules that this makes
> it a deletion. This produces X or Y: (X) it becomes its own backlog row, filed
> by whoever holds `docs/BACKLOG.md`, with the same elapsed-aware budget rule
> B1 puts on the text path; or (Y) it is WITHDRAWN, with "the image path is not
> bounded and no one owes it" recorded as the accepted state and the enforcer it
> protected named as none. Either answer ends it. What it must not be is a
> third residual entry.**

Cost of being wrong: (X) costs one row and a future small wave; (Y) leaves one
unbounded model transport on an image path whose blast radius nobody has
measured - `generateGeminiImage` is exported directly (`llm.ts:757`) and is
outside every count in this document.

---

## Tree state at the end of this pass

```
git status --short
```

```
 M docs/BACKLOG.md
 M docs/a17-discovery.md
 M docs/a19-scope.md
 M docs/a19-ux-pass.md
 M docs/a21-instrument-notes.md
 M docs/a21-scope.md
 M docs/a24-a32-check.md
 M docs/a24-a32-waves.md
 M docs/a24-a39-sequencing.md
 M docs/a32-build-check.md
 M docs/a32-build-rulings.md
 M docs/a32-check-round2.md
 M docs/a32-scope.md
 M docs/css-orphans.md
 M docs/owner-decisions-2026-09-23.md
```

Every entry above is **sibling-owned** - the citation re-pinning pass named in
this pass's brief, plus the pre-existing `docs/css-orphans.md`. This pass's own
entry is `docs/g4-check.md` (new, untracked at the time of the run above).
`docs/g4-scope.md` is unmodified, and no file under `src/`, no test file, and
no `docs/a39-*`, `docs/a41-*` or `docs/l9-*` file was opened for writing. No
`git stash`, no `git add -A`, no `git checkout --` was run. The prior scope was
read from a scratchpad copy produced by `git show a229bf7:docs/g4-scope.md`, not
by checking anything out.
