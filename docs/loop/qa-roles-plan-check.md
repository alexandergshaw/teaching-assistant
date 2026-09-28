# Check: qa-roles-plan.md (round 1)

Fresh adversarial check of `docs/loop/qa-roles-plan.md`. This is meta-infrastructure:
a defect here is inherited by every future run, so it is checked at least as hard as
product code. Verdict and counts are at the end.

Labels: MEASURED = I ran a command or read the exact bytes; READING = reasoned from
source without executing the app.

---

## Citations audited (all resolve - sound)

- `this-repo.md:240-242` (no component rendered), `:113-118` (same ceiling), `:227-239`
  and `:237-239` (env ceiling, "the app cannot be meaningfully driven without env
  vars") - all resolve and say what the plan says. MEASURED (Read).
- `docs/tools-grading-subtab-waves.md:557` "## 7. The owner walk", `:567` OW-A1
  ("ACCESSIBLE NAME is 'Grading tools'"), `:568` OW-A2 (reload + Back/Forward
  persistence) - exact. MEASURED (grep -n).
- `DEV_LOOP.md` "The core principle" (:23-35), "Two seats are exceptions" (:54-61) -
  resolve; the plan reproduces the loop-test-author elevation argument faithfully.
- Tier mechanism: the plan sets tier via `.claude/agents/` frontmatter `model:`.
  `loop-test-author.md:4` (`model: opus`) and `loop-checker.md:4` (`model: opus`) do
  exactly this; `this-repo.md:275,284` records that the family ALIAS is honoured (only
  the full-id pin `claude-opus-4-8` was reverted). So `model: opus`/`model: sonnet`
  for the new seats is consistent and enforced. Run-and-empty.

---

## BLOCKER 1 - FORK 1 (A) has an empty renderable subset as the app stands

Class: **premise rests on a state the tree forbids** (a feasibility claim whose
precondition is never established). NEW.

The plan's recommended reading (A) is: execute against a live `preview_start` dev
server "scoped to surfaces that render WITHOUT a backend" and claims that subset "is
precisely today's reading-claim set" (`qa-roles-plan.md:82-90`). That subset is empty
as the app stands, and the plan never notices why.

Traced (MEASURED, by reading the exact bytes):

- `src/app/layout.tsx` is the ONLY layout in `src/app` (`find src/app -name
  layout.tsx` returns one path). Every route is wrapped by it. There is no
  `error.tsx`/`global-error.tsx` (`find` returns none), so an uncaught render throw
  surfaces as the dev error overlay, not a surface.
- `src/app/layout.tsx:157` wraps every child in `<SupabaseProvider>`.
- `src/context/SupabaseProvider.tsx:44` constructs the client EAGERLY at first render:
  `const supabase = useMemo(() => createClient(), []);`.
- `src/lib/supabase/client.ts:55-64` calls
  `createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, ...)`.
- `node_modules/@supabase/ssr/dist/main/createBrowserClient.js:18-19`:
  `if (!supabaseUrl || !supabaseKey) { throw new Error("...Your project's URL and API
  key are required to create a Supabase client!..."); }` MEASURED (grep -n on the
  installed file).
- No `.env` exists (`ls -a | grep -i env` returns only `next-env.d.ts`), and
  `.claude/launch.json`'s only config runs `npm run dev` on port 3000 with NO env
  block.

So `preview_start name:"dev"` boots `npm run dev` with `NEXT_PUBLIC_SUPABASE_URL`
undefined; the root provider's `createClient()` throws at the first render of every
route. This is the SAME throw that already makes `npm run build` fail in the prerender
tail (`this-repo.md:55-57`). The plan cites the prerender cause (`this-repo.md:68-71`,
layout wraps every route) but does not carry it to its own conclusion: the dev server
has the identical env dependency, so nothing renders and (A) observes nothing.

The subset is recoverable only by an UNSTATED prerequisite: supply placeholder public
env (e.g. `NEXT_PUBLIC_SUPABASE_URL=http://localhost` + any non-empty anon key), which
lets `createBrowserClient` construct (it validates presence, not connectivity); the
shell would then render and `getSession()` would fail into the `.then` handler
(`SupabaseProvider.tsx:51-62`, sets `loading=false`). The plan proposes no such step,
and it arguably conflicts with the repo's "no `.env`" posture (`this-repo.md:227`).
Even with placeholder env, the renderable set is bounded by the request gate's
redirects for an anonymous session (READING) and is NOT self-evidently "today's
reading-claim set" - that equivalence is asserted with zero measurement, which is
itself the `iteration-caps.md:143` entry-gate violation (no unmeasured claim).

Shortest fix: before FORK 1 can be ruled, MEASURE the actual renderable subset under
`npm run dev` (with and without placeholder public env) and state it. Then either
(a) add the placeholder-env setup step and scope (A) to the measured subset, or
(b) concede (A) renders nothing here and (B)/a narrower scope wins. The placeholder-
env-vs-no-.env tension is a posture call that needs an OWNER ruling; the subset size
is a MEASUREMENT the plan must do itself, not defer.

## BLOCKER 2 - the qa-designer / loop-test-author boundary conflates a runtime observable with its static proxy

Class: **boundary keyed on the wrong discriminator** (two seats over the same ground
will route the same case differently). NEW.

The plan calls this boundary "the load-bearing one" (`qa-roles-plan.md:35-39`) and
states it as: test-author = "what a non-rendering unit test measures"; qa-designer =
"what only a rendered, interacted surface can show"; and "A case that vitest can
already assert belongs to test-author... putting it in QA would duplicate coverage."

The defect: this repo's node-env vitest is dominated by SOURCE-TEXT tests - 68
`*.wiring.test.ts` and 17 `*.structure.test.ts` (`this-repo.md:119-124`, measured by
`find ... | wc -l`) that read source with `readFileSync`. They assert a large amount
about markup STATICALLY: `recording-split.structure.test.ts` pins the exact count of
`role="tabpanel"` occurrences and sub-tab strip entries (`this-repo.md:153`). So for an
accessibility case like OW-A1 ("the inner tablist's accessible name is 'Grading
tools'"), a structure test CAN assert the source contains `aria-label="Grading tools"`,
while only a render can assert the COMPUTED accessible name (which also depends on role,
`aria-labelledby`, and DOM composition). These are two different observables of one
feature. The plan's anti-duplication clause - "if vitest can assert it, it does not go
to QA" - would wrongly pull the runtime-computed case into test-author because its
static proxy is assertable, or trigger a per-chunk argument about which seat owns it.
The boundary as written ignores source-text/structure tests entirely, which is exactly
where the overlap lives.

This is the known failure mode the loop warns about: two concurrently authored
artifacts over the same ground reaching different answers (`seats.md:137-140`,
"AC checker must ask" bullet).

Shortest fix: re-key the boundary on the NATURE OF THE PASS CONDITION, not on "can
vitest assert it": if the pass condition requires a running render, a computed value,
or a dispatched event, it is qa-designer's; if it is decidable from source bytes or
pure logic (including a `readFileSync` structure test), it is test-author's. State
explicitly that one feature may legitimately carry BOTH a source-text assertion
(test-author) and a runtime observation (qa-designer) without that being duplication -
they guard different layers.

## BLOCKER 3 - FORK 2 "the role survives either way" is false under option (ii)

Class: **a fork mischaracterised as harmless** (deferral dressed as dissolution). NEW.

FORK 2 (`qa-roles-plan.md:96-104`) flags as unverified whether an Agent-tool subagent
can reach `mcp__Claude_Browser__*`, and claims the role survives either way: under (ii)
"the render-and-observe step is a main-session action the orchestrator performs from
the QA plan", designed so "the answer changes the plumbing, not the role."

It changes the role. `DEV_LOOP.md:32-34`: "The orchestrator authors nothing except
chunking, rulings, the decisions ledger and the push. Catching yourself producing an
artifact instead of routing one is the signal to spawn the seat." Under (ii) the
observation-gathering IS the substantive authoring of qa-executor's artifact (the run
report's evidence) - it is not chunking, a ruling, the ledger, or the push. So (ii)
either violates the core principle or means qa-executor cannot exist as a subagent seat
and collapses toward FORK 1 (B) (the owner/human executes). The fork's empirical answer
therefore determines WHETHER qa-executor is a seat at all; the plan's "identical
artifact for both" hides that under a shared output shape.

Shortest fix: state the core-principle conflict in (ii) plainly; make FORK 2 a
prerequisite EMPIRICAL check whose "main-session only" answer routes to an OWNER ruling
(accept a bounded orchestrator exception, or adopt FORK 1 (B)). Do not claim the role
is invariant.

## BLOCKER 4 - the silent-green guard is named but not installed

Class: **an obligation described but not made a requirement** (the pass signal is as
unfalsifiable as what it replaces). NEW.

Section 7 (`qa-roles-plan.md:123-125`) names the right failure modes ("a screenshot
that proves nothing, a case that passes because the surface never loaded, a fix that
greens the case by hiding the control"). But sections 2 and 6 do not install a guard:
the qa-executor output lists evidence as "screenshot, accessibility tree, console,
network" (`:32`) - screenshot FIRST and undemoted - and no clause requires the
pass/fail condition to be machine-checkable or requires proof the surface loaded before
the case is judged. A case "passed" on a screenshot glance is a reading claim with a
photo; it does not beat the reading-claim ceiling this whole plan exists to beat, and
it re-creates silent-green one layer up.

This also underpins the tier call (see below): qa-designer=Opus is justified ONLY if a
weak QA case can pass silently. It can precisely because this guard is absent; installed
correctly, the argument still holds because a weak MACHINE-CHECKABLE observable also
passes silently. Either way, the guard must be a hard requirement.

Shortest fix: require every qa-designer case to carry (1) a machine-checkable pass
condition - an assertion over the accessibility tree, a computed style, or a
console/network fact read via `read_page`/`javascript_tool`/`read_network_requests` -
and (2) a "surface actually loaded" precondition assertion that fails the case if the
render threw. A screenshot may corroborate but may never be the pass signal.

---

## RESIDUALS (should fix before implementation; not blockers)

- **R1 - "regression baseline" is the wrong term.** Section 5 (`:71-72`) puts the QA
  wave "BEFORE the group's regression baseline and push". The Baseline SEAT runs in
  wave 1 before hand-off (`seats.md:58`); the per-group REGRESSION pass runs at push
  (`DEV_LOOP.md:158-160`). The parenthetical shows (A) meant the per-group regression
  pass, but "baseline" will misdirect the implementer. Class: citation/term error.
  NEW. Instrument: fix the wording. Owner: whoever writes section 5. Step: revision.

- **R2 - capped vs uncapped is conflated for the QA fix loop.** Section 5 says the
  qa-designer -> execute -> fix -> re-execute loop is "bounded by the same two-round
  cap" (`:74-76`). But the two-round cap binds ARGUING artifacts per artifact
  (`iteration-caps.md:44`), while RE-EXECUTING a QA case is a step that executes and is
  NEVER capped (`iteration-caps.md:87`, `DEV_LOOP.md:284`). The qa-fixer's FIX
  (authoring) is capped; the re-run is not. State this split. Class: cap misapplied to
  an executing step. NEW. Instrument: revision. Owner: section 5 author. Step: revision.

- **R3 - the FORK 1 subset-equivalence is an unmeasured claim** (folded into BLOCKER 1
  but recorded separately as an entry-gate item): "(A) ... is precisely today's
  reading-claim set" (`:86-88`) names a set equality with no command behind it.
  `iteration-caps.md:143` forbids an unmeasured claim in an artifact.

---

## Attacks that came back empty (run-and-empty)

- **FORK 3 (one checker vs three).** Handled correctly. The plan reads the user's
  "checkers for each" as a check STEP per QA artifact, not three near-identical checker
  AGENTS (`:41-56`, `:106-107`), and explicitly surfaces it as an owner fork with a
  recommendation and a stated one-line reversal cost - it does not settle it by silent
  preference. The reasoning (three dedicated checkers duplicate `loop-checker`'s generic
  attack surface, the denylist-duplication pattern the loop warns against) is consistent
  with `seats.md:116-122`. Sound; owner still confirms.
- **Tier mechanism** (frontmatter `model:` alias is honoured) - sound, see citations.
- **Triage keeping QA off docs-only / pure-logic chunks** - addressed (`:76-78`), same
  trigger shape as the wave-3 seats (`seats.md:52,56`). Sound.
- **Section 8 "what this plan does not do"** - accurate; it adds seats and governing
  docs, narrows rather than retires the owner walk, touches no product code.

---

## Verdict

**NOT IMPLEMENTABLE AS WRITTEN.** Counts: 4 BLOCKER, 3 RESIDUAL, 0 after-fix
manufactured. The plan is well-cited and its FORK 3 and triage handling are sound, but
its central feasibility premise (BLOCKER 1) is contradicted by the tree it cites, its
load-bearing boundary (BLOCKER 2) is keyed on the wrong discriminator, one fork it
claims to dissolve it only defers (BLOCKER 3), and the guard that would make the whole
QA layer better than a reading claim is named but not required (BLOCKER 4).

Shortest fix list, in order:
1. MEASURE the renderable subset under `npm run dev` (with/without placeholder public
   env); rescope or reject FORK 1 (A) on the measured result.
2. Re-key the qa-designer/test-author boundary on the pass condition's nature, and
   permit one feature to carry both a source-text and a runtime case.
3. Reframe FORK 2: name the core-principle conflict in (ii); its answer decides whether
   qa-executor is a seat.
4. Make a machine-checkable pass condition + a surface-loaded precondition a hard
   per-case requirement; demote screenshots to corroboration.
5. Fix R1/R2 wording and the R3 unmeasured claim.

Which forks need an OWNER ruling vs which the plan settles itself:
- **FORK 1** - needs BOTH: a MEASUREMENT the plan must do (subset size), then an OWNER
  ruling on the placeholder-env-vs-no-.env posture. Cannot be settled by the plan alone.
- **FORK 2** - primarily EMPIRICAL (can a subagent drive the browser pane); if the
  answer is "main session only," an OWNER ruling is required on the principle exception.
- **FORK 3** - the plan may keep its recommendation; OWNER confirms. No blocker.

## Stopping point

**DESIGN and MEASUREMENT**, with one RULING dependency (FORK 1 posture). The four
blockers are not resolvable by tightening prose: BLOCKER 1 needs a measurement and a
posture decision, BLOCKER 2 needs the boundary redesigned, BLOCKER 3 needs the fork
reframed and possibly an owner exception, BLOCKER 4 needs a requirement installed. Not
"nothing", and not "rulings" alone.
