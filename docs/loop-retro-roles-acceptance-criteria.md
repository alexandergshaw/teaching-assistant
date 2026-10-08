# L-RETRO acceptance criteria - retrospective + retro-reviewer loop roles

- Item: `L-RETRO`, area "the loop's own docs, gates and process debt", kind
  feature (two new loop roles), state actionable, TOP PRIORITY
  (`docs/backlog.yml:79-89`, `docs/BACKLOG.md:174`).
- Source: owner request 2026-10-04 (quoted below).
- Seat: `loop-ac` (Opus). A fresh `loop-checker` gates this document before any
  later seat consumes it.
- This is the AC round only. No role-brief body wording, no mechanism, no wave
  plan, no oracle, no code. The architect owns the two role files' internal
  shape and the exact registration edits; the test seat owns any buildable
  instrument; the plan owns ordering. Where this document names a file location
  it is to make a criterion satisfiable, never to write the roles.

## The owner's words (quoted, from `docs/backlog.yml:88`)

> "I need a retrospective role and retro reviewer role added to the loop. these
> two roles should write and review respectively the lessons learned across the
> past loop and id any areas for improvement, and then report those findings to
> me without making any changes."

Where any criterion below and this sentence diverge, the sentence wins. The one
word the sentence makes load-bearing is **"without making any changes"**: that
is the defining property of both roles, and AC-4 is where it is enforced.

## Environment ceilings that bind every criterion

Measured facts, not assumptions (`docs/loop/this-repo.md` sections 2, 6, 8):

- **Nothing renders and nothing executes a role here.** vitest is node-env,
  `include: ["src/**/*.test.ts"]` (`this-repo.md:110-113`); it renders no
  component and it does not dispatch an agent. There is no instrument in this
  repo that can RUN the retrospective role and check that a lesson it produced
  is evidence-grounded. Every criterion about what a role PRODUCES at runtime is
  therefore a [READING] claim over the role's brief, or an [OWNER] verification
  of a real run - never machine-checkable. Each criterion says which.
- **The two role artifacts are agent-definition `.md` files plus doc
  references.** The only machine gate that touches them is
  `src/lib/no-emojis.test.ts`, whose real scan walks `src` AND `docs` for
  `.ts/.tsx/.css/.md` (`roots = ["src", "docs"]` at `:254`, `SCAN_EXTENSIONS`
  at `:237`). It does not scan `.claude/agents/`. So an emoji in a role file is
  NOT caught by any gate here - it is an [OWNER]/[READING] obligation.
- **A role file nobody references ships dead.** This repo's single most repeated
  structural failure (`AGENTS.md` memory `verify-reachability-not-just-correctness.md`,
  `assignment-must-include-wiring-file.md`): a capability can ship with every
  gate green and be unreachable. A `.claude/agents/loop-retro.md` that no loop
  doc points at is exactly that failure for a role. AC-5 binds reachability.
- **Mid-session agent availability is CHECK-DO-NOT-ASSUME**
  (`this-repo.md:316-332`): adding a def to `.claude/agents/` has both
  registered mid-session and failed to, on different dates. This is a residual
  (R-3), not a criterion.

### Measured conflict I must report, not resolve silently

The backlog row's own `instrument` field and `note`
(`docs/backlog.yml:87,89`) describe the role-file frontmatter as
"name/description/tools/model" and propose "a read-only-tools check if the agent
frontmatter supports a tools allowlist". **Measured: no agent definition in
`.claude/agents/` carries a `tools:` field.** Command:
`grep -rniE "^tools:|^ *tools:" .claude/agents/` returns nothing across all
eight `loop-*.md` files. The established frontmatter shape is `name` /
`description` / `model` / `effort` only (e.g. `loop-checker.md:1-6`,
`loop-seat.md:1-6`, `loop-ac.md:1-6`), and `this-repo.md:362-366` records that
even the `effort` key's support in this build is unconfirmed. So a read-only
tools allowlist is NOT the repo's established enforcement mechanism and its
expressibility here is unverified. I adopt neither "it is supported" nor "it is
not". The read-only invariant (AC-4) is therefore bound to the PROSE enforcement
this repo actually uses today - `loop-checker.md:67` "Do not spawn subagents. Do
not edit any file." and `loop-seat.md:37` - with a tools allowlist left as an
optional hardening and an open question (OQ-4 / residual R-4).

