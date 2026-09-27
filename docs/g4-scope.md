# G4 scope, REVISED against `docs/g4-check.md` (committed `19d5d0c`) — the one revision available

**This is a revision, not a second restructuring.** The prior round
(`docs/g4-scope.md` as committed at `6e326dc`, 416 lines by `wc -l` on that
commit per the check) was checked at `docs/g4-check.md`, VERDICT "BUILDABLE IN
PART", 6 blockers / 6 majors / 4 minors. Per `AGENTS.md` "Two rounds, then ask"
and `docs/loop/iteration-caps.md`, this is round 2 of this activity, and there
is no round 3: everything the check classified as fixable here is fixed below;
nothing is deferred to a third round. Three rulings from the orchestrator
apply and are threaded through the fixes rather than listed once and ignored:

- **RULING 76** — the budget is elapsed-aware and per-invocation, not a fixed
  constant per caller. Section 6 below is new and is the shape every other
  section now builds on.
- **RULING 77** — the `TOTAL_BUDGET_MS` disagreement is settled in the
  receiver's favour: `50_000` with a 2-second reserve, per
  `class-trends-insight/route.ts`. Fixed in R4 and Wave A below; the rejected
  number is named so nobody invents a third.
- **RULING 78** — the image-path residual (R6) becomes its own backlog row,
  filed by the orchestrator, not by this document. R6 below is marked HANDED
  OVER and dropped from this document's list of things it still carries.

Every fix below is cited to the exact blocker/major/minor it closes, and every
quantity re-used from the check was re-measured directly against the tree in
this pass (commands shown), not copied from the check's prose.

---

## 0. Disposition table

The check's B3 found the forward direction clean (every row here traces to a
real prior requirement) and the backward direction broken (a whole prior
section, and part of a second, had no row). Both directions are fixed below:
three new rows restore what B3 found missing, and the §5 row's Detail cell now
points at restored content instead of one citation.

