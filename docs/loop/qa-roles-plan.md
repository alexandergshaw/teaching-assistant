# Plan: QA seats for the dev loop

Proposal to add three QA seats - design, execute, fix - each with an adversarial
check, so the loop can EXECUTE rendered checks instead of only reasoning about
them. Authored as a proposal for the owner and for a `loop-checker` review before
any file under `.claude/agents/` changes.

## 1. The gap this closes, stated from the tree

The loop's most consequential documented limit: `docs/loop/this-repo.md:240-242`
- "No component is rendered by any test... every UI, accessibility and keyboard
claim in this repo is a reading claim." The same ceiling is repeated at
`this-repo.md:113-118`, and every wave-3 seat in `docs/loop/seats.md` (User
experience, Visual, Accessibility) is forced to label its findings "reading
claims" because of it. Today the only thing that turns a reading claim into an
observation is the manual OWNER WALK (`docs/tools-grading-subtab-waves.md`
section 7 is a live example: OW-A1 "accessible name is Grading tools", OW-A2
"reload and Back/Forward persistence" - all handed to the owner because no seat
can run them).

There is no seat that RENDERS a surface and checks it. The vitest suite cannot
(node-env, `vitest.config.ts`), and the unit-test seats (`loop-test-author`,
`loop-implementer`) correctly stay inside that boundary. QA is the missing
execution layer: it renders the app in the built-in browser against a live dev
server and checks what the unit suite structurally cannot.

## 2. The three seats, and why each is distinct from an existing one

| New seat | Produces | NOT the same as |
|---|---|---|
| `qa-designer` | A QA test plan: executable runtime cases - surface, steps, the observable, the pass/fail condition, and which env tier can run it | `loop-test-author` owns node-env vitest ORACLES (what is measured in a non-rendering unit test). `qa-designer` owns RENDERED/INTERACTIVE cases the unit suite cannot express. |
| `qa-executor` | A QA run report: for each case, pass/fail with evidence (screenshot, accessibility tree, console, network), and env-gated cases routed to the owner walk | `loop-implementer` writes and runs vitest. `qa-executor` drives a real browser against a running preview. |
| `qa-fixer` | A fix for each failing QA case, with the case re-run green | `loop-implementer` builds from a wave brief; `qa-fixer` is driven by QA failures and must not exceed them. |

The boundary between `loop-test-author` and `qa-designer` is the load-bearing
one: **test-author = what a non-rendering unit test measures; qa-designer = what
only a rendered, interacted surface can show.** A case that vitest can already
assert belongs to test-author, not here - putting it in QA would duplicate
coverage and hide which layer actually guards it.

## 3. Checking - one checker, three seat-brief blocks (FORK 3, recommended)

The loop's core principle (`DEV_LOOP.md`, "The core principle") is that ONE
fresh `loop-checker` adversarially checks every model-authored artifact, and
"nothing checks the checker" is why it runs on the strongest tier. Each of the
three QA artifacts (the plan, the run report, the fix diff) gets its own fresh
`loop-checker` pass - so "a checker for each" is satisfied by the check STEP, not
by minting three near-identical checker agents.

What each QA check must ask lives in `docs/loop/seats.md` as three new blocks,
exactly as every existing seat's checker questions do. Three dedicated checker
AGENTS would duplicate `loop-checker`'s generic attack surface (factual claims,
silent-green, contradictions) and is the kind of denylist-style duplication the
loop warns against. **Recommended: extend `loop-checker` via seats.md, do not add
checker agents.** If the owner wants dedicated agents, that is a one-line change
to this plan and three more files at implementation.

## 4. Tiers (set in `.claude/agents/`, never per call - `this-repo.md` section 8)

- `qa-designer`: **Opus.** Same consequence argument that elevated
  `loop-test-author` (`DEV_LOOP.md`, "Two seats are exceptions"): it decides what
  a runtime check measures and how it fails. A weak QA case passes while the
  surface is broken - the exact silent-green class, now at the rendered layer.