## Leverage claim (one paragraph, one removal-shaped criterion)

L-RETRO adds a capability the owner reaches (an evidence-grounded retrospective
plus an adversarial review of it), so a leverage claim is owed
(`docs/loop/seats.md:70-75`). It claims the **GUARANTEED** class
(`docs/loop/leverage.md:44`), compounding with **CORPUS** (`:37`). The mechanism:
every lesson the retrospective states carries a citation to durable evidence the
repo already holds - a commit in `git log`, a `docs/REGRESSION.md` entry
(numbered to 428, `this-repo.md:179-185`), a `docs/backlog.yml` / `BACKLOG.md`
row, or an RCA / owner-decision doc (`docs/type-gate-rca-2026-09-23.md`,
`docs/build-broken-2026-09-27.md`, `docs/owner-decisions-2026-09-23.md`,
`docs/owner-decisions-2026-09-27.md`) - and the retro-REVIEWER refuses a lesson
whose citation does not resolve or does not support the claim, exactly the
"receipt" shape the GUARANTEED instance at `src/app/api/course-intel/ask/route.ts:864-871`
uses to check a model's answer addressed every row it was given. What the owner
does instead today is ask an LLM "what did we learn this loop", where the human
is the transport and nothing detects a lesson that is believed but false. This
repo has the documented failure the review is built to catch: the never-stall
rule was believed to hold while it **failed six times** and was tightened five
(`AGENTS.md`, "Never stall the loop", SHAPE 5: "TWENTY-FIVE COMMITS passed before
the owner answered it"). CORPUS compounds it: the evidence is the persisted
record a later retro reads back, not a transcript that evaporates. The class call
is the human's to confirm, not this seat's to finalize.

- **LEV-1 (removal-shaped criterion; owner-verified, see R-1).**
  - Object under comparison: a retrospective report produced with the
    reviewer's grounding-refusal in force, versus the same report with that
    refusal removed, when one lesson's citation is deliberately falsified (made
    to point at a commit / line / entry that does not support it).
  - Instrument: there is **no machine instrument buildable in this repo** for
    this - nothing here runs the two roles, and no component or agent is executed
    under vitest (`this-repo.md:240-242`, `docs/loop/leverage.md:177-183`
    "Honest limit"). The enforceable surrogate is [READING]: the retro-reviewer
    brief MUST contain a clause that rejects any lesson whose citation does not
    resolve or does not support it (AC-3), and [OWNER]: a real run in which a
    planted ungrounded lesson is rejected by the reviewer and accepted when the
    refusal clause is removed.
  - Direction of failure: the surrogate FAILS [READING] if the reviewer brief
    carries no grounding-refusal clause, so a hallucinated lesson would pass;
    FAILS [OWNER] if, on a real run, a planted lesson with a non-resolving
    citation is NOT flagged. The failure direction must be RED-on-ungrounded -
    never a direction that rewards dropping the citation.
  - Relocated to the test seat and the owner: `docs/loop/seats.md:430-431`
    already rules that where no removal test is buildable here, the test seat
    records a residual with an owner and a step. That is R-1.

## Numbered acceptance criteria

Each criterion names object / instrument / direction of failure, and its class:
[READING] verified by a checker opening the files; [OWNER] verified only by the
owner running the roles over a real loop. [MACHINE] appears only where a gate in
this repo actually touches the artifact - here, only the emoji scan (AC-7).

### AC-1 - The retrospective role exists as a loop agent definition that AUTHORS a lessons-learned + areas-for-improvement report [READING]
- Owner's words: "a retrospective role ... should write ... the lessons learned
  across the past loop and id any areas for improvement".
- Object: a new agent definition file at `.claude/agents/loop-retro.md` (the
  naming the backlog row fixes, `docs/backlog.yml:89`), with frontmatter in the
  established shape - `name`, `description`, `model`, and effort stated in the
  body per `this-repo.md:362-366` - and a body that directs the role to produce
  ONE report with two parts: lessons learned, and areas for improvement. It
  matches the house pattern of the existing eight `loop-*.md` defs
  (`loop-checker.md`, `loop-seat.md`, `loop-ac.md` opened this round).
- Instrument: [READING] a checker opens `loop-retro.md`, confirms the frontmatter
  keys match a sibling def, and confirms the body names both report parts and the
  "report to the owner" delivery. There is no structure test over `.claude/agents/`
  in this repo (none of the twelve `*.structure.test.ts` files scans it,
  `this-repo.md:147`), so this is reading-only and the criterion says so.