| Prior requirement (`a229bf7`, or the round-1 restructuring `6e326dc`) | Disposition | Detail |
|---|---|---|
| §1 `callLlm` shape, zero `AbortSignal`, `generateGeminiImage` out of census (R6) | KEPT | Unchanged from round 1; re-confirmed nothing moved between rounds (no commit touched `src/lib/llm.ts` between `6e326dc` and this pass). |
| §1 `AbortError`-retried-as-transient bug (Wave B) | KEPT | Unchanged; retry constants now also carried into §6 below (B1). |
| §2 127/64 census, comment-prefix floor 125/62 | KEPT | Re-run this pass, identical: see §2. |
| §2 `"use server"` split: 52 action-file callers, of which some carry the directive | **KEPT, numbers corrected** | Round 1 stated 52/48/"5 leaf helpers", which B2 found internally contradictory (52-48=4, not 5) and measured with an instrument that matches a doc comment. Corrected to 52/46/6 in §2 below with the correct instrument and the sixth file named. |
| §2 Route Handler table (`ai-chat` unwrapped, two wrapped) | KEPT | Unchanged. |
| §2 grading engine call chain, 3 caller files | KEPT | Unchanged. |
| §2 attended path (`page.tsx:63`, OC5 open) | **KEPT, canary restored** | M6 found the `gradeAction`-absence claim about `GradingTab.tsx` had no positive canary. Restored in §2. |
| §2 unattended path (3 workflow-registry steps, shared 60s tick) | **KEPT, given its own sizing rule** | B1 found no wave carried a sizing rule for this shared-ceiling population. §6 below names `repoGradingStopAt` and gives the rule. |
| §3 (round 1) "What A39's own wave plan has done with Wave A" | **KEPT, one overclaim fixed** | B1's second instance: the credit given to A39 Check 3 ("turned into an executable, static assertion" of round 1's §4b requirement) overstated what Check 3 covers. Fixed below — Check 3 covers ordering, not the reserve or the pre-race elapsed time. |
| §4 stronger wiring-test template (ordering-plus-negative-fixture) | KEPT | Unchanged; still the template Wave C's corrected instrument (B5) builds on. |
| §5 (round 1) "The fork, restated" | **KEPT, rebuilt on §6** | The fork's two options are unchanged in kind; option (X)'s mechanism is corrected from a fixed per-caller constant to the elapsed-aware shape in §6, per RULING 76. |
| §6 (round 1) Leverage | **KEPT, authority corrected** | M5: the requirement cited to `docs/loop/leverage.md` is not in that file. Re-cited to `DEV_LOOP.md:101-108`'s bug-fix exemption below. |
| §7 (round 1) Residual register | **KEPT, three rows corrected, one handed over, three added** | R1 (M1), R4 (B4/RULING 77) corrected; R6 (RULING 78) HANDED OVER; three new residuals added for B6 (write ordering) below. |
| §8 (round 1) Wave plan | **KEPT, Wave C rewritten** | Wave A's constant fixed (B4); Wave C's pass condition rewritten in full (B5) and now carries the shared-ceiling and write-ordering scope B1/B6 found missing. |
| **`a229bf7` §3 — "What the platform actually does today, per call site"** (six-row Declared-ceiling/Effective-bound table, its DECISION-6 row, and the standing rule "do not treat 'platform default' as a known number anywhere in this document") | **RESTORED — B3(a)** | This entire prior section had no row in round 1's table and no successor content. Round 1's §2 Route Handler table is a different object (`maxDuration`/"Wrapped?", not effective bound) and has three rows where this had six. Restored as new §3 below, verbatim in substance, re-cited. |
| **`a229bf7` §5 — user-facing failure descriptions for wrapped vs. unwrapped Route Handlers, and for `ai-chat`** | **RESTORED — B3(b)** | Round 1's disposition row said KEPT but the new text carried only a citation (`ai-chat/route.ts:647`), not the substance: that on a platform kill the handler's own `try`/`catch` never runs (the row's defining sentence), that Gemini's `:generateContent` is non-streaming so there is no partial output to salvage, the per-student-vs-per-run distinction, the `GradedResult \| UngradedResult` union, and DECISION 2's binding rule. Restored as new §5 below with the correct citations. |
| **`a229bf7`'s opening argument — "The one sentence that matters"** (prerequisite by INCLUSION not sequencing, resting on `docs/owner-decisions-2026-09-23.md` DECISION 6 bullet 2) | **RESTORED — B3(c)/M4** | Its conclusion survived into round 1's §8 as one clause ("this row does not need its own chunk for Wave A"); its evidence — the DECISION 6 bullet 2 quotation and citation — did not. Restored in §4 below with the citation. |

**Both directions are now covered.** Forward: every row above traces to a real
prior requirement (round 1's forward audit was already clean per the check,
and nothing in this revision invents a row). Backward: the three restored rows
above are the ones B3 found missing; no other prior section is uncovered
(checked by re-reading `a229bf7`'s own section headings — 1 through 7 plus the
opening argument — against this table, all eight present).

---

## 1. What is actually true right now (unchanged from round 1, re-confirmed)

`callLlm` (`src/lib/llm.ts:375`) has one branch (`callGemini` ->
`postGenerateContent`/`postInteraction` -> `fetch`), no `AbortSignal`
parameter, and `grep -n "AbortSignal\|AbortController\|signal\|setTimeout\|timeout" src/lib/llm.ts`
today returns the same two lines as every prior pass: `:401` (`sleep()`) and
`:718` (unrelated prose). `generateGeminiImage` (`:757`) remains outside the
`callLlm(` census — see §9 R6 below for its disposition under RULING 78.

**`withDeadline` has a third caller**, `src/lib/course-intel/cross-course.ts`,
confirmed again this pass
(`grep -rln "withDeadline(" src --include=*.ts --include=*.tsx | grep -v "\.test\."`
-> `class-trends-insight/route.ts`, `course-intel/ask/route.ts`,
`src/lib/course-intel/cross-course.ts`). Out of the Route Handler table below
because it wraps a Server Action's internal fetch, not a Route Handler.

### 1a. `raceWithTimeout`'s real production callers (unchanged)

`grep -rln "raceWithTimeout" src --include=*.ts --include=*.tsx | grep -v "\.test\."`
-> three sites in two `.tsx` files: `announcements-panel.tsx:128`,
`WalkthroughAnnouncementPanel.tsx:303,:358`. Both wrap a Supabase row read
(`src/app/actions/walkthrough-announcement.ts:117-148`), not a `callLlm`
call — confirmed by opening both actions directly. **So `raceWithTimeout` has
production precedent and a proven wiring-test template, but still zero
callers that bound a `callLlm` invocation.** This is the fact M3 below
corrects the strength of, not the fact itself.

---

## 2. The call graph (unchanged census, use-server split corrected — B2)

Re-run this pass, identical to every prior run:

```
grep -rn "callLlm(" src --include=*.ts --include=*.tsx | grep -v "\.test\." | wc -l   -> 127
grep -rln "callLlm(" src --include=*.ts --include=*.tsx | grep -v "\.test\." | wc -l  -> 64
```

Comment-prefix proxy, same command as every prior pass:

```
grep -rn "callLlm(" src --include=*.ts --include=*.tsx | grep -v "\.test\." | grep -E "^[^:]+:[0-9]+:\s*(//|\*)"
```

returns the same 2 lines (`llm.ts:16`, `knowledge-overview-prompt.ts:9`), so
the honest floor is still **125 real call sites across 62 real caller
files**.

**`"use server"` split, corrected (B2).** Round 1 measured this with a bare
`grep -l '"use server"'`, the exact class of defect §1a's own comment-prefix
proxy exists to prevent — a line-text match cannot tell code from the comment
that explains its absence. Fixed with the same first-line instrument §1a
already validates elsewhere in this document:

```
grep -rln "callLlm(" src --include=*.ts --include=*.tsx | grep -v "\.test\." | grep "src/app/actions/" | wc -l
```
-> **52** action files hold at least one `callLlm(` call, unchanged from every
prior pass.

```
for f in <those 52>; do head -1 "$f" | grep -q '^"use server";' && echo "$f"; done | wc -l
```
-> **46** carry the directive on their first line.

```
for f in <those 52>; do head -1 "$f" | grep -q '^"use server";' || echo "$f"; done
```
-> **6**, not 5: `current-events-assignment-generator.ts`,
`intro-discussion-generator.ts`, `learning-resources-generator.ts`,
`module-objectives-generator.ts`, `shared.ts`, and **`slide-graphics-repair.ts`**
— added by `d7877db` (`git log --oneline -1 -- src/app/actions/slide-graphics-repair.ts`
-> that one commit), a leaf LLM helper for the deck-graphics repair pass
(opened directly: it makes one narrowly-scoped `callLlm` call per offending
slide and is invoked from `course-planning-grounding.ts`, not called
directly by a client). No prior pass named it. 52 - 46 = 6, which now agrees
with both the subtraction and the inverted loop — the internal contradiction
B2 found (52 - 48 = 4, stated as 5) is gone.

**Why this matters for Wave C (B2's stated reason, unchanged):** the
leaf/action split is how Wave C's caller population is drawn. A sixth leaf
helper no prior pass has classified is a Wave C caller nobody has counted —
Wave C's instrument in §7 below derives the population at run time for
exactly this reason, rather than trusting this or any other document's count
as the set.

**One citation-drift finding, unchanged from round 1, not a factual
reversal.** The backlog row (`docs/BACKLOG.md:95`, read via `grep -a -n "G4"
docs/BACKLOG.md` this pass) cites `learning-resources-generator.ts:229` as a
reachable path; today that file's `callLlm(` occurrences are at `:187` and
`:498` — ordinary line drift, not evidence the row is wrong. Both files the
backlog row names are still callers today: `learning-resource-links.ts`
(`:269`, `:338`) and `learning-resources-generator.ts` (`:187`, `:498`).

### Route Handlers (of the 64 files, 3 relevant to this row's platform-ceiling comparison)

| Route Handler | `maxDuration` | Wrapped? |
|---|---|---|
| `src/app/api/ai-chat/route.ts` | **absent** — `grep -n maxDuration src/app/api/ai-chat/route.ts` exits **1** this pass, read directly from the command, not through a pipe. **Positive canary restored (M6):** the same grep against `src/app/api/automations/run-now/route.ts` returns `:43: export const maxDuration = 60;` — confirming the pattern the absence claim depends on actually fires when the line is present, not just that this one file happens to lack it. | **No.** `callLlm` called bare at `:647`. |
| `src/app/api/class-trends-insight/route.ts` | `:33`, `= 60` | Yes, `withDeadline`; `TOTAL_BUDGET_MS = 50_000` at `:47`, `MODEL_WAIT_RESERVE_MS = 2_000` at `:51` — the shape §6 below generalizes. |
| `src/app/api/course-intel/ask/route.ts` | `:134`, `= 60` | Yes, `withDeadline`, **six** call sites (`:426,:491,:565,:621,:828,:882`, `grep -n "withDeadline(" src/app/api/course-intel/ask/route.ts`), `TOTAL_BUDGET_MS = 54_000` at `:145` — the number RULING 77 says is named and rejected, not adopted (§9 R4). |

### The grading engine (the path DECISION 6 / A39 touches) — unchanged

`src/lib/grade/engine.ts`: `gradeSubmission` (`:38`, bare `callLlm` at `:82`)
-> `gradeStudentEntries` (`:186`) -> `gradeSubmissions` (`:416`),
`gradeEntries` (`:471`), `gradeCanvasUrl` (`:487`). Three caller files:
`github-repos.ts`, `github.ts`, `grading.ts`.

- **Attended:** `page.tsx:63`, `useActionState(gradeAction, initialState)`.
  `page.tsx:1` is `"use client"`; no `maxDuration` is declarable here. OC5
  (`docs/a29-architecture.md:285`) still open.
  **Wiring canary restored (M6):** round 1's claim that `GradingTab.tsx`
  "receives the action as a prop" (`grep -n gradeAction
  src/app/components/GradingTab.tsx` returns nothing, confirmed this pass —
  exit 1, read directly) was correct but had no positive control. Confirmed
  directly this pass: `GradingTab.tsx:57` declares
  `formAction: (payload: FormData) => void;` in its props type, `:80-81`
  destructures `formAction, pending`, `:298` is `action={formAction}`, and
  `page.tsx:63` is exactly `const [state, formAction, pending] =
  useActionState(gradeAction, initialState);` — the prop IS the same
  `formAction` `useActionState` returns, traced end to end, not inferred from
  the grep's absence alone.
- **Unattended:** `steps.grading-run.ts:474`, `steps.grading-draft-flow.ts:261`,
  `steps.grading-cartridge.ts:100`, all still carrying the identical "N13a
  Ruling 1/2" comment. `cron/run-schedules/route.ts:56` still
  `maxDuration = 60`. **This population's sizing rule is §6 below, not a
  per-caller constant** — see §3's restored table and §6.

---

## 3. What the platform actually does today, per call site — RESTORED (B3(a))

Round 1's §2 Route Handler table is not this table; it answers a different
question (declared config vs. code-observed shape). This is the prior
document's own six-row table, dropped in the round-1 restructuring, restored
here because it is the object OC5 and the shared-ceiling rule both need.

Nothing below is a live timing measurement — `docs/loop/this-repo.md` section
6: no `.env`, no live key, no network under `vitest`; every figure here is a
declared config value read from source.

| Call site | Declared ceiling | Effective bound |
|---|---|---|
| `course-intel/ask/route.ts` | `maxDuration = 60` (`:134`) | Self-imposed 54s (`TOTAL_BUDGET_MS`, `:145`), enforced by `withDeadline` — but see RULING 77 (§9 R4): this is the number the receiving plan named and rejected, not the one it adopted. |
| `class-trends-insight/route.ts` | `maxDuration = 60` (`:33`) | `TOTAL_BUDGET_MS = 50_000` (`:47`), `MODEL_WAIT_RESERVE_MS = 2_000` (`:51`) — the shape §6 generalizes and the number RULING 77 adopts. |
| `ai-chat/route.ts` | none declared | UNCONFIRMED Route Handler platform default. Vercel's public docs state 10s as the Hobby default for an unconfigured function, but this repo has never measured that figure itself — **so it is UNVERIFIED here, not 10s as a fact of this repo.** |
| `page.tsx` (attended grading) | none (client component, cannot declare) | UNCONFIRMED (OC5, `a29-architecture.md:285`, still open). |
| `steps.grading-run.ts` / `-draft-flow.ts` / `-cartridge.ts` (unattended grading) | `maxDuration = 60` on the containing tick (`cron/run-schedules/route.ts:56`) | A SHARED, shrinking remainder of that 60s via `repoGradingStopAt`, not a per-call budget — §6 gives this population its sizing rule. |
| The other ~58 caller files (Server Actions with no workflow-step path) | none available (client-invoked Server Action) | UNCONFIRMED, same as `page.tsx`. |

**DECISION 6's per-item Route Handler, once built, adds a row identical in
shape to the first two:** `maxDuration = 60` declared, and — if this row's
requirement is honoured — a self-imposed budget under it enforced in code. If
not honoured, the new row looks like the `ai-chat` row instead.

**The standing rule this table protects, restored verbatim:** **do not treat
"platform default" as a known number anywhere in this document; it is not
measured in this repo.** `DECISION 6`'s own preamble
(`docs/owner-decisions-2026-09-23.md`, "The question was what the unconfigured
Server Action duration ceiling actually is ... with the recommendation to stop
depending on the answer") is the owner choosing to stop NEEDING that answer
for the per-item call, not an answer to it.

---

## 4. What A39's own wave plan has done with G4's Wave A (B1's second instance fixed)

Unchanged from round 1 except the one overclaim B1 flagged. `docs/a39-waves.md`
(commit `9050475`) independently re-derived G4's Wave A requirement, named the
exact file (`src/app/api/grade-run-item/route.ts` — does not exist yet,
`ls src/app/api/grade-run-item/route.ts` exits **2**, `find src -iname
"*grade-run-item*"` returns nothing, exit 0 with empty output, both re-run
this pass), adopted `raceWithTimeout`, and built three presence-then-comparison
checks (`docs/a39-waves.md:1785-1806`), each with its own negative fixture
(F1/F1b/F2/F3, `:1817-1832`).

**Overclaim, fixed.** Round 1's §3.3 credited Check 3 as "precisely this
document's own §4b requirement ... turned into an executable, static
assertion." Check 3, verbatim at `docs/a39-waves.md:1798-1801`, asserts that
`TOTAL_BUDGET_MS` parsed from source is **strictly less** than
`maxDuration * 1000`. That is real and it is the clause that matters
(`docs/a39-waves.md:1802-1806`: "A presence check on `maxDuration` proves
nothing about whether the handler stops itself first"). **It does not cover
two things §6's remainder-computation depends on**: the RESERVE (whether
`TOTAL_BUDGET_MS` leaves enough room after the model call for persisting and
responding — Check 3 only compares two constants, it cannot see
`MODEL_WAIT_RESERVE_MS`), and the PRE-RACE elapsed time (`requireUser()`'s
Supabase round trip and `req.json()` of a body A39's own plan budgets at
~4.5MB, `docs/a39-waves.md:3014`, both of which happen before `startedAtMs` is
read in every existing precedent — so `remainingMs` at the first call is
already smaller than `TOTAL_BUDGET_MS` by whatever those two steps cost, and
Check 3 asserts nothing about that gap). Stated once here so no later section
re-credits Check 3 with more than it does.

**Wave A obligation: HANDED OVER, not withdrawn, still unshipped.** No file
exists at the target path. A39's own wave plan is separately blocked on a
pending owner question about wave 3a-i's extraction shape — three readings,
(a) `.tsx` components with no oracle, (b) `.ts` leaves with oracles, (c) ship
without the extraction (`docs/a39-waves-rulings.md`, "TO THE OWNER — one
terminating question"). **Corrected framing (m1):** by write set and by
`a39-waves.md`'s own ordering edges, 3a-i's file set
(`SnapshotGradingPanel.tsx` plus new leaves under `snapshot-grading/`,
`docs/a39-waves.md:568`) does not intersect Commit 4c's
(`docs/a39-waves.md:575`), so "unrelated to Commit 4c" is the right claim
about the WRITE SET. It is too strong as a claim about the SCHEDULE: one of
the three candidate answers, (b) "`.ts` leaves with oracles"
(`docs/a39-waves-rulings.md`), states in terms that the feature waits on a
larger restructuring of a 989-line panel — which delays 4c even though 4c's
files are untouched by it. The accurate form is: does not intersect 4c's
write set, but answer (b) delays it.

---

## 5. What the user sees when a call is cut short — RESTORED (B3(b))

Round 1's disposition row said KEPT for this content and carried only a
citation; the substance was gone. Restored here, re-cited against today's
tree.

**The rule that binds every sentence below**, per
`docs/owner-decisions-2026-09-23.md` DECISION 2 (`:41-60`, citing A31 Ruling 1):
**a sentence may assert only what holds on every caller and every reachable
state.** This is what makes the three paragraphs below checkable rather than
narrated.

**A39's per-item Route Handler, WITH the wrapper (§6's shape):** the pool's
fetch gets a normal HTTP response carrying `{ error: "<label> did not finish
within N seconds" }` (the shape `withDeadline`'s own rejection message
already uses, `fetch.ts:319-320`) — not a hung connection, not a raw
transport failure. The pool can then do what the grading engine's own
`GradedResult | UngradedResult` union already models (N13a, shipped
`7c409a6`): mark this one student not-graded with a stated reason and
continue. **What is NOT preserved:** any partial text from the timed-out
call. Gemini's `:generateContent` endpoint is non-streaming
(`postGenerateContent` awaits one full JSON response, `llm.ts:475`) — there is
no partial output to salvage, so "no partial work preserved" is true for that
one student's attempt and is a DIFFERENT claim from "no partial work
preserved for the run", where every already-completed student's result is
untouched because each is its own Route Handler invocation. The honest
sentence: *this one student was not graded because the call did not finish in
time; every other student's result in this run is untouched.*

**The same Route Handler WITHOUT the wrapper:** whatever the platform does at
60s — a raw connection drop, no `{error}` body, nothing the pool's own
`try`/`catch` can distinguish from a network failure on its own connection.
**This is the sentence B3(b) found missing and restores as the row's own
defining claim** (`docs/BACKLOG.md:95`: "when the platform kills the
invocation the action's own catch never runs"): the promise rejecting and
being caught, versus the function being killed with no code running at all,
are two different failure modes that need two different remedies — the first
is a worded outcome the pool can report, the second is *nothing runs*, so the
only thing that can help is what was already durably written before the kill
(§6.3 below).

**`ai-chat/route.ts` today:** no `maxDuration`, no wrapper — an instructor
mid-conversation who hits a slow call sees whatever the platform's
unconfigured default produces, unmeasured in this repo (§3). Recorded as R1
below, corrected per M1.

---

## 6. The elapsed-aware budget: the shape every wave uses (RULING 76)

**This is the section that closes B1.** Round 1's recommended Wave C shape —
`raceWithTimeout` per call site, sized against a fixed constant
(`TOTAL_BUDGET_MS` at the precedent's line) — is arithmetically incoherent
wherever one invocation contains more than one bounded call, and that is the
*common* case in this tree, not an edge case.

### 6.1 Why the fixed-constant shape fails, measured against the real population

```
grep -rn "callLlm(" src --include=*.ts --include=*.tsx | grep -v "\.test\." \
  | cut -d: -f1 | sort | uniq -c | awk '$1>=2' | wc -l
```
-> **31** caller files hold two or more `callLlm(` sites (of 94 of the 127 raw
sites, `awk '$1>=2{s+=$1} END{print s}'` on the same pipeline). The five
densest: `src/app/actions/llm-content.ts` **8**, `research.ts` **6**,
`media.ts` **6**, `llm-tools.ts` **6**, `current-events.ts` **5**
(`sort -rn | head -5`). A fixed 50-54s constant handed to a wrapper at each of
`llm-content.ts`'s eight sites gives that one file eight independent
50-plus-second budgets inside one invocation whose ceiling is at most 60s.
**Every wrapper after the first would fire after the platform kill.** That is
exactly the "buys nothing" failure this row exists to prevent, reintroduced by
handing a fixed constant to a per-call wrapper.

### 6.2 The shape that works, already built and shipping in this repo

`course-intel/ask/route.ts` — the file round 1 cited as its budget precedent —
does **not** hand `TOTAL_BUDGET_MS` to the wrapper at each of its six
`withDeadline(` sites (`:426,:491,:565,:621,:828,:882`). It records ONE start
time and computes a remaining-time budget at each call:

- `:297` `const startedAtMs = Date.now();`
- `:421` / `:820` `const remainingMs = startedAtMs + TOTAL_BUDGET_MS - Date.now();`
- `:422-424` / `:821-823` `Math.min(MODEL_WAIT_MAX_MS, Math.max(MODEL_WAIT_MIN_MS, remainingMs - MODEL_WAIT_RESERVE_MS))`
- `:172` `const MODEL_WAIT_RESERVE_MS = PERSIST_WAIT_MS + 2_000;` (`PERSIST_WAIT_MS = 4_000` at `:168`)

`class-trends-insight/route.ts` is the same shape at a single call site:
`TOTAL_BUDGET_MS = 50_000` (`:47`), `MODEL_WAIT_RESERVE_MS = 2_000` (`:51`),
remainder computed at `:143-144`.

**The rule, stated once and applied everywhere below:** for any invocation
that may make one or more bounded model calls, record ONE `startedAtMs` at
invocation entry. Each call's own wait is `remainingMs = startedAtMs +
TOTAL_BUDGET_MS - Date.now()`, clamped to `[MODEL_WAIT_MIN_MS,
MODEL_WAIT_MAX_MS]`, minus a `MODEL_WAIT_RESERVE_MS` sized to what the code
still has to do after the model returns (parse, persist, respond) before the
invocation ends. **The multi-site file is the shape to design for — the
single-site file (`class-trends-insight/route.ts`) is the degenerate case of
the same function, where `remainingMs` is only ever computed once because
there is only one call.** A fixed literal is never correct, even for a
single-site caller: the function costs nothing extra to write and does not
silently become wrong the day a second call site is added to that caller
without anyone revisiting the wrapper.

### 6.3 The retry loop is inside the budget, not a separate accounting (B1)

`llm.ts:396` `MAX_ATTEMPTS = 5`, `:398` `MAX_DELAY_MS = 10000`. The comment at
`:393` ("~0.6 + 1.2 + 2.4 + 4.8 ~= 9s ... still far under the 60s Vercel
function cap") covers only the no-`Retry-After` case; the loop honours
`Retry-After` and `MAX_DELAY_MS` permits up to four delays of 10s each — up to
~40s of backoff alone, before the fifth attempt's own request duration.

**How this fits under the remaining-time budget rather than needing its own
accounting:** `withDeadline`/`raceWithTimeout` race the WHOLE
`callLlm(...)` promise, retries included — the wrapper does not know or care
how many attempts happened inside it. So the ~40s worst-case backoff is
already inside whatever `remainingMs`-derived wait wraps the call; it is not
an additional cost stacked on top. The consequence worth stating explicitly:
`MODEL_WAIT_MAX_MS = 24_000` in both existing precedents is LESS than the
worst-case backoff alone, which means a caller deep in an honoured
`Retry-After` sequence WILL be cut off by the wrapper before all five attempts
complete. **That is correct, not a bug** — the wrapper's job is to end the
call before the platform does, and it does that regardless of what the retry
loop was doing when the deadline fired. What must not happen is treating the
retry loop's own "~9s, still under 60s" comment as protective: it protects
nothing on its own; the wrapper is the only thing that bounds the invocation,
and Wave C's implementer must not reason about retries as if they need a
separate ceiling.

The backlog row's own evidence for this —
`learning-resource-links.ts:55-66`'s documented 90-100s case and
`RETRY_BUDGET_MS = 32_000` at `:121` (`docs/BACKLOG.md:95`) — is the retry
loop running with NO wrapper at all, which is exactly the state Wave C ends:
once wrapped, that file's retries are subject to the same remaining-time
clamp as every other caller, not to their own 32-second budget.

### 6.4 The shared-ceiling (unattended/cron) population gets a rule, not silence (B1)

`cron/run-schedules/route.ts:56` is `export const maxDuration = 60;` for the
whole tick. `steps.grading-repos.grade-repo.ts:77-78`:

```ts
export function repoGradingStopAt(deadlineMs: number | undefined, startedAt: number): number {
  return deadlineMs !== undefined ? deadlineMs - SAVE_RESERVE_MS : startedAt + FALLBACK_BUDGET_MS;
}
```

computed once per tick and threaded as `runDeadlineMs`
(`steps.grading-run.ts:479`: `repoGradingStopAt(helpers.deadlineMs,
Date.now())`), consumed by the "stop starting new work late" check in each of
the three registry steps (`steps.grading-run.ts`, `-draft-flow.ts`,
`-cartridge.ts`).

**The rule for this population: it does not get a `TOTAL_BUDGET_MS` of its
own.** `repoGradingStopAt`'s return value already IS a remaining-time-minus-
reserve quantity, of the same kind §6.2 computes explicitly — it is just
computed once per tick instead of once per model call. Any model call this
population makes must be wrapped with a deadline DERIVED from that shared
value (e.g. `Math.min(MODEL_WAIT_MAX_MS, Math.max(MODEL_WAIT_MIN_MS,
repoGradingStopAt(...) - Date.now() - MODEL_WAIT_RESERVE_MS))`), never a fresh
per-call constant — a fresh constant here would double-count against a
ceiling that is already shared and already shrinking across however many
students the tick has already processed. This is the sizing rule B1 found
absent (round 1's §2 disposed of the whole population in eleven words,
"shared across the whole tick, not a per-call budget — unchanged defect",
without giving a rule).

### 6.5 What a platform kill leaves persisted, and the write-ordering rule it demands (B6)

The two failure modes in §5 need different remedies. `raceWithTimeout`
resolving `{kind:"timedout"}` leaves the handler's own code running — it can
mark the row, return a worded body. **A platform kill runs no code at all**:
anything written before the model call stays exactly as written, with no
completion marker and no failure marker. `ask/route.ts` proves this is live
rather than theoretical: three of its six `withDeadline(` sites wrap a
persist (`:491,:565,:882`, each around `appendCourseIntelAnswer(...)`), and
`MODEL_WAIT_RESERVE_MS = PERSIST_WAIT_MS + 2_000` exists so the write still
has room after the model returns — this repo's own worked answer to "what
does a kill leave half-written" for that one path.

**Traced against the three in-scope unattended paths, three different
shapes, not one:**

- **`course-intel/ask/route.ts` (per-item, safe).** Each question's answer is
  persisted (`appendCourseIntelAnswer`, `:492/:566/:883`) immediately after
  THAT question's own model call returns, before the next question is
  attempted. A kill loses only the in-flight question; every prior answer in
  the same conversation is already durable. **No fix owed here — this is the
  pattern the other two paths should match.**
- **`steps.grading-repos.grade-repo.ts` / `steps.grading-draft-flow.ts`
  (batch-at-the-end, total loss, not half-written).** Both loop over multiple
  model calls (`gradeAction`/the per-repo grading call inside a `for`/`for...of`
  loop — `steps.grading-draft-flow.ts:226-310` — accumulating results into an
  in-memory array, `runs`), and call the durable save (`saveRepoGradingDraft`
  at `steps.grading-repos.grade-repo.ts:471`; `saveGradingDraftAction` at
  `steps.grading-draft-flow.ts:331`) exactly ONCE, after the entire loop
  completes. A kill during item N of M loses not just item N but every
  already-graded item 1..N-1 in that tick, because nothing was written to
  durable storage yet. **This is not the "half-written row that looks
  complete" shape — it is worse: zero rows survive a batch that may have
  mostly succeeded.** The remedy is incremental persistence: save (or append
  to) the draft after each successful iteration, not once after the loop, so
  a kill loses at most the one in-flight item — matching the shape
  `ask/route.ts` already uses.
- **`steps.grading-cartridge.ts` (the "looks complete" shape B6 asks for by
  name).** Per drop, `finishCartridgeDropAction` (`:79,:112,:204,:240`) is
  called immediately after that drop's own `gradeAction` call and, on
  success, marks the drop `status: "graded"` with its CSV already uploaded
  (`:204-208`). But the reviewable grading draft (`saveGradingDraftAction`,
  `:273`) is deferred to the SAME batch-at-the-end pattern as the two paths
  above (`:224` `runs.push(entry)` accumulates in memory; `:269-288` saves once
  after the whole `for (const drop of drops)` loop, `:71-248`, completes). **A
  kill after drop 3 of 5 leaves drops 1-3 marked `"graded"` with CSVs already
  persisted, while no corresponding entry exists in Drafted Grades for any of
  them** — a status that reads as done while the thing an instructor would
  actually review does not exist. This is exactly the half-written-looks-
  complete shape B6 names. The remedy is the same rule stated generally: never
  let a per-item "done" marker be written before the record that marker
  implies is also durable — either persist the draft per-drop too, or do not
  mark the drop `"graded"` until the draft covering it has saved.
- **A39's not-yet-built `grade-run-item` route + `incrementalRunPlan`/
  `useIncrementalGradingRun` pool.** No file exists at the target path
  (§4, confirmed again this pass). The wave plan states the pool "delivers row
  1 while row 7 is still running" (`docs/a39-waves.md:575` area), which
  suggests per-item delivery, but nothing in the tree today shows whether the
  eventual implementation persists each item's result as it arrives or
  batches at the end the way two of the three paths above do. **Unmeasurable
  here because the code does not exist** — carried as R7 below rather than
  asserted either way.

**The general remedy, stated once so it binds all four paths above and any
future one:** a write that marks work "done" or "graded" must never land
before the record that status depends on is also durably written. Where a
loop makes more than one model call per invocation, persist incrementally,
per item, the way `ask/route.ts` already does — not once after the whole
loop, the way two of the three grading-registry steps do today.

---

## 7. The fork, restated on §6's shape

**Unchanged in kind, corrected in mechanism.** Once the ~60 remaining
unbounded caller files (§2) are scoped as their own chunk, this activity
produces X or Y:

- **(X) Per-caller wrapping, using the elapsed-aware shape from §6, not a
  fixed constant.** Each caller records its own `startedAtMs` (or, for the
  shared-ceiling population in §6.4, reads the tick's shared remaining value)
  and computes each wrapped call's wait from the remainder, exactly as
  `ask/route.ts` and `class-trends-insight/route.ts` already do. Cost: ~60
  separate wrapper placements, no single enforcement point, so a future new
  caller can still ship unwrapped with every existing gate green unless
  Wave C's own instrument (§8 below) is the repo-wide rule that catches it —
  which is why B5's fix makes that the instrument's explicit job, not an
  assumed side effect. Benefit: zero signature change to `callLlm` itself,
  zero risk to the ~62 files not being touched, and it reuses a template with
  real (if partial — see M3) production precedent.
- **(Y) An optional `signal`/deadline parameter added to `callLlm` itself**,
  with one repo-wide wiring test replacing ~60 per-caller ones. Cost: the
  `AbortError`-retried-as-transient defect (Wave B) becomes mandatory to fix
  first; and per `withDeadline`'s own doc comment (`fetch.ts:294-315`), it
  buys nothing extra on Vercel that the wrapper shape doesn't already buy for
  a single-invocation-per-call platform, because the process is reclaimed at
  the same moment regardless of whether the abandoned `fetch` was formally
  aborted.

**Recommendation: (X), with the elapsed-aware mechanism from §6 as its
required shape, not the fixed-constant shape round 1 specified.** This is
consistent with RULING 75 (per-caller wrapping, not a threaded `signal`
parameter) and is not a reopening of it: RULING 75 settled WHERE the wrapping
happens; RULING 76 settles WHAT NUMBER each wrapper is given. **This produces
X or Y; every answer ends this fork.** If the owner picks (Y), Wave B is no
longer optional and must be sequenced first.

**Assertion count, corrected (m2).** Round 1 described
`walkthrough-announcement.structure.test.ts`'s G1 block (`:327-352`) as three
assertions ("import presence, `Promise.all(` nesting, and a shared-constant
count assertion"). It has **four** `it()` blocks: `:333` import presence,
`:337` `Promise.all(` nesting, `:341` the `loadSavedExemplars`-body-scoped
site, `:349` the shared-constant occurrence-count assertion
(`docs/a39-waves.md:1957-1961` states four, matching this count). Understating
the precedent's own strength was the defect; the corrected count is four, not
a change to which file or which pattern is being credited.

**Precedent count, corrected (M3).** Round 1 called this "a three-times-proven
template" (three real call sites, `announcements-panel.tsx:31,:128` and
`WalkthroughAnnouncementPanel.tsx:36,:303,:358`). The *instrument*, not the
call sites, is what a precedent means here, and it covers only two of the
three: `walkthrough-announcement.structure.test.ts:322-349` reads
`WalkthroughAnnouncementPanel.tsx` only, and
`grep -n "raceWithTimeout\|EXEMPLAR_FETCH"
src/app/components/canvas-tab/announcements-panel.wiring.test.ts` exits **1**
this pass (re-confirmed) — `announcements-panel.tsx:128` has no assertion
holding its bound in place. **Corrected claim: two instrumented call sites in
one file, and one uninstrumented one.** RULING 75 survives on the other two
sites; the corrected count does not touch it. The uninstrumented site is the
first observed instance of exactly the unwrapped-caller mutation B5's fixed
instrument (§8) is built to catch — it strengthens the case for that
instrument rather than weakening (X).

---

## 8. Leverage (M5)

**No new leverage claim is owed here, and the authority for saying so is
corrected.** Round 1 attributed the exemption to
"`docs/loop/leverage.md`'s requirement that a reliability bug name its class
honestly" — read in full, `leverage.md` contains no such requirement; its one
rule is that "a leverage claim names a mechanism, not a benefit"
(`leverage.md:13`). The actual authority is `DEV_LOOP.md:101-108`: a leverage
claim is owed only when a chunk "builds or changes a capability a user
reaches — **not a bug fix**, a refactor, a doc correction or an owner
verification." This row is a reliability bug fix; no capability is added or
changed. This row gives the app no NEW capability a chat with an LLM cannot
already do — a chat window has no `maxDuration` to be killed by at all — but
that observation is this document's own reasoning about why the exemption
applies here, not a rule `leverage.md` states. What this row protects is a
capability the app already claims — "the pool can report a per-item failure
instead of a whole run dying" (DECISION 6's own stated purpose,
`docs/owner-decisions-2026-09-23.md` DECISION 6, restored citation per M4) —
from silently degrading into a raw transport failure.

---

## 9. Residual register (corrected — M1, M2, B4/RULING 77, RULING 78, B6)

| # | What is not proven now | Owner | Instrument | Direction of failure | Step |
|---|---|---|---|---|---|
| R1 | `ai-chat/route.ts` has no `maxDuration` and no wrapper — a live, user-facing unbounded path (`callLlm` bare at `:647`) | Wave C or a standalone follow-up | **Corrected (M1):** a wiring assertion — the route has BOTH a declared `maxDuration` AND an elapsed-aware wrapped call (§6's shape), not a bare `grep -n maxDuration` presence check. §4's own finding (Check 3's "a presence check on `maxDuration` proves nothing about whether the handler stops itself first," `docs/a39-waves.md:1802-1806`) applies here identically; using the same weak instrument for R1 would be the exact contradiction M1 named. | RED until the route has both parts, verified by the wiring assertion, not the grep alone | Fix lands, then the wiring assertion confirms both parts, then a wiring test per §10's rewritten Wave C instrument |
| R2 | `AbortError`-retried-as-transient defect (`llm.ts:457-462,:617-622`, Wave B) | Next G4 implementer, before any real signal threading | A fake-timer test stubbing `fetch` to reject with an `AbortError`, asserting zero `sleep()` calls and an immediate `{ok:false}` | RED if the stub is invoked more than once | Before Wave C only if the fork (§7) resolves to (Y); cross-referenced by `docs/a39-waves.md:3016` (RES-W-3) |
| R3 | Whether `callLlm` should eventually gain a true-cancellation `signal` parameter, or stay wrapper-only forever | A `loop-architect` pass | Cost comparison in §7, already laid out — this is the (X)/(Y) fork itself, not a separate measurement, and is listed here only so a reader does not miss that it is still open | N/A — decision residual | Decided as part of Wave C's own scoping, before Wave C's implementer wave |
| R4 | Whether the adopted budget is generous enough for a real Gemini grading call | Repo owner, live key required | **Corrected (B4/RULING 77).** Object is `TOTAL_BUDGET_MS = 50_000` (`class-trends-insight/route.ts:47`), NOT `54_000` — round 1 cited the precedent the receiving plan explicitly named and rejected (`docs/a39-waves.md:1899-1903`: "Two precedents exist and they disagree by 4 seconds ... RULED: follow `class-trends-insight/route.ts` ... `TOTAL_BUDGET_MS = 50_000`"). **The receiving document owns this number**: `docs/a39-waves.md:3025` (RES-W-12) already carries it as its own residual, and this document's job is to match it, not restate a third value. `ask/route.ts:145`'s `54_000` is named here only so nobody invents a third number believing it is unclaimed. **The two documents also stated different failure DIRECTIONS for the same residual, now reconciled**: this document's prior round said "Fails if real submissions time out at a rate the owner considers unacceptable" against the (wrong, looser) 54s figure; the receiver's RES-W-12 states it the other way — "an item timing out under the soft budget that would have completed under the 60s hard cap", the over-eager-guard defect class applied to time. **The timed run the receiver's own step runs measures RES-W-12's direction**, against the tighter, adopted 50s number — an owner running that one run gets the right answer only if they read the constant and the direction from `docs/a39-waves.md:3025`, not from this row. | one real timed grading run against production Gemini, per-item elapsed read | an item timing out under the 50s soft budget that would have completed under the 60s hard cap | A39's own owner-verification step (RES-W-12), after its first production deploy — not this document's to run |
| R5 | Whether an instructor actually sees a legible "not graded, timed out" state on screen | Repo owner / a UX pass on A39's as-built diff | Real browser observation — nothing here renders a component | Fails if the state is technically correct but not legible in practice | A39's own follow-up UX pass against its as-built diff |
| R6 | `generateGeminiImage`'s identical no-`AbortSignal` gap (`llm.ts:757`) | **HANDED OVER — RULING 78.** This residual has crossed two scopes unfiled; the orchestrator rules (X): it becomes its own backlog row, filed by the orchestrator, not by this document (this document's write set is `docs/g4-scope.md` only and cannot reach `docs/BACKLOG.md`). This document stops carrying it as an open residual as of this revision. | N/A — filing is the orchestrator's action, not a measurement this document owns | N/A | The new row must carry the same elapsed-aware rule §6 puts on the text path — recorded here once so the filed row does not have to re-derive it |
| R7 (new — B6) | The three named unattended grading paths do not persist the same way: `ask/route.ts` persists per-item (safe), `grade-repo.ts`/`-draft-flow.ts` persist once after the whole batch (total loss on a mid-batch kill, §6.5), and `-cartridge.ts` marks a per-item status done before the corresponding draft exists (half-written-looks-complete, §6.5). Not fixed here — the fix touches production files outside this document's write set. | Whoever next touches `steps.grading-repos.grade-repo.ts`, `steps.grading-draft-flow.ts`, or `steps.grading-cartridge.ts` | A test that kills the loop after item N of M (a stub that throws on the (N+1)th call) and asserts the durable store holds N items' results, not zero | RED if a batch of more than one successful item produces fewer persisted rows than items that actually completed before the simulated kill | The next chunk that touches any of the three files; not inside Wave C, which is scoped to bounding the CALL, not reordering the WRITE |
| R8 (new — B6) | Whether A39's not-yet-built `grade-run-item` route persists per-item as items arrive, or batches at the end the way two of the three existing unattended paths do | Commit 4c's implementer | Cannot be measured — the file does not exist (`ls src/app/api/grade-run-item/route.ts` exits 2, `find src -iname "*grade-run-item*"` returns nothing, both re-run this pass) | N/A until the file exists | Commit 4c's own build; the write-ordering rule in §6.5 binds it explicitly so this is a known obligation, not a rediscovered one |

**R6's disposition supersedes round 1's "KEPT, unchanged"** per RULING 78 — the
prior round's residual is the same fact; what changed is the disposal, not
the measurement.

---

## 10. Wave plan

**This document's own write set is exactly `docs/g4-scope.md`.** No wave below
is executed by this pass.

- **Wave A** — HANDED OVER, per §4. Owner: A39's Commit 4c implementer wave,
  once `docs/a39-waves.md`'s pending owner question (about wave 3a-i's
  extraction shape — does not touch Commit 4c's file set, per `a39-waves.md`'s
  own ordering edges) is answered and the plan is dispatched. File(s):
  `src/app/api/grade-run-item/route.ts` (new) plus `route.test.ts` (new).
  **Constant to build against: `TOTAL_BUDGET_MS = 50_000` with a 2-second
  reserve (§9 R4/RULING 77) — not `54_000`.** This row does not need its own
  chunk for Wave A.
- **Wave B** — KEPT, independent, small, still not started. File:
  `src/lib/llm.ts`, the two `catch` blocks at `:457-462` and `:617-622`.
  Content: distinguish an `AbortError` from a genuine transient error and
  return immediately rather than retrying. Pass condition: object is
  `postGenerateContent`'s returned result; instrument is a test stubbing
  `fetch` to reject with an `AbortError` under `vi.useFakeTimers()`;
  direction of failure is RED if the stub is invoked more than once. Owner:
  the next G4 implementer, sequenced before Wave C only if the fork (§7)
  resolves to (Y).
- **Wave C** — KEPT, still unscoped, still not this chunk, **pass condition
  rewritten in full (B5)**. Scope: the ~60 remaining unbounded caller files
  (§2), including `ai-chat/route.ts` (R1), the row's own two originally-named
  paths, and the shared-ceiling population named in §6.4 (which gets the
  remainder-of-shared-deadline rule, never its own `TOTAL_BUDGET_MS`).

  **Object under comparison:** the set of `callLlm(` call sites in
  `src/**/*.{ts,tsx}` (excluding `*.test.*`), **derived at run time by the
  test itself, not a frozen list copied from this document's or any other
  document's census.** Per `traps-spec.md`'s standing rule, an orchestrator's
  or scope's enumeration is a floor, never the set — the 127/64 and 52/46/6
  counts above are exactly that kind of floor, and Wave C's own instrument
  must not trust them as the population.

  **Instrument:** a structural test, generalizing `fetch.test.ts:602-637`'s
  existing single-file walker (today scoped to
  `path.join(process.cwd(), "src", "app", "api", "course-intel", "ask",
  "route.ts")`) to walk the whole tree. It must (a) assert
  `callSites.length > 0` first — the presence assertion `fetch.test.ts:634`
  already carries — so an empty walk cannot pass vacuously; (b) for every call
  site, check that it is immediately inside a `withDeadline(`/
  `raceWithTimeout(` **call-expression argument**, anchored the way A39's own
  Check 1/2 anchor on `src.indexOf("requireUser(")` rather than a bare string
  (`docs/a39-waves.md:1785-1797`) — round 1's inherited "the 200-character
  proximity idiom" (`fetch.test.ts`'s own template) is satisfiable by a
  comment mentioning the wrapper name, which round 1's own §4 diagnosed for a
  weaker template and then pointed Wave C at anyway; the anchor fix in
  A39's Check 1/2 is the fix Wave C's instrument must inherit, not just
  diagnose; (c) compare unwrapped sites against an **allowlist that may only
  shrink** — the ratchet shape `docs/a39-waves.md:3028` (RES-W-13) already
  describes for its own, narrower, route-handler population, generalized here
  to the whole `callLlm(` census.

  **Direction of failure:** RED when a call site outside the allowlist is not
  wrapped by the call-expression anchor above — **including a call site in a
  file the allowlist has never seen**, which is the exact new-caller mutation
  a frozen census cannot catch (round 1's own §5 named this cost for option
  (X) — "nothing greps for 'every `callLlm(` site' as a repo-wide rule
  today" — and this instrument is what closes it).

  **Sizing rule for every wrapped site:** §6's elapsed-aware shape (6.2),
  with the shared-ceiling population using §6.4's rule instead of its own
  constant, and the retry loop treated per §6.3 (inside the wrapper's budget,
  not a separate accounting). Write ordering per §6.5 is a SEPARATE
  obligation (R7/R8), not inside Wave C's own pass condition — Wave C bounds
  the CALL; it does not reorder the WRITE.

---

## Verification of this document's own write set

```
git status --short
```

Live siblings this pass, per the brief: `docs/r2-scope.md`,
`docs/l9-wave1-classification.md`. Neither was opened for writing, reading, or
at all. `docs/backlog.yml` was not read or touched, per the brief — every
backlog citation above (`docs/BACKLOG.md:95`) was read via `grep -a -n "G4"
docs/BACKLOG.md`, never via `docs/backlog.yml`. This pass's write set is
exactly `docs/g4-scope.md`; no file under `src/`, no test file, and no
`docs/a39-*`, `docs/a41-*`, `docs/l9-*`, `docs/r2-*` file was opened for
writing. All measurements above were taken by direct command execution against
the real tree this pass, not transcribed from `docs/g4-check.md`'s prose or
from the round-1 document — every grep/`ls`/`find` cited above was re-run
directly in this session, and every exit code cited (`ai-chat` maxDuration
absence: exit 1; `GradingTab.tsx` gradeAction absence: exit 1;
`grade-run-item/route.ts`: `ls` exit 2, `find` exit 0 with empty output;
`announcements-panel.wiring.test.ts` raceWithTimeout absence: exit 1) was read
from the command directly, never through a pipe. No production or test file
was mutated to produce any measurement in this document. `docs/g4-check.md`
was read in full before this revision and is unmodified by this pass (this
document's write set does not include it).