- `qa-executor`: **Sonnet.** A doer, backstopped by a `loop-checker` pass over
  its report. Interpreting a rendered screen is judgment, but it is checkable.
- `qa-fixer`: **Sonnet.** A doer, same tier and same reason as
  `loop-implementer`.

## 5. Where they run in the loop

A QA wave AFTER Build + Verify + the unit Test seat, and BEFORE the group's
regression baseline and push (memory: regression is batched per group with its
own push). Sequence within the QA wave: `qa-designer` -> check -> `qa-executor`
-> check -> if failures, `qa-fixer` -> re-execute, bounded by the same two-round
cap as every other activity (`docs/loop/iteration-caps.md`). A QA wave triggers
only when the chunk changed something a rendered surface shows - the same trigger
as the wave-3 seats in `seats.md`; a docs-only or pure-logic chunk triages it
out and records the fired trigger.

## 6. The forks the owner should rule on

**FORK 1 - what "execute" means, against the env ceiling. RECOMMENDED: (A).**
- (A) Execute against a live `preview_start` dev server in the built-in browser
  pane, scoped to surfaces that render WITHOUT a backend - markup, focus,
  keyboard, ARIA names, layout, spacing, contrast, dark mode. That is precisely
  today's reading-claim set, so (A) directly converts the loop's biggest
  documented gap into observations. Auth- and data-backed flows stay owner-walk,
  because there is no `.env` (`this-repo.md:227-239`, `:237-239` "the app cannot
  be meaningfully driven without env vars"). The QA layer does NOT pretend to
  cover them; it narrows the owner walk to only what genuinely needs a backend.
- (B) `qa-executor` only produces a runnable protocol and the OWNER executes it.
  Weaker - it does not close the gap, it reformats the owner walk.
- (C) Add Playwright/Cypress e2e infrastructure. Rejected: network-blocked, no
  env, and it is a large new dependency the repo does not have. Cannot run here.

**FORK 2 - can an Agent-tool subagent drive the browser pane?** The built-in
browser is a session-level resource; it is unverified whether a subagent reaches
`mcp__Claude_Browser__*`. This must be settled empirically BEFORE `qa-executor`
is implemented. Two designs, and the role survives either: (i) if a subagent can
drive it, `qa-executor` is a normal subagent; (ii) if only the main session can,
`qa-executor`'s ARTIFACT (the run report) is authored the same way but the
render-and-observe step is a main-session action the orchestrator performs from
the QA plan. Recommended: design the run-report artifact identically for both,
so the answer changes the plumbing, not the role.

**FORK 3 - one checker or three (section 3 above). RECOMMENDED: one, extended via
seats.md.**

## 7. Deliverables at implementation

- `.claude/agents/qa-designer.md`, `qa-executor.md`, `qa-fixer.md` - frontmatter
  (`name`, `description`, `model`, `effort`) + body, mirroring the existing eight
  defs; body states the env ceiling, the render-not-recall discipline, and the
  seat's own failure modes as the existing defs do.
- `docs/loop/seats.md` - three seat briefs, each with its checker questions;
  three triage-table rows with triggers; the QA wave assignment.
- `docs/DEV_LOOP.md` - three tier-table rows; the QA wave in the loop sequence.
- `docs/loop/this-repo.md` - extend section 6 with what QA execution CAN and
  cannot verify here, so a later agent does not over-claim.
- `docs/loop/wave-dispatch.md` - where the QA wave sits and what it depends on.
- `docs/loop/iteration-caps.md` - the QA fix-loop's round cap, if it differs from
  the standard two.
- A trap card or additions to `traps-tests.md` for QA-specific failure modes
  (a screenshot that proves nothing, a case that passes because the surface never
  loaded, a fix that greens the case by hiding the control).

## 8. What this plan does not do

It does not change any existing seat's boundary, retire the owner walk (it
narrows it), or touch product code. It adds seats and the docs that govern them.
The GRAD-SUBTAB waves already in flight are unaffected and are a natural first
customer for the QA seats once they exist.