- Direction of failure: FAILS if `loop-retro.md` is absent; FAILS if its
  frontmatter omits `model`; FAILS if the body does not direct BOTH a
  lessons-learned part AND an areas-for-improvement part (one without the other
  drops half the owner's sentence); FAILS if the body directs the role to change
  anything (that is AC-4).
- Note: the architect chooses the body wording and the internal structure of the
  report; this criterion binds to the file existing, the frontmatter shape, and
  the two required parts, so it does not pre-empt that authoring.

### AC-2 - Every lesson and every improvement area is GROUNDED in cited, resolvable evidence - no vibes [READING + OWNER]
- Owner's words: "the lessons learned across the past loop" (the lessons are
  ABOUT the past loop, so each must point at a trace the past loop left) +
  backlog note "Each lesson must cite real evidence (no vibes)"
  (`docs/backlog.yml:89`).
- Object: each item in the retrospective (every lesson, every improvement area)
  carries a citation to a durable evidence source that EXISTS and SUPPORTS the
  item - one of: a commit in `git log`; a `docs/REGRESSION.md` entry; a
  `docs/backlog.yml` / `docs/BACKLOG.md` row; an RCA or owner-decision doc under
  `docs/` (e.g. `docs/type-gate-rca-2026-09-23.md`,
  `docs/owner-decisions-2026-09-27.md`); or a `file:line` in the tree or the loop
  docs.
- Instrument: [READING] the `loop-retro.md` body must REQUIRE a citation on every
  item (checked by reading the brief). Whether the citations in a PRODUCED report
  actually resolve is the retro-reviewer's job (AC-3) and the owner's (no
  instrument here runs the role or dereferences its citations under vitest).
  [OWNER] on a real run, the owner spot-checks that cited commits / entries
  exist and say what the lesson claims.
- Direction of failure: FAILS [READING] if the `loop-retro.md` body does not
  require a resolvable citation per item (a report of ungrounded assertions would
  then satisfy the role); FAILS [OWNER] if a produced lesson cites nothing, or
  cites a commit / entry / line that does not exist or does not support it. The
  worst case this guards is the project's own documented one: a belief held about
  the loop ("the never-stall rule holds") that the evidence contradicts
  (`AGENTS.md`, "Never stall the loop").
- This is a quality bar with no machine enforcer here; that is stated, not
  hidden. The enforcement is the reviewer (AC-3) plus owner judgment (R-1).

### AC-3 - The retro-reviewer role exists and adversarially reviews the retrospective, defaulting to defective [READING + OWNER]
- Owner's words: "retro reviewer role ... should ... review ... the lessons
  learned ... and id any areas for improvement" + backlog note "adversarially
  reviews that retrospective ... rejects ungrounded/over-claimed/generic
  findings".
- Object: a new agent definition at `.claude/agents/loop-retro-reviewer.md`
  whose body directs a FRESH reviewer (did not author the retrospective) to
  attack the retrospective the way `loop-checker` attacks any artifact
  (`loop-checker.md:8-11,22-47`): it REJECTS a lesson whose citation does not
  resolve or does not support it; it REJECTS an over-claim (a lesson that
  generalises past its evidence); it REJECTS a generic, non-actionable
  "improvement" (one that names no concrete change a later owner could act on);
  and it CONFIRMS each surviving lesson traces to real evidence. It defaults to
  defective when uncertain.
- Instrument: [READING] a checker opens `loop-retro-reviewer.md` and confirms the
  body carries each of those four attack clauses and the "fresh, did-not-author"
  and "default to defective" stances. [OWNER] on a real run, the reviewer flags a
  planted ungrounded / over-claimed / generic item.
- Direction of failure: FAILS [READING] if the reviewer brief lacks any one of
  the four attack clauses (grounding, over-claim, generic-improvement, confirm-
  traces) - a reviewer that only checks grammar is a rubber stamp; FAILS
  [READING] if the brief does not require the reviewer to be a fresh non-author;
  FAILS if the brief directs the reviewer to IMPROVE or EDIT the retrospective
  rather than return findings (that is AC-4, and `loop-checker.md:8-10` is the
  precedent: a checker finds where it is wrong, it does not rewrite it); FAILS
  [OWNER] if a planted bad item is rubber-stamped.
- Note: AC-3 binds the reviewer to CHECK PRESENT items. It cannot catch an
  OMITTED lesson (a true lesson the author never wrote). That gap is why the
  author's tier is a live question (OQ-3 / AC-6), and it is recorded as a known
  limit, not papered over.

### AC-4 - READ-ONLY / REPORT-ONLY: neither role changes any governed artifact [READING + OWNER]
- Owner's words: "report those findings to me **without making any changes**".
  This is the defining property; it is a hard criterion.
- Object: the body of BOTH `loop-retro.md` and `loop-retro-reviewer.md` contains
  an explicit clause that the role modifies NOTHING and delivers its output to
  the owner. "Governed artifact" is enumerated, not left vague: production code
  under `src/`; `docs/backlog.yml` and `docs/BACKLOG.md`; `docs/REGRESSION.md`;
  `docs/DEV_LOOP.md` and every file under `docs/loop/`; and every file under
  `.claude/agents/` (the loop's own definitions). Additionally, the
  retro-reviewer brief must direct it to FLAG any improvement the retrospective
  presents as already-made rather than as a recommendation - because a
  retrospective that silently edited the loop and then described the edit would
  defeat the invariant from the inside.
- Instrument: [READING] a checker confirms both briefs carry the explicit
  no-change clause over the enumerated set, and that the reviewer brief carries
  the "flag changes-presented-as-done" clause. The enforcement precedent is
  prose, which is what this repo uses today: `loop-checker.md:67` ("Do not spawn
  subagents. Do not edit any file."), `loop-seat.md:37`. [OWNER] after any real
  run, `git status --short` shows no diff to any governed artifact attributable
  to the roles.
- Direction of failure: FAILS [READING] if either brief lacks the no-change
  clause; FAILS [READING] if the enumerated governed set omits any of code,
  backlog (both files), REGRESSION, the loop docs, or the agent defs; FAILS
  [READING] if the reviewer brief lacks the "flag changes-presented-as-done"
  clause; FAILS [OWNER] if a run mutates any governed artifact.
- Tools-allowlist hardening is OPTIONAL and unverified here: see the "Measured
  conflict" section above and OQ-4 / R-4. The criterion is satisfiable TODAY by
  the prose clause alone, because that is the only enforcement the established
  pattern expresses; a tools allowlist, if the frontmatter supports one, is
  additive, not a substitute.
- Delivery-of-the-report is deliberately NOT fixed by this criterion: whether the
  report is returned to the owner as a message (writing no file) or written as a
  new `docs/` report file is OQ-2. If the owner chooses a report FILE, writing
  that one named file is the report itself and is not a "change" to a governed
  artifact; the enumerated set above still holds.

### AC-5 - Both roles are REGISTERED where the orchestrator looks, so they are reachable (not dead) [READING]
- Owner's words: "added to the loop" - a role added to the loop must be
  invokable from the loop, not merely present on disk.
- Object: each of `loop-retro.md` and `loop-retro-reviewer.md` is REFERENCED from
  at least the two places the existing roles are registered so the orchestrator
  can find and tier them: (1) the tier table in `docs/DEV_LOOP.md`
  (the eight-row table at `:43-52`), and (2) the model-tier table in
  `docs/loop/this-repo.md` section 8 (`:303-312`). A reference in
  `docs/loop/seats.md` and/or a dedicated loop doc is the architect's call (see
  the note); what this criterion requires is that NO role file exists with zero
  references from the loop docs.
- Instrument: [READING] a checker greps the loop docs for each role name and
  confirms at least the DEV_LOOP tier row and the this-repo section-8 row exist,
  and that the name in the reference matches the `name:` in the def's
  frontmatter exactly. (`grep -rn "loop-retro" docs/` is the command; a canary
  is unnecessary because this is a literal-name search, but `grep -P` must not be
  used - `this-repo.md:213-216`.)
- Direction of failure: FAILS if either role file has no reference in
  `docs/DEV_LOOP.md`; FAILS if either is absent from the `this-repo.md` section-8
  model table (so its tier is unpinned); FAILS if a reference names a role that
  does not match the def's `name:` frontmatter (a dead reference is as bad as a
  dead file). This is the ships-dead failure the project has paid for repeatedly
  (`AGENTS.md` memory `assignment-must-include-wiring-file.md`,
  `verify-reachability-not-just-correctness.md`).
- Note on WHERE in the loop the roles sit: the retrospective and its review run
  OVER a past loop, not inside a feature chunk's dependency waves, so unlike the
  QA-roles proposal (`docs/loop/qa-roles-plan.md:46-57`) they do NOT obviously
  belong in the per-chunk triage table at `seats.md:46-59`. Whether they get
  seat-brief blocks in `seats.md`, a triage row, or a separate section is the
  architect's shape decision; this criterion binds only to reachability, not to
  that placement, and OQ-1 (trigger) interacts with it.

### AC-6 - Tier pins: reviewer on the strong (checker) model; author tier recommended, owner to confirm [READING]
- Convention: `docs/loop/this-repo.md` section 8 and `DEV_LOOP.md:54-68`
  ("spend the strong tier where there is no backstop"), and `AGENTS.md` memory
  `loop-agent-tiers.md`.
- Object: `loop-retro-reviewer.md` pins the **Opus** tier (`model: opus`,
  resolving to Claude Opus 4.8 per `this-repo.md:305-310` and `AGENTS.md` memory
  `opus-tier-is-4-8.md`), because it is a checker and NOTHING CHECKS THE CHECKER -
  a rubber-stamped retrospective ships, which is the exact structural argument
  that puts `loop-checker` on Opus (`loop-checker.md:16-20`). `loop-retro.md`
  pins a tier per the recommendation below; the def sets `model:` explicitly
  (never a bare family alias chosen ad hoc) and states effort in the body.
- Recommendation for the AUTHOR tier: **Opus**, with the owner free to reduce to
  Sonnet (OQ-3). The backstop principle (`DEV_LOOP.md:63-68`) would place a
  checked author on Sonnet like `loop-seat`; the counter-argument is that the
  retro-reviewer (AC-3) only checks PRESENT lessons for grounding and cannot
  catch an OMITTED lesson, so the author's synthesis across a large evidence
  corpus has a partial backstop, not a full one - which is the same
  "blast-radius of a miss" argument that elevated `loop-architect` and
  `loop-test-author` (`DEV_LOOP.md:54-61`). Cost of being wrong: an Opus author
  is 2.5x a Sonnet author per token (`this-repo.md:340`), on an analysis-heavy
  pass, against the risk that a Sonnet author silently omits the single most
  important lesson of a loop.
- Instrument: [READING] a checker reads the two `model:` lines and confirms the
  reviewer is `opus`; confirms the author matches whatever OQ-3 resolves to;
  confirms both defs set `model:` and neither relies on a per-call override
  (`this-repo.md:316-338`).
- Direction of failure: FAILS if the reviewer is pinned below Opus; FAILS if
  either def omits `model:`; FAILS if the author tier contradicts the owner's
  OQ-3 ruling once given.

### AC-7 - Both role files and this document are free of emojis and are well-formed source bytes [MACHINE + READING]
- Standing rule: `AGENTS.md` "No Emojis in Codebase"; enforced for `src`/`docs`
  by `src/lib/no-emojis.test.ts` (`AGENTS.md` memory `emoji-scan-grep-p-broken.md`).
- Object: this AC document (under `docs/`, in the emoji scan's scope) and the two
  role files (`.claude/agents/`, NOT in the scan's scope) contain no emoji and no
  disallowed control bytes.
- Instrument: [MACHINE] `npm run test:paths -- src/lib/no-emojis.test.ts` covers
  this document because the real scan walks `docs/` (`no-emojis.test.ts:254,237`);
  a single path may also be run as `npx vitest run src/lib/no-emojis.test.ts`
  (`this-repo.md:40-45`). [READING] the two `.claude/agents/` files are NOT
  reached by any gate here, so their emoji-freedom is a reading obligation on the
  checker and the owner.
- Direction of failure: FAILS [MACHINE] if the emoji scan reports a violation in
  this doc; FAILS [READING] if a checker finds an emoji in either role file,
  which no automated gate would catch.

## Open questions for the owner (each phrased so every answer terminates the activity)

These are genuine forks the agent must not default (`docs/loop/leverage.md:112-113`
on never defaulting a human's call; `AGENTS.md` "Two rounds, then ask"). They are
recorded here and filed as residuals (R-2); the orchestrator escalates them in
one batch while other work continues. None blocks writing the two role files'
read-only / grounding / registration skeleton, which is what the architect and
implementer can build regardless of the answers.

- **OQ-1 - What does "the past loop" scope to?** The retrospective reads over
  exactly one of: (a) a single backlog group / milestone (e.g. one lettered
  group's commits); (b) a session; or (c) an explicit commit range the owner
  passes at invocation. Pick one; the `loop-retro.md` body binds its evidence
  window to that answer. (Recommendation: (c) explicit commit range, because it
  is the only scope that is unambiguous from `git log` alone and needs no other
  record to define its boundaries.)
- **OQ-2 - Where is the report delivered?** Exactly one of: (a) returned to the
  owner as the role's message output, writing no file (strictest reading of
  "without making any changes"); or (b) written as one new `docs/` report file
  the owner reads. This decides whether AC-4's governed set has to carve out the
  report file. (Recommendation: (b) a single named report file, so the
  retrospective is itself a durable CORPUS artifact a later retro can read back -
  but it is the owner's call because (a) is the literal reading of the sentence.)
- **OQ-3 - Author tier: Opus or Sonnet?** See AC-6. (Recommendation: Opus, for
  the omission-blind-spot reason; the owner may reduce to Sonnet to save ~1.5x on
  the authoring pass.)
- **OQ-4 - Trigger: automatic per-milestone, or on-demand?** Exactly one of: (a)
  the retrospective runs automatically at each group's push / milestone; or (b)
  only when the owner asks. This interacts with AC-5's placement (a per-milestone
  trigger wants a line in the loop sequence in `DEV_LOOP.md`; an on-demand role
  wants only the tier-table registration). (Recommendation: (b) on-demand first,
  promote to (a) once the roles have proven their output on one real loop.)

## Residual register

Each residual carries owner, instrument, and the step that will measure it. A
residual missing any of the three is a deletion; none below is. **These must be
filed as rows in `docs/BACKLOG.md` by the orchestrator** (this seat does not
write the backlog under concurrency); until then they exist only in this
document, which `iteration-caps.md:36-37` counts as not yet real.

| id | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| R-1 | No machine removal test for the leverage claim is buildable here (nothing runs the roles under vitest; no component renders - `this-repo.md:240-242`). LEV-1's real proof is a live run. | Owner | Run the two roles over a real loop with one planted ungrounded lesson; confirm the reviewer rejects it, and accepts it only when the grounding-refusal clause is removed | Post-adoption owner verification |
| R-2 | OQ-1..OQ-4 are owner decisions, not agent defaults | Owner | Owner ruling on the four forks | Before the architect fixes the role bodies and registration placement |
| R-3 | Whether a newly added `.claude/agents/` def registers and is dispatchable mid-session (both outcomes recorded - `this-repo.md:316-332`) | Orchestrator | Try the dispatch; fall back to `general-purpose` with an explicit `model` only if it fails | First invocation of either role |
| R-4 | Whether the agent frontmatter supports a read-only `tools:` allowlist here (no sibling uses one; `effort` support also unconfirmed). If supported, it is additive hardening over AC-4's prose clause | Architect / implementer | Add a `tools:` field to one role def and confirm the dispatch honours it; otherwise rely on the prose no-edit clause | Role-file authoring |
| R-5 | The retro-reviewer (AC-3) checks PRESENT lessons for grounding; it cannot catch an OMITTED true lesson. This gap is the whole basis for the author-tier question | Owner (via OQ-3) + owner judgment of a real report | Owner reads a produced report and judges completeness | Post-adoption owner verification |

## Disposition table

Not applicable: this is the first AC version for L-RETRO; no prior criteria were
restructured, so there is nothing to map to kept / handed-over / withdrawn.

## Out of scope for this document (routed, per `docs/loop/seats.md:77-84`)

- The two role briefs' body WORDING (the house-voice prose, the failure-mode
  list each def carries like `loop-ac.md:25-38`), the exact registration edits,
  and whether the roles get `seats.md` blocks / a triage row / a separate loop
  section and where they sit in the loop sequence -> architect.
- Any buildable instrument or oracle (none is buildable here; R-1) and the
  construction of the planted-lesson probe for the owner walk -> test seat.
- Mid-session dispatchability and the tools-allowlist experiment (R-3, R-4),
  and filing R-1..R-5 into `docs/BACKLOG.md` -> orchestrator.
